import { Html, Head, Preview, Body } from "@react-email/components";
import { Banner } from "../components/banner.js";
import { EmailContainer } from "../components/email-container.js";
import { EmailHeader } from "../components/email-header.js";
import { EmailFooter } from "../components/email-footer.js";
import { SectionDivider } from "../components/section-divider.js";
import { FieldGroup } from "../components/field-group.js";
import { CTAButton } from "../components/cta-button.js";
import { colors } from "../styles.js";

// Visual design ported as-is from the old service's sales-lead-v1.tsx ("form
// submitted" template) — same shared components, same design tokens. Thinner
// than the original: no comments block, no submitted/source-page metadata —
// just "here's what was synced" plus an optional CTA button (e.g. linking to
// the client's Mailchimp audience).
//
// Named for Mailchimp specifically rather than generically ("integration
// confirmation") because it only ever serves Mailchimp — a future
// integration type (e.g. Google Sheets, SOL-10) gets its own sibling
// template (google_sheets_confirmation) rather than reusing this one, so a
// generic name would have implied a generality this template doesn't have.
export interface MailchimpConfirmationEmailProps {
  previewText: string;
  clientName: string;
  header: string;
  /** Arbitrary key-value pairs describing what was synced to Mailchimp.
   * Rendered generically via FieldGroup — a future sibling template with a
   * different field shape needs no new rendering code, just its own schema
   * and this same component pattern. */
  fields: Record<string, string>;
  /** Optional — the caller (integration-service) includes these as reserved
   * keys inside `fields` on the wire (see registry.ts's fieldsSchema) when
   * it wants a CTA button, e.g. linking to the client's Mailchimp audience.
   * ctaLabel defaults to "View in Mailchimp" if a URL is given without one. */
  ctaUrl?: string;
  ctaLabel?: string;
  /** Always set by the caller — either the client's own banner (from
   * clients.settings.banner) or the default Sol Software one. There is no
   * "no banner" case. */
  bannerUrl: string;
  bannerHeight?: number;
  bannerWidth?: number;
}

export default function MailchimpConfirmationEmail({
  previewText,
  clientName,
  header,
  fields,
  ctaUrl,
  ctaLabel,
  bannerUrl,
  bannerHeight,
  bannerWidth,
}: MailchimpConfirmationEmailProps) {
  const fieldList = Object.entries(fields).map(([label, value]) => ({ label, value }));

  return (
    <Html>
      <Head>
        <Preview>{previewText}</Preview>
      </Head>
      <Body style={{ backgroundColor: colors.bg, margin: 0, padding: 0 }}>
        <Banner src={bannerUrl} height={bannerHeight} width={bannerWidth} />
        <EmailContainer>
          <EmailHeader subheader={clientName} header={header} />
          {fieldList.length > 0 && <SectionDivider />}
          {fieldList.length > 0 && <FieldGroup fields={fieldList} />}
          {/* variant/radius come from CTAButton's own defaults (black/rounded); size="lg" still overridden explicitly. */}
          {ctaUrl && <CTAButton href={ctaUrl} label={ctaLabel ?? "View in Mailchimp"} size="lg" />}
          <EmailFooter />
        </EmailContainer>
      </Body>
    </Html>
  );
}
