import { Html, Head, Preview, Body } from "@react-email/components";
import { Banner } from "../components/banner.js";
import { EmailContainer } from "../components/email-container.js";
import { EmailHeader } from "../components/email-header.js";
import { EmailFooter } from "../components/email-footer.js";
import { SectionDivider } from "../components/section-divider.js";
import { FieldGroup } from "../components/field-group.js";
import { colors } from "../styles.js";

// Visual design ported as-is from the old service's sales-lead-v1.tsx ("form
// submitted" template) — same shared components, same design tokens. Much
// thinner than the original: a confirmation email doesn't need comments,
// a CTA button, or the metadata block, just "here's what was synced."
export interface IntegrationConfirmationEmailProps {
  previewText: string;
  clientName: string;
  header: string;
  /** Arbitrary key-value pairs describing what was synced — shape varies by
   * integration type (Mailchimp's {email, merge_fields...} today, Google
   * Sheets' column values later via a sibling template). Rendered generically
   * via FieldGroup, so new shapes need no new rendering code. */
  fields: Record<string, string>;
}

export default function IntegrationConfirmationEmail({
  previewText,
  clientName,
  header,
  fields,
}: IntegrationConfirmationEmailProps) {
  const fieldList = Object.entries(fields).map(([label, value]) => ({ label, value }));

  return (
    <Html>
      <Head>
        <Preview>{previewText}</Preview>
      </Head>
      <Body style={{ backgroundColor: colors.bg, margin: 0, padding: 0 }}>
        <Banner />
        <EmailContainer>
          <EmailHeader subheader={clientName} header={header} />
          {fieldList.length > 0 && <SectionDivider />}
          {fieldList.length > 0 && <FieldGroup fields={fieldList} />}
          <EmailFooter />
        </EmailContainer>
      </Body>
    </Html>
  );
}
