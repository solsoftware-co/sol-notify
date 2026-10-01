import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { emailTemplates, type EmailTemplateProps } from "../emails/registry.js";
import { isEmailAddress, type EmailEnvelope, type RequestContext } from "../validators/notification.js";
import { getClient, writeNotificationLog } from "../lib/sol-api.js";
import { sendEmail, type EmailSenderEnv } from "../lib/email-sender.js";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logger.js";
import { parseBannerConfig } from "../lib/banner-config.js";
import { BANNER_CID_SRC, loadBannerAttachment, withHotlinkedBanner } from "../lib/banner-attachment.js";

export class UnknownEmailTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownEmailTemplateError";
  }
}

export class NoValidRecipientsError extends Error {
  constructor(public readonly invalidRecipients: string[]) {
    super("recipients contains no valid email address");
    this.name = "NoValidRecipientsError";
  }
}

export class InvalidTemplateFieldsError extends Error {
  constructor(
    message: string,
    public readonly issues: unknown
  ) {
    super(message);
    this.name = "InvalidTemplateFieldsError";
  }
}

export interface PreparedEmail {
  clientId: string;
  emailTemplate: string;
  /** Only the valid email addresses from the envelope's recipients. */
  recipients: string[];
  /** Recipients that weren't valid email addresses — not sent to, but
   * recorded in the notification log so the address can be fixed at its
   * source (e.g. the email group). */
  droppedRecipients: string[];
  subject: string;
  html: string;
  /** The client's own banner URL, fetched and attached at send time (see
   * lib/banner-attachment.ts). Unset means the default banner. */
  bannerImageUrl?: string;
  context?: RequestContext;
  idempotencyKey?: string;
}

// Synchronous half: validate fields against the template's own schema
// (only possible now that emailTemplate is known), fetch the client, render.
// Callers of this function propagate SolApiNotFoundError (unknown client) as
// a 404 — that's a "this request is broken" condition worth surfacing
// immediately, not deferred to the background.
export async function prepareEmail(
  env: { SOL_API: Fetcher; SOL_API_KEY: string },
  envelope: EmailEnvelope
): Promise<PreparedEmail> {
  const template = emailTemplates[envelope.emailTemplate];
  if (!template) {
    throw new UnknownEmailTemplateError(`Unknown emailTemplate: ${envelope.emailTemplate}`);
  }

  // One bad address would make Resend reject the whole send, so a mistyped
  // address in an email group would stop everyone in it getting the email.
  // Send to the valid addresses instead; only reject when none are left.
  const recipients = envelope.recipients.filter(isEmailAddress);
  const droppedRecipients = envelope.recipients.filter((r) => !isEmailAddress(r));
  if (recipients.length === 0) {
    throw new NoValidRecipientsError(droppedRecipients);
  }
  if (droppedRecipients.length > 0) {
    logger.warn("dropped invalid recipients", {
      clientId: envelope.clientId,
      emailTemplate: envelope.emailTemplate,
      droppedCount: droppedRecipients.length,
    });
  }

  const parsedFields = template.fieldsSchema.safeParse(envelope.fields);
  if (!parsedFields.success) {
    throw new InvalidTemplateFieldsError(
      "fields failed validation for this emailTemplate",
      parsedFields.error.issues
    );
  }

  const client = await getClient(env.SOL_API, env.SOL_API_KEY, envelope.clientId);

  // The banner is always an inline attachment referenced by cid:, never a
  // hosted URL — the image itself (the client's own, or the default for a
  // client with no/invalid banner settings) is only downloaded in
  // deliverEmail, so fetching it never delays this response.
  const banner = parseBannerConfig(client.settings);

  // `template` is a union over every registry entry, so TypeScript can't
  // see that parsedFields.data came from this same entry's fieldsSchema —
  // it would demand fields that satisfy every template's props at once.
  // The pairing is guaranteed above (same `template`), so widen here.
  const Component = template.component as (props: EmailTemplateProps<unknown>) => ReactElement;
  const html = await render(
    Component({
      previewText: envelope.subject,
      clientName: client.name,
      header: envelope.subject,
      fields: parsedFields.data,
      ctaUrl: envelope.cta?.url,
      ctaLabel: envelope.cta?.label,
      bannerUrl: BANNER_CID_SRC,
      bannerHeight: banner.height,
      bannerWidth: banner.width,
    })
  );

  return {
    clientId: envelope.clientId,
    emailTemplate: envelope.emailTemplate,
    recipients,
    droppedRecipients,
    subject: envelope.subject,
    html,
    bannerImageUrl: banner.imageUrl,
    context: envelope.context,
    idempotencyKey: envelope.idempotencyKey,
  };
}

// Backgrounded half: called from inside ctx.waitUntil(), after the response
// has already been sent. Send is retried; the log write is best-effort (a
// failed log write is logged to console but never re-thrown into
// waitUntil — there's no caller left to receive that error).
export async function deliverEmail(
  env: EmailSenderEnv & { SOL_API: Fetcher; SOL_API_KEY: string },
  prepared: PreparedEmail
): Promise<void> {
  const recipientEmail = prepared.recipients.join(", ");

  try {
    // Resolved once, outside withRetry — a send retry shouldn't re-fetch the
    // image. Never throws: if no banner could be downloaded at all, the
    // email goes out with the default banner hotlinked instead.
    const banner = await loadBannerAttachment(prepared.bannerImageUrl);
    const result = await withRetry(() =>
      sendEmail(env, {
        to: prepared.recipients,
        subject: prepared.subject,
        html: banner ? prepared.html : withHotlinkedBanner(prepared.html),
        attachments: banner ? [banner] : [],
        idempotencyKey: prepared.idempotencyKey,
      })
    );

    await logOutcome(env, prepared, "sent", {
      recipientEmail,
      resendId: result.mode === "resend" ? result.resendId : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("email delivery failed permanently", {
      clientId: prepared.clientId,
      emailTemplate: prepared.emailTemplate,
      errorMessage: message,
    });
    await logOutcome(env, prepared, "failed", { recipientEmail, errorMessage: message });
  }
}

async function logOutcome(
  env: { SOL_API: Fetcher; SOL_API_KEY: string },
  prepared: PreparedEmail,
  outcome: "sent" | "failed",
  extra: { recipientEmail: string; resendId?: string | null; errorMessage?: string }
): Promise<void> {
  try {
    await withRetry(() =>
      writeNotificationLog(env.SOL_API, env.SOL_API_KEY, {
        clientId: prepared.clientId,
        // notification-service has no notion of the caller's own workflow —
        // it only knows clientId/subject/emailTemplate — so workflow/eventName
        // identify the log-writer and the notification kind, not a caller
        // business process.
        workflow: "notification-service",
        eventName: prepared.emailTemplate,
        outcome,
        type: "email",
        recipientEmail: extra.recipientEmail,
        subject: prepared.subject,
        resendId: extra.resendId ?? null,
        errorMessage: extra.errorMessage ?? null,
        metadata: {
          recipients: prepared.recipients,
          ...(prepared.droppedRecipients.length > 0 && { droppedRecipients: prepared.droppedRecipients }),
          ...prepared.context,
          ...(prepared.idempotencyKey && { idempotencyKey: prepared.idempotencyKey }),
        },
      })
    );
  } catch (logErr) {
    logger.error("failed to write notification log to sol-api", {
      clientId: prepared.clientId,
      errorMessage: logErr instanceof Error ? logErr.message : String(logErr),
    });
  }
}
