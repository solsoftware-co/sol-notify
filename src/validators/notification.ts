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
export const emailEnvelopeSchema = z.object({
  clientId: z.string().min(1),
  type: z.literal("email"),
  recipients: z.array(z.string().min(1)).min(1),
  subject: z.string().min(1),
  emailTemplate: z.enum(emailTemplateNames),
  fields: z.record(z.string(), z.unknown()),
  cta: z
    .object({
      url: z.string().url(),
      label: z.string().min(1).optional(),
    })
    .optional(),
});

// A one-member discriminated union today — SOL-13 appends a
// slackEnvelopeSchema to this array to add slack support, with no other
// changes to the email path.
export const notificationRequestSchema = z.discriminatedUnion("type", [emailEnvelopeSchema]);

export type EmailEnvelope = z.infer<typeof emailEnvelopeSchema>;
export type NotificationRequest = z.infer<typeof notificationRequestSchema>;
