import { z } from "zod";
import type { ReactElement } from "react";
import MailchimpConfirmationEmail from "./templates/mailchimp-confirmation.js";

// The array is the single source of truth for which templates exist — not
// Object.keys(emailTemplates). This lets both EmailTemplateName and the
// zod enum in validators/notification.ts be derived from the same literal
// tuple with no casts: z.enum() requires a readonly non-empty tuple of
// string literals, which `as const` on an array gives you directly, but
// Object.keys() can never return (TypeScript's own limitation — it always
// types the result as plain string[], even though the runtime value is
// obviously narrower). Record<EmailTemplateName, ...> below then makes
// emailTemplates and this list impossible to drift apart: TypeScript
// rejects a missing or an extra key either way.
export const emailTemplateNames = ["mailchimp_confirmation"] as const;

export type EmailTemplateName = (typeof emailTemplateNames)[number];

interface EmailTemplateDefinition {
  fieldsSchema: z.ZodTypeAny;
  // Minimal shape used only to check emailTemplates below with `satisfies`
  // (every name has an entry, no extra entries) — never the actual type of
  // a `component` value. `props: never` is deliberate: it makes every real
  // template component (whatever its own specific props type) assignable
  // here via contravariance, without that check widening or erasing the
  // object's own inferred type the way a direct type annotation would.
  // (A direct `: Record<EmailTemplateName, EmailTemplateDefinition>`
  // annotation instead of `satisfies` would erase each entry's component to
  // this common (props: never) => X type, which then couldn't actually be
  // *called* with real props anywhere — never accepts no argument at all.)
  component: (props: never) => ReactElement;
}

// emailTemplate -> { fieldsSchema, component }. Adding a template later
// (SOL-10's google_sheets_confirmation, SOL-11's analytics report) is: add
// the name to emailTemplateNames above, then an entry here — `satisfies`
// makes TypeScript reject a missing or an extra key either way, while each
// entry keeps its own precise component type (so email-notification.ts can
// still call it with that template's real props).
//
// mailchimp_confirmation's fields are a generic display bag (whatever was
// synced — email, merge_fields flattened, etc.), rendered as label/value rows
// by FieldGroup. `cta` is not part of this — it's a universal envelope-level
// concern (see validators/notification.ts), the same way `banner` is derived
// once from client settings rather than being a per-template field.
export const emailTemplates = {
  mailchimp_confirmation: {
    fieldsSchema: z.record(z.string(), z.string()),
    component: MailchimpConfirmationEmail,
  },
} satisfies Record<EmailTemplateName, EmailTemplateDefinition>;
