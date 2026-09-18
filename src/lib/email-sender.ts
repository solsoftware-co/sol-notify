import { Resend } from "resend";
import { logger } from "./logger.js";

export interface SendEmailRequest {
  to: string[];
  subject: string;
  html: string;
}

export interface SendEmailResult {
  mode: "mock" | "live";
  resendId: string | null;
}

const FROM_ADDRESS = "notifications@solsoftware.co";

// mock (dev, no network — logs the rendered HTML) vs live (staging +
// production, real Resend send). Staging gets a subject prefix so a
// misdirected send is unmistakable in an inbox; there's no separate
// mailtrap/CID-attachment plumbing to carry over from the old service —
// this service's templates never attach images (see Banner's plain-URL
// simplification).
export async function sendEmail(
  env: { ENVIRONMENT: string; RESEND_API_KEY: string },
  request: SendEmailRequest
): Promise<SendEmailResult> {
  if (env.ENVIRONMENT === "development") {
    logger.info("mock email send", { to: request.to, subject: request.subject });
    console.log(request.html);
    return { mode: "mock", resendId: null };
  }

  const subject = env.ENVIRONMENT === "staging" ? `[STAGING] ${request.subject}` : request.subject;
  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: request.to,
    subject,
    html: request.html,
  });

  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }

  return { mode: "live", resendId: data?.id ?? null };
}
