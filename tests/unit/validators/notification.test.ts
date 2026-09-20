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
});
