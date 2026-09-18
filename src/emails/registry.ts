import { z } from "zod";
import MailchimpConfirmationEmail from "./templates/mailchimp-confirmation.js";

// emailTemplate -> { fieldsSchema, component }. Adding a template later
// (SOL-10's google_sheets_confirmation, SOL-11's analytics report) is a
// three-line addition here plus one new schema/component file — nothing
// elsewhere changes.
//
// mailchimp_confirmation's fields are mostly a generic display bag (whatever
// was synced — email, merge_fields flattened, etc.), but ctaUrl/ctaLabel are
// reserved keys consumed by the CTA button rather than rendered as a visible
// field row. .catchall() types every other key as a display-field string
// while still validating the two reserved keys with their own rules.
export const emailTemplates = {
  mailchimp_confirmation: {
    fieldsSchema: z
      .object({
        ctaUrl: z.string().url().optional(),
        ctaLabel: z.string().min(1).optional(),
      })
      .catchall(z.string()),
    component: MailchimpConfirmationEmail,
  }
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;

export const emailTemplateNames = Object.keys(emailTemplates) as EmailTemplateName[];
