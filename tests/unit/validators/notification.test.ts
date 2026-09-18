import { describe, it, expect } from "vitest";
import { notificationRequestSchema } from "../../../src/validators/notification.js";

describe("notificationRequestSchema", () => {
  const valid = {
    clientId: "acme-corp",
    type: "email",
    recipients: ["sales@acme.com"],
    subject: "New lead added to Mailchimp",
    emailTemplate: "integration_confirmation",
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
});
