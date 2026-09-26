import { Resend } from "resend";
import { logger } from "./logger.js";
import { setLastEmailPreview } from "./email-preview-store.js";
import { parseEnvironment } from "./environment.js";
import { NonRetryableError, isRetryableStatus } from "./retry.js";

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content. */
  content: string;
  contentType: string;
  /** Sent inline, referenced from the HTML as `cid:<contentId>`. */
  contentId: string;
}

export interface SendEmailRequest {
  to: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}

// Discriminated on `mode` so each provider's id is only present — and
// non-null — for that provider's sends.
export type SendEmailResult =
  | { mode: "mock" }
  | { mode: "mailtrap"; mailtrapMessageIds: string[] }
  | { mode: "resend"; resendId: string };

export interface EmailSenderEnv {
  ENVIRONMENT: string;
  RESEND_API_KEY: string;
  MAILTRAP_API_TOKEN?: string;
  MAILTRAP_INBOX_ID?: string;
}

const FROM_ADDRESS = "notifications@solsoftware.co";
const MAILTRAP_SANDBOX_SEND_URL = "https://sandbox.api.mailtrap.io/api/send";

// Three send modes, picked by ENVIRONMENT (see lib/environment.ts):
//   - development → mock: no network, the rendered HTML is held in memory
//     and served at /__preview/last-email.
//   - preview (ephemeral per-PR Workers, SOL-17) → mailtrap: real delivery
//     into a Mailtrap sandbox inbox that no real mailbox receives from, so
//     PR previews are never a spam risk but tests/e2e can still poll it and
//     assert on the actual rendered HTML.
//   - staging + production → resend: real Resend send. Staging gets a subject
//     prefix so a misdirected send is unmistakable in an inbox.
// The switch is exhaustive over Environment, and parseEnvironment throws on
// anything else — there's no fallthrough to a live send.
export async function sendEmail(env: EmailSenderEnv, request: SendEmailRequest): Promise<SendEmailResult> {
  const environment = parseEnvironment(env.ENVIRONMENT);

  switch (environment) {
    case "development":
      setLastEmailPreview(inlineAttachmentsForPreview(request.html, request.attachments));
      logger.info("mock email send", {
        to: request.to,
        subject: request.subject,
        preview: "http://localhost:8788/__preview/last-email",
      });
      return { mode: "mock" };
    case "preview":
      return sendViaMailtrap(env, request);
    case "staging":
      return sendViaResend(env, { ...request, subject: `[STAGING] ${request.subject}` });
    case "production":
      return sendViaResend(env, request);
  }
}

async function sendViaResend(env: EmailSenderEnv, request: SendEmailRequest): Promise<SendEmailResult> {
  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: request.to,
    subject: request.subject,
    html: request.html,
    attachments: request.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      contentId: a.contentId,
    })),
  });

  if (error) {
    const message = `Resend send failed: ${error.message}`;
    throw isRetryableStatus(error.statusCode) ? new Error(message) : new NonRetryableError(message);
  }

  // Resend's response is itself a discriminated union — once `error` is
  // null, `data` is guaranteed.
  return { mode: "resend", resendId: data.id };
}

// Mailtrap's sandbox HTTP Sending API rather than nodemailer + SMTP (the old
// service's approach): nodemailer needs Node's raw TCP sockets, which the
// Workers runtime doesn't provide, whereas this is a plain fetch.
async function sendViaMailtrap(env: EmailSenderEnv, request: SendEmailRequest): Promise<SendEmailResult> {
  if (!env.MAILTRAP_API_TOKEN || !env.MAILTRAP_INBOX_ID) {
    throw new NonRetryableError("MAILTRAP_API_TOKEN and MAILTRAP_INBOX_ID are required in preview");
  }

  const response = await fetch(`${MAILTRAP_SANDBOX_SEND_URL}/${encodeURIComponent(env.MAILTRAP_INBOX_ID)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MAILTRAP_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { email: FROM_ADDRESS },
      to: request.to.map((email) => ({ email })),
      subject: `[PREVIEW] ${request.subject}`,
      html: request.html,
      attachments: request.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        type: a.contentType,
        disposition: "inline",
        content_id: a.contentId,
      })),
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | { success: true; message_ids: string[] }
    | { success: false; errors: string[] }
    | null;

  if (!response.ok || !body?.success) {
    const detail = body && !body.success ? body.errors.join("; ") : `HTTP ${response.status}`;
    const message = `Mailtrap send failed (HTTP ${response.status}): ${detail}`;
    throw isRetryableStatus(response.status) ? new Error(message) : new NonRetryableError(message);
  }

  return { mode: "mailtrap", mailtrapMessageIds: body.message_ids };
}

// A browser can't resolve cid: references, so for the local
// /__preview/last-email page only, inline attachments are swapped for data:
// URIs. Never used for a real send — Gmail strips data: URI images.
function inlineAttachmentsForPreview(html: string, attachments: EmailAttachment[] = []): string {
  return attachments.reduce(
    (out, a) => out.replaceAll(`cid:${a.contentId}`, `data:${a.contentType};base64,${a.content}`),
    html
  );
}
