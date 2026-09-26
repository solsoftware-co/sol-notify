import { MailtrapClient } from "mailtrap";

// Ported from sol-notification-service's tests/e2e/email/helpers/mailtrap.ts.

export interface MailtrapMessage {
  id: number;
  subject: string;
  to_email: string;
  from_email: string;
  created_at: string;
  html_body: string;
}

/** Testing API attachment metadata. The package's top-level `Attachment`
 * export is the *sending* attachment shape, so this is derived instead. */
export type MailtrapAttachment = Awaited<ReturnType<MailtrapClient["testing"]["attachments"]["getList"]>>[number];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} environment variable is required`);
  return value;
}

function getClient(): MailtrapClient {
  return new MailtrapClient({
    token: requireEnv("MAILTRAP_API_TOKEN"),
    accountId: Number(requireEnv("MAILTRAP_ACCOUNT_ID")),
  });
}

function getInboxId(): number {
  return Number(requireEnv("MAILTRAP_INBOX_ID"));
}

/**
 * Returns the list of attachments for a given message ID.
 */
export async function getEmailAttachments(messageId: number): Promise<MailtrapAttachment[]> {
  return getClient().testing.attachments.getList(getInboxId(), messageId);
}

/**
 * Polls the Mailtrap sandbox inbox until an email matching `subjectPattern`
 * arrives with a `created_at` timestamp >= `triggeredAt`, then fetches its
 * HTML body separately (the list endpoint doesn't include it).
 *
 * The timestamp window keeps concurrent PR runs sharing one free-tier inbox
 * from picking up each other's emails. Callers should also put a per-run
 * unique token in the subject, which makes that separation exact.
 */
export async function waitForEmail(
  subjectPattern: RegExp,
  triggeredAt: Date,
  timeoutMs = 90_000,
  intervalMs = 3_000
): Promise<MailtrapMessage> {
  const client = getClient();
  const inboxId = getInboxId();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const messages = await client.testing.messages.get(inboxId);

    const match = messages.find(
      (m) => new Date(m.created_at) >= triggeredAt && subjectPattern.test(m.subject)
    );

    if (match) {
      const html_body = await client.testing.messages.getHtmlMessage(inboxId, match.id);
      return {
        id: match.id,
        subject: match.subject,
        to_email: match.to_email,
        from_email: match.from_email,
        created_at: match.created_at,
        html_body,
      };
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `Email matching /${subjectPattern.source}/ not received within ${timeoutMs}ms` +
      ` (triggered at ${triggeredAt.toISOString()})`
  );
}
