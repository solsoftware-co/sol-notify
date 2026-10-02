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
import type { EmailTemplateProps, FormSubmissionFields } from "../registry.js";

// The one template every Sol Gate form uses (SOL-34): the form notifies its
// channels after its integrations have run, so one email reports both the
// submission and what happened to each integration. Forms differ in data,
// not layout, and Sol Gate never picks a template by integration count —
// this component adapts instead:
//
// - 0 integrations: fields + the envelope's cta ("Reply to {name}", a
//   mailto: Sol Gate builds when the form has an email field).
// - 1 integration: mailchimp_confirmation's look — fields + one "View in
//   {typeLabel}" button (the service, e.g. "Mailchimp" — not the
//   integration's own name, which the client may not recognise). The
//   envelope's cta is not shown, so there's only ever one button. A failed
//   or skipped integration (or one with no link) shows its status and reason
//   as a single results row instead, with no button.
// - 2+ integrations: fields, then the IntegrationResults table (per-row
//   "View →" links, rows labelled by name so two of one type stay
//   distinct), then the envelope's cta as the single primary button.
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
  const hasFields = fieldList.length > 0;

  const integrations = fields.integrations ?? [];
  const hasMultipleIntegrations = integrations.length > 1;
  const singleIntegration = integrations.length === 1 ? integrations[0] : undefined;

  // A single integration's button needs a write that worked and a link to it.
  const singleIntegrationButton =
    singleIntegration?.outcome === "succeeded" && singleIntegration.url
      ? { href: singleIntegration.url, label: `View in ${singleIntegration.typeLabel ?? singleIntegration.name}` }
      : undefined;

  // The envelope's cta ("Reply to {name}") — only when Sol Gate sent one.
  const replyButton = ctaUrl ? { href: ctaUrl, label: ctaLabel ?? "Reply" } : undefined;

  // A single integration without a button is shown as a results row instead.
  const showResults = hasMultipleIntegrations || (singleIntegration !== undefined && !singleIntegrationButton);

  // Only ever one button. With a single integration it's that integration's
  // (or none, if it has no button) — never the reply button.
  const ctaButton = singleIntegration ? singleIntegrationButton : replyButton;

  return (
    <Html>
      <Head>
        <Preview>{previewText}</Preview>
      </Head>
      <Body style={{ backgroundColor: colors.bg, margin: 0, padding: 0 }}>
        <Banner src={bannerUrl} height={bannerHeight} width={bannerWidth} />
        <EmailContainer>
          <EmailHeader subheader={clientName} header={header} />
          {hasFields && <SectionDivider />}
          {hasFields && <FieldGroup fields={fieldList} />}
          {showResults && <SectionDivider />}
          {showResults && <IntegrationResults integrations={integrations} />}
          {ctaButton && <CTAButton href={ctaButton.href} label={ctaButton.label} size="lg" />}
          <EmailFooter />
        </EmailContainer>
      </Body>
    </Html>
  );
}
