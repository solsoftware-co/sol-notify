import { describe, it, expect } from "vitest";
import { notificationRequestSchema } from "../../../src/validators/notification.js";

describe("notificationRequestSchema", () => {
  const valid = {
    clientId: "acme-corp",
    type: "email",
    recipients: ["sales@acme.com"],
    subject: "New lead added to Mailchimp",
    emailTemplate: "mailchimp_confirmation",
    fields: { email: "jane@example.com" },
  };

  it("accepts a valid email envelope", () => {
    const result = notificationRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects type: slack — not implemented yet, only the email member exists in the union", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, type: "slack", channelId: "c1", text: "hi" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing clientId", () => {
    const { clientId, ...rest } = valid;
    const result = notificationRequestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty recipients", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, recipients: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a missing subject", () => {
    const { subject, ...rest } = valid;
    const result = notificationRequestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown emailTemplate", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, emailTemplate: "does_not_exist" });
    expect(result.success).toBe(false);
  });

  it("rejects fields that isn't an object", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, fields: "not-an-object" });
    expect(result.success).toBe(false);
  });

  it("accepts fields as an empty object — per-template shape is checked separately, not here", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, fields: {} });
    expect(result.success).toBe(true);
  });

  it("accepts an envelope with no cta at all", () => {
    const result = notificationRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts a cta with just a url", () => {
    const result = notificationRequestSchema.safeParse({
      ...valid,
      cta: { url: "https://us1.admin.mailchimp.com/lists/" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a cta with both url and label", () => {
    const result = notificationRequestSchema.safeParse({
      ...valid,
      cta: { url: "https://us1.admin.mailchimp.com/lists/", label: "View your audience" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a cta.url that isn't a valid URL", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, cta: { url: "not-a-url" } });
    expect(result.success).toBe(false);
  });

  it("rejects a cta.label given without cta.url — a label with no URL is meaningless", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, cta: { label: "View your audience" } });
    expect(result.success).toBe(false);
  });

  it("rejects cta given as a non-object", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, cta: "not-an-object" });
    expect(result.success).toBe(false);
  });

  // prepareEmail drops invalid addresses and sends to the rest, so they
  // aren't rejected at the envelope.
  it("accepts a recipient that isn't an email address", () => {
    const result = notificationRequestSchema.safeParse({ ...valid, recipients: ["sales@acme.com", "sales@acme"] });
    expect(result.success).toBe(true);
  });

  describe("context", () => {
    const formId = "6f1c3b7e-2a4d-4e8f-9b0c-1d2e3f4a5b6c";

    it("accepts a form submission context", () => {
      const result = notificationRequestSchema.safeParse({ ...valid, context: { formId, submissionId: "sub-1" } });
      expect(result.success).toBe(true);
    });

    it("accepts an analytics report context", () => {
      const result = notificationRequestSchema.safeParse({ ...valid, context: { analyticsReportId: "report-1" } });
      expect(result.success).toBe(true);
    });

    it("rejects a formId that isn't a UUID", () => {
      const result = notificationRequestSchema.safeParse({ ...valid, context: { formId: "f1", submissionId: "sub-1" } });
      expect(result.success).toBe(false);
    });

    it("rejects a context matching neither shape", () => {
      const result = notificationRequestSchema.safeParse({ ...valid, context: { submissionId: "sub-1" } });
      expect(result.success).toBe(false);
    });
  });

  describe("idempotencyKey", () => {
    it("accepts a key", () => {
      const result = notificationRequestSchema.safeParse({ ...valid, idempotencyKey: "sub-1:channel-1" });
      expect(result.success).toBe(true);
    });

    it("rejects an empty key", () => {
      const result = notificationRequestSchema.safeParse({ ...valid, idempotencyKey: "" });
      expect(result.success).toBe(false);
    });

    it("rejects a key over 200 characters, leaving room for the environment prefix within Resend's 256", () => {
      const result = notificationRequestSchema.safeParse({ ...valid, idempotencyKey: "k".repeat(201) });
      expect(result.success).toBe(false);
    });
  });
});
