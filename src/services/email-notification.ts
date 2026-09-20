import { render } from "@react-email/render";
import { emailTemplates } from "../emails/registry.js";
import type { EmailEnvelope } from "../validators/notification.js";
import { getClient, writeNotificationLog } from "../lib/sol-api.js";
import { sendEmail } from "../lib/email-sender.js";
import { withRetry } from "../lib/retry.js";
import { logger } from "../lib/logger.js";
import { parseBannerConfig, DEFAULT_BANNER_URL } from "../lib/banner-config.js";

export class UnknownEmailTemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownEmailTemplateError";
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
  recipients: string[];
  subject: string;
  html: string;
}

// Synchronous half: validate fields against the template's own schema
// (only possible now that emailTemplate is known), fetch the client, render.
// Callers of this function propagate SolApiNotFoundError (unknown client) as
// a 404 — that's a "this request is broken" condition worth surfacing
// immediately, not deferred to the background.
export async function prepareEmail(
  env: { SOL_API_URL: string; SOL_API_KEY: string },
  envelope: EmailEnvelope
): Promise<PreparedEmail> {
  const template = emailTemplates[envelope.emailTemplate as keyof typeof emailTemplates];
  if (!template) {
    throw new UnknownEmailTemplateError(`Unknown emailTemplate: ${envelope.emailTemplate}`);
  }

  const parsedFields = template.fieldsSchema.safeParse(envelope.fields);
  if (!parsedFields.success) {
    throw new InvalidTemplateFieldsError(
      "fields failed validation for this emailTemplate",
      parsedFields.error.issues
    );
  }

  const client = await getClient(env.SOL_API_URL, env.SOL_API_KEY, envelope.clientId);

  // A client's own banner overrides the default Sol Software one; a client
  // with no (or invalid) banner settings still gets a banner, just the
  // default — matching the old service's behavior, where a banner was never
  // simply absent.
  const banner = parseBannerConfig(client.settings);

  //   are reserved keys the caller may include in `fields` to
  // get a CTA button rendered (e.g. linking to the client's Mailchimp
  // audience) — they're consumed here, not passed through to FieldGroup as
  // a visible field row.
  const { ctaUrl, ctaLabel, ...displayFields } = parsedFields.data as Record<string, string | undefined>;

  const Component = template.component;
  const html = await render(
    Component({
      previewText: envelope.subject,
      clientName: client.name,
      header: envelope.subject,
      fields: displayFields as Record<string, string>,
      ctaUrl,
      ctaLabel,
      bannerUrl: banner.imageUrl ?? DEFAULT_BANNER_URL,
      bannerHeight: banner.height,
      bannerWidth: banner.width,
    })
  );

  return {
    clientId: envelope.clientId,
    emailTemplate: envelope.emailTemplate,
    recipients: envelope.recipients,
    subject: envelope.subject,
    html,
  };
}

// Backgrounded half: called from inside ctx.waitUntil(), after the response
// has already been sent. Send is retried; the log write is best-effort (a
// failed log write is logged to console but never re-thrown into
// waitUntil — there's no caller left to receive that error).
export async function deliverEmail(
  env: { ENVIRONMENT: string; RESEND_API_KEY: string; SOL_API_URL: string; SOL_API_KEY: string },
  prepared: PreparedEmail
): Promise<void> {
  const recipientEmail = prepared.recipients.join(", ");

  try {
    const result = await withRetry(() =>
      sendEmail(env, { to: prepared.recipients, subject: prepared.subject, html: prepared.html })
    );

    await logOutcome(env, prepared, "sent", { recipientEmail, resendId: result.resendId });
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
  env: { SOL_API_URL: string; SOL_API_KEY: string },
  prepared: PreparedEmail,
  outcome: "sent" | "failed",
  extra: { recipientEmail: string; resendId?: string | null; errorMessage?: string }
): Promise<void> {
  try {
    await withRetry(() =>
      writeNotificationLog(env.SOL_API_URL, env.SOL_API_KEY, {
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
        metadata: { recipients: prepared.recipients },
      })
    );
  } catch (logErr) {
    logger.error("failed to write notification log to sol-api", {
      clientId: prepared.clientId,
      errorMessage: logErr instanceof Error ? logErr.message : String(logErr),
    });
  }
}
