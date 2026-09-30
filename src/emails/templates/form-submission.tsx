import { Html, Head, Preview, Body } from "@react-email/components";
import { Banner } from "../components/banner.js";
import { EmailContainer } from "../components/email-container.js";
import { EmailHeader } from "../components/email-header.js";
import { EmailFooter } from "../components/email-footer.js";
import { SectionDivider } from "../components/section-divider.js";
import { FieldGroup } from "../components/field-group.js";
import { CTAButton } from "../components/cta-button.js";
import { IntegrationResults } from "../components/integration-results.js";
import { colors } from "../styles.js";
import type { EmailTemplateProps } from "../template-props.js";
import type { FormSubmissionFields } from "../registry.js";

// The one template every Sol Gate form uses (SOL-34): the form notifies its
// channels after its integrations have run, so one email reports both the
// submission and what happened to each integration. Forms differ in data,
// not layout, and Sol Gate never picks a template by integration count —
// this component adapts instead:
//
// - 0 integrations: fields + the envelope's cta ("Reply to {name}", a
//   mailto: Sol Gate builds when the form has an email field).
// - 1 integration: mailchimp_confirmation's look — fields + one "View in
//   {name}" button. The envelope's cta is not shown, so there's only ever
//   one button. A failed or skipped integration (or one with no link) shows
//   its status and reason as a single results row instead.
// - 2+ integrations: fields, then the IntegrationResults table (per-row
//   "View →" links), then the envelope's cta as the single primary button.
export type FormSubmissionEmailProps = EmailTemplateProps<FormSubmissionFields>;

export default function FormSubmissionEmail({
  previewText,
  clientName,
  header,
  fields,
  ctaUrl,
  ctaLabel,
  bannerUrl,
  bannerHeight,
  bannerWidth,
}: FormSubmissionEmailProps) {
  const fieldList = Object.entries(fields.submission).map(([label, value]) => ({ label, value }));
  const integrations = fields.integrations ?? [];

  const only = integrations.length === 1 ? integrations[0] : undefined;
  const integrationButton =
    only?.outcome === "succeeded" && only.url ? { href: only.url, label: `View in ${only.name}` } : undefined;
  const showResults = integrations.length > 1 || (only !== undefined && !integrationButton);
  const button =
    integrations.length === 1 ? integrationButton : ctaUrl ? { href: ctaUrl, label: ctaLabel ?? "Reply" } : undefined;

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
          {showResults && <SectionDivider />}
          {showResults && <IntegrationResults integrations={integrations} />}
          {button && <CTAButton href={button.href} label={button.label} size="lg" />}
          <EmailFooter />
        </EmailContainer>
      </Body>
    </Html>
  );
}
