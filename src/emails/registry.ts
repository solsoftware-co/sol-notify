import { z } from "zod";
import MailchimpConfirmationEmail from "./templates/mailchimp-confirmation.js";

// emailTemplate -> { fieldsSchema, component }. Adding a template later
// (SOL-10's google_sheets_confirmation, SOL-11's analytics report) is a
// three-line addition here plus one new schema/component file — nothing
// elsewhere changes.
export const emailTemplates = {
  mailchimp_confirmation: {
    fieldsSchema: z.record(z.string(), z.string()),
    component: MailchimpConfirmationEmail,
  }
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;

export const emailTemplateNames = Object.keys(emailTemplates) as EmailTemplateName[];
