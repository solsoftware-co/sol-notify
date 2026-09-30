import { describe, it, expect } from "vitest";
import { render } from "@react-email/render";
import FormSubmissionEmail from "../../../src/emails/templates/form-submission.js";
import { emailTemplates, type FormSubmissionFields } from "../../../src/emails/registry.js";

const submission = { name: "Jane Doe", email: "jane@example.com", message: "Looking for a quote" };
const replyCta = { ctaUrl: "mailto:jane@example.com", ctaLabel: "Reply to Jane Doe" };

function renderEmail(fields: FormSubmissionFields, cta: { ctaUrl?: string; ctaLabel?: string } = replyCta) {
  return render(
    FormSubmissionEmail({
      previewText: "New contact form submission",
      clientName: "Acme Corp",
      header: "New contact form submission",
      fields,
      bannerUrl: "cid:banner_image",
      ...cta,
    })
  );
}

// The rendered HTML has one anchor per link; counting hrefs is how these
// tests tell a CTA button apart from the table's "View →" text links.
const hrefCount = (html: string) => (html.match(/<a href=/g) ?? []).length;

const mailchimp = { name: "Mailchimp", outcome: "succeeded" as const, url: "https://us1.admin.mailchimp.com/m/1" };
const sheets = { name: "Google Sheets", outcome: "succeeded" as const, url: "https://docs.google.com/spreadsheets/d/1" };

describe("form_submission fieldsSchema", () => {
  const schema = emailTemplates.form_submission.fieldsSchema;

  it("accepts a submission with no integrations", () => {
    expect(schema.safeParse({ submission }).success).toBe(true);
  });

  it("accepts integrations without url or detail", () => {
    expect(schema.safeParse({ submission, integrations: [{ name: "Mailchimp", outcome: "failed" }] }).success).toBe(true);
  });

  it("rejects an unknown outcome", () => {
    expect(schema.safeParse({ submission, integrations: [{ name: "Mailchimp", outcome: "done" }] }).success).toBe(false);
  });

  it("rejects an integration url that isn't a URL", () => {
    expect(
      schema.safeParse({ submission, integrations: [{ name: "Mailchimp", outcome: "succeeded", url: "nope" }] }).success
    ).toBe(false);
  });

  it("rejects fields without a submission", () => {
    expect(schema.safeParse({ email: "jane@example.com" }).success).toBe(false);
  });
});

describe("FormSubmissionEmail", () => {
  describe("0 integrations", () => {
    it("renders the submitted fields and the Reply button, and no results table", async () => {
      const html = await renderEmail({ submission });
      for (const [label, value] of Object.entries(submission)) {
        expect(html).toContain(label);
        expect(html).toContain(value);
      }
      expect(html).toContain('href="mailto:jane@example.com"');
      expect(html).toContain("Reply to Jane Doe");
      expect(html).not.toContain("Integrations");
    });

    it("treats an empty integrations array the same as none", async () => {
      const html = await renderEmail({ submission, integrations: [] });
      expect(html).toContain("Reply to Jane Doe");
      expect(html).not.toContain("Integrations");
    });

    it("renders no button when there's no cta", async () => {
      const html = await renderEmail({ submission }, {});
      expect(hrefCount(html)).toBe(0);
    });
  });

  describe("1 integration", () => {
    it("renders a single View in {name} button instead of the Reply button", async () => {
      const html = await renderEmail({ submission, integrations: [mailchimp] });
      expect(html).toContain(`href="${mailchimp.url}"`);
      expect(html).toContain("View in Mailchimp");
      expect(html).not.toContain("Reply to Jane Doe");
      expect(html).not.toContain("Integrations");
      expect(hrefCount(html)).toBe(1);
    });

    it("shows a failed integration's status and reason instead of a button", async () => {
      const html = await renderEmail({
        submission,
        integrations: [{ name: "Mailchimp", outcome: "failed", detail: "Audience not found" }],
      });
      expect(html).toContain("Integrations");
      expect(html).toContain("✗ Failed");
      expect(html).toContain("Audience not found");
      expect(html).not.toContain("View in Mailchimp");
      expect(hrefCount(html)).toBe(0);
    });

    it("shows a skipped integration's status instead of a button", async () => {
      const html = await renderEmail({ submission, integrations: [{ name: "Mailchimp", outcome: "skipped" }] });
      expect(html).toContain("Skipped");
      expect(hrefCount(html)).toBe(0);
    });

    it("shows a status row when a succeeded integration has no link", async () => {
      const html = await renderEmail({ submission, integrations: [{ name: "Mailchimp", outcome: "succeeded" }] });
      expect(html).toContain("✓ Added");
      expect(hrefCount(html)).toBe(0);
    });

    it("omits the failure summary line for a single row", async () => {
      const html = await renderEmail({ submission, integrations: [{ name: "Mailchimp", outcome: "failed" }] });
      expect(html).not.toContain("integrations failed");
    });
  });

  describe("2+ integrations", () => {
    it("renders a results table with a View → link per row and Reply as the only button", async () => {
      const html = await renderEmail({ submission, integrations: [mailchimp, sheets] });
      expect(html).toContain("Integrations");
      expect(html).toContain("Mailchimp");
      expect(html).toContain("Google Sheets");
      expect(html.match(/View →/g)).toHaveLength(2);
      expect(html).toContain(`href="${mailchimp.url}"`);
      expect(html).toContain(`href="${sheets.url}"`);
      expect(html).not.toContain("View in Mailchimp");
      expect(html).toContain("Reply to Jane Doe");
      expect(hrefCount(html)).toBe(3);
    });

    it("renders a failed row with its detail, and the failure summary above the table", async () => {
      const html = await renderEmail({
        submission,
        integrations: [mailchimp, { name: "Google Sheets", outcome: "failed", detail: "Spreadsheet permission denied" }],
      });
      expect(html).toContain("✗ Failed");
      expect(html).toContain("Spreadsheet permission denied");
      expect(html).toContain("1 of 2 integrations failed");
      expect(html.indexOf("1 of 2 integrations failed")).toBeLessThan(html.indexOf("Google Sheets"));
    });

    it("omits the failure summary when nothing failed", async () => {
      const html = await renderEmail({
        submission,
        integrations: [mailchimp, { name: "Google Sheets", outcome: "skipped" }],
      });
      expect(html).not.toContain("integrations failed");
    });

    it("renders no View → link for a row without a url", async () => {
      const html = await renderEmail({
        submission,
        integrations: [mailchimp, { name: "Google Sheets", outcome: "failed" }],
      });
      expect(html.match(/View →/g)).toHaveLength(1);
    });
  });

  it.each([
    ["0 integrations", { submission }],
    ["1 integration, bare", { submission, integrations: [{ name: "Mailchimp", outcome: "failed" as const }] }],
    ["2+ integrations, bare", {
      submission,
      integrations: [{ name: "Mailchimp", outcome: "succeeded" as const }, { name: "Google Sheets", outcome: "skipped" as const }],
    }],
  ])("leaks no template syntax or serialisation artefacts (%s)", async (_, fields) => {
    const html = await renderEmail(fields, {});
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("{{");
    expect(html).not.toContain("}}");
    expect(html).not.toContain(">null<");
    expect(html).not.toContain("[object Object]");
  });
});
