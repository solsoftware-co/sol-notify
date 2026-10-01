import { z } from "zod";
import { emailTemplateNames } from "../emails/registry.js";

// Envelope validation only checks the top-level shape — `fields` is accepted
// as a generic object here, not yet inspected against its template-specific
// schema (that only happens once `emailTemplate` is known, a separate step
// in services/email-notification.ts).
//
// `cta` lives here, not inside any template's fieldsSchema: it's presentation
// config (which button, if any, to show), not template-specific business
// data, so it applies uniformly to every emailTemplate value the same way
// `subject` does — mirrors how the banner is already handled (derived once,
// passed to whichever template renders, never part of a template's own
// fields contract). `url` is required once `cta` is present at all — a
// label with no URL is meaningless.
// Why a notification was sent, so it can be traced across Sol Gate,
// sol-integrate and sol-notify: a form submission, or (SOL-12) an analytics
// report run. Copied into the notification log's metadata as-is, in the same
// shape sol-integrate logs it.
export const requestContextSchema = z.union([
  z.object({ formId: z.string().uuid(), submissionId: z.string().min(1) }),
  z.object({ analyticsReportId: z.string().min(1) }),
]);

export const emailEnvelopeSchema = z.object({
  clientId: z.string().min(1),
  type: z.literal("email"),
  // A mistyped address in an email group fails here, at the request, rather
  // than later as a failed send.
  recipients: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  emailTemplate: z.enum(emailTemplateNames),
  fields: z.record(z.string(), z.unknown()),
  cta: z
    .object({
      url: z.string().url(),
      label: z.string().min(1).optional(),
    })
    .optional(),
  context: requestContextSchema.optional(),
  // Callers send from background work that can retry (e.g. Sol Gate uses
  // `submissionId:channelId`). Passed to Resend, which sends once per key
  // within 24 hours, so a retried request doesn't email anyone twice. Resend
  // allows 256 characters; this leaves room for the environment prefix
  // email-sender.ts adds.
  idempotencyKey: z.string().min(1).max(200).optional(),
});

// A one-member discriminated union today — SOL-13 appends a
// slackEnvelopeSchema to this array to add slack support, with no other
// changes to the email path.
export const notificationRequestSchema = z.discriminatedUnion("type", [emailEnvelopeSchema]);

export type EmailEnvelope = z.infer<typeof emailEnvelopeSchema>;
export type RequestContext = z.infer<typeof requestContextSchema>;
export type NotificationRequest = z.infer<typeof notificationRequestSchema>;
