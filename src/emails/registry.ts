import { z } from "zod";
import IntegrationConfirmationEmail from "./templates/integration-confirmation.js";

// emailTemplate -> { fieldsSchema, component }. Adding a template later
// (SOL-10's integration_confirmation_sheets, SOL-11's analytics report) is a
// three-line addition here plus one new schema/component file — nothing
// elsewhere changes.
export const emailTemplates = {
  integration_confirmation: {
    fieldsSchema: z.record(z.string(), z.string()),
    component: IntegrationConfirmationEmail,
  },
} as const;

export type EmailTemplateName = keyof typeof emailTemplates;

export const emailTemplateNames = Object.keys(emailTemplates) as EmailTemplateName[];
