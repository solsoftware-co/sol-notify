import { describe, it, expect, vi, beforeEach } from "vitest";

const getClientMock = vi.fn();
const writeNotificationLogMock = vi.fn();
vi.mock("../../../src/lib/sol-api.js", async () => {
  const actual = await vi.importActual<typeof import("../../../src/lib/sol-api.js")>(
    "../../../src/lib/sol-api.js"
  );
  return {
    ...actual,
    getClient: (...args: unknown[]) => getClientMock(...args),
    writeNotificationLog: (...args: unknown[]) => writeNotificationLogMock(...args),
  };
});

const sendEmailMock = vi.fn();
vi.mock("../../../src/lib/email-sender.js", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

const { prepareEmail, deliverEmail, UnknownEmailTemplateError, InvalidTemplateFieldsError } = await import(
  "../../../src/services/email-notification.js"
);
const { SolApiNotFoundError } = await import("../../../src/lib/sol-api.js");

const SOL_API_ENV = { SOL_API_URL: "https://sol-api.test", SOL_API_KEY: "test-key" };
const FULL_ENV = { ENVIRONMENT: "development", RESEND_API_KEY: "re_test", ...SOL_API_ENV };

const baseEnvelope = {
  clientId: "acme-corp",
  type: "email" as const,
  recipients: ["sales@acme.com"],
  subject: "New lead added to Mailchimp",
  emailTemplate: "mailchimp_confirmation",
  fields: { email: "jane@example.com" },
};

beforeEach(() => {
  getClientMock.mockReset();
  writeNotificationLogMock.mockReset();
  sendEmailMock.mockReset();
  getClientMock.mockResolvedValue({
    id: "acme-corp",
    name: "Acme Corp",
    email: "contact@acme.com",
    active: true,
    settings: {},
    timezone: "America/Chicago",
    createdAt: "2026-01-01T00:00:00Z",
  });
});

describe("prepareEmail", () => {
  it("fetches the client and renders HTML for a valid envelope", async () => {
    const prepared = await prepareEmail(SOL_API_ENV, baseEnvelope);
    expect(getClientMock).toHaveBeenCalledWith(SOL_API_ENV.SOL_API_URL, SOL_API_ENV.SOL_API_KEY, "acme-corp");
    expect(prepared.clientId).toBe("acme-corp");
    expect(prepared.emailTemplate).toBe("mailchimp_confirmation");
    expect(prepared.recipients).toEqual(["sales@acme.com"]);
    expect(prepared.html).toContain("Acme Corp");
    expect(prepared.html.toLowerCase()).toContain("jane@example.com");
  });

  it("throws UnknownEmailTemplateError for an emailTemplate not in the registry", async () => {
    await expect(
      prepareEmail(SOL_API_ENV, { ...baseEnvelope, emailTemplate: "does_not_exist" })
    ).rejects.toBeInstanceOf(UnknownEmailTemplateError);
  });

  it("throws InvalidTemplateFieldsError when fields don't match the template's schema", async () => {
    await expect(
      prepareEmail(SOL_API_ENV, { ...baseEnvelope, fields: { count: 5 } as unknown as Record<string, string> })
    ).rejects.toBeInstanceOf(InvalidTemplateFieldsError);
  });

  it("propagates SolApiNotFoundError when the client doesn't exist", async () => {
    getClientMock.mockRejectedValue(new SolApiNotFoundError("Client not found: acme-corp"));
    await expect(prepareEmail(SOL_API_ENV, baseEnvelope)).rejects.toBeInstanceOf(SolApiNotFoundError);
  });
});

describe("deliverEmail", () => {
  const prepared = {
    clientId: "acme-corp",
    emailTemplate: "mailchimp_confirmation",
    recipients: ["sales@acme.com"],
    subject: "New lead added to Mailchimp",
    html: "<html></html>",
  };

  it("logs outcome sent on a successful send", async () => {
    sendEmailMock.mockResolvedValue({ mode: "mock", resendId: "resend-1" });
    writeNotificationLogMock.mockResolvedValue(undefined);

    await deliverEmail(FULL_ENV, prepared);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(writeNotificationLogMock).toHaveBeenCalledWith(
      FULL_ENV.SOL_API_URL,
      FULL_ENV.SOL_API_KEY,
      expect.objectContaining({ clientId: "acme-corp", outcome: "sent", type: "email", resendId: "resend-1" })
    );
  });

  it("retries a transient send failure and logs the eventual success, not the first failure", async () => {
    sendEmailMock
      .mockRejectedValueOnce(new Error("temporary Resend outage"))
      .mockResolvedValueOnce({ mode: "live", resendId: "resend-2" });
    writeNotificationLogMock.mockResolvedValue(undefined);

    await deliverEmail(FULL_ENV, prepared);

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(writeNotificationLogMock).toHaveBeenCalledWith(
      FULL_ENV.SOL_API_URL,
      FULL_ENV.SOL_API_KEY,
      expect.objectContaining({ outcome: "sent", resendId: "resend-2" })
    );
  });

  it("logs outcome failed after exhausting retries on a persistent send failure", async () => {
    sendEmailMock.mockRejectedValue(new Error("Resend is down"));
    writeNotificationLogMock.mockResolvedValue(undefined);

    await deliverEmail(FULL_ENV, prepared);

    expect(writeNotificationLogMock).toHaveBeenCalledWith(
      FULL_ENV.SOL_API_URL,
      FULL_ENV.SOL_API_KEY,
      expect.objectContaining({ outcome: "failed", errorMessage: expect.stringContaining("Resend is down") })
    );
  });

  it("never throws even if the log write itself fails — nothing is listening in waitUntil", async () => {
    sendEmailMock.mockResolvedValue({ mode: "mock", resendId: null });
    writeNotificationLogMock.mockRejectedValue(new Error("sol-api unreachable"));

    await expect(deliverEmail(FULL_ENV, prepared)).resolves.toBeUndefined();
  });
});
