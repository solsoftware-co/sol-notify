// The props prepareEmail() passes to every template component. Everything
// but `fields` is the same for every template (client name, subject, the
// envelope's cta, the banner); `fields` is whatever that template's own
// fieldsSchema parsed (see registry.ts).
export interface EmailTemplateProps<TFields> {
  previewText: string;
  clientName: string;
  header: string;
  fields: TFields;
  ctaUrl?: string;
  ctaLabel?: string;
  /** Always the inline attachment reference ("cid:banner_image"). */
  bannerUrl: string;
  bannerHeight?: number;
  bannerWidth?: number;
}
