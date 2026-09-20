import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EmailEnvelope } from "../../../src/validators/notification.js";
import { DEFAULT_BANNER_URL } from "../../../src/lib/banner-config.js";

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
  emailTemplate: "mailchimp_confirmation" as const,
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
    // Deliberately invalid — emailTemplate is typed to the registry's known
    // names, so this cast is intentional: it exercises prepareEmail's own
    // defense-in-depth check, which matters if it's ever called with an
    // envelope that didn't go through the Zod schema first.
    await expect(
      prepareEmail(
        SOL_API_ENV,
        { ...baseEnvelope, emailTemplate: "does_not_exist" as unknown as EmailEnvelope["emailTemplate"] }
      )
    ).rejects.toBeInstanceOf(UnknownEmailTemplateError);
  });

  it("throws InvalidTemplateFieldsError when fields don't match the template's schema", async () => {
    await expect(
      prepareEmail(
        SOL_API_ENV,
        { ...baseEnvelope, fields: { count: 5 } as unknown as Record<string, string> }
      )
    ).rejects.toBeInstanceOf(InvalidTemplateFieldsError);
  });

  it("propagates SolApiNotFoundError when the client doesn't exist", async () => {
    getClientMock.mockRejectedValue(new SolApiNotFoundError("Client not found: acme-corp"));
    await expect(prepareEmail(SOL_API_ENV, baseEnvelope)).rejects.toBeInstanceOf(SolApiNotFoundError);
  });

  it("falls back to the permanently-hosted default banner when the client has no banner settings", async () => {
    const prepared = await prepareEmail(SOL_API_ENV, baseEnvelope);
    expect(prepared.html).toContain(DEFAULT_BANNER_URL);
  });

  it("uses the client's own banner when settings.banner.imageUrl is set", async () => {
    getClientMock.mockResolvedValue({
      id: "acme-corp",
      name: "Acme Corp",
      email: "contact@acme.com",
      active: true,
      settings: { banner: { imageUrl: "https://acme.example.com/logo.png", height: 60 } },
      timezone: "America/Chicago",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const prepared = await prepareEmail(SOL_API_ENV, baseEnvelope);
    expect(prepared.html).toContain("https://acme.example.com/logo.png");
    expect(prepared.html).not.toContain(DEFAULT_BANNER_URL);
  });

  it("drops an invalid banner imageUrl and falls back to the default rather than failing the email", async () => {
    getClientMock.mockResolvedValue({
      id: "acme-corp",
      name: "Acme Corp",
      email: "contact@acme.com",
      active: true,
      settings: { banner: { imageUrl: "not-a-valid-url" } },
      timezone: "America/Chicago",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const prepared = await prepareEmail(SOL_API_ENV, baseEnvelope);
    expect(prepared.html).toContain(DEFAULT_BANNER_URL);
  });

  it("renders no CTA button when cta isn't provided", async () => {
    const prepared = await prepareEmail(SOL_API_ENV, baseEnvelope);
    expect(prepared.html).not.toContain("<a href");
  });

  it("renders a CTA button with the default label when cta.url is given without cta.label", async () => {
    const prepared = await prepareEmail(SOL_API_ENV, {
      ...baseEnvelope,
      cta: { url: "https://us1.admin.mailchimp.com/lists/" },
    });
    expect(prepared.html).toContain('href="https://us1.admin.mailchimp.com/lists/"');
    expect(prepared.html).toContain("View in Mailchimp");
  });

  it("renders a CTA button with a custom label when both cta.url and cta.label are given", async () => {
    const prepared = await prepareEmail(SOL_API_ENV, {
      ...baseEnvelope,
      cta: { url: "https://us1.admin.mailchimp.com/lists/", label: "View your audience" },
    });
    expect(prepared.html).toContain("View your audience");
    expect(prepared.html).not.toContain("View in Mailchimp");
  });

  it("does not render cta as a visible field row", async () => {
    const prepared = await prepareEmail(SOL_API_ENV, {
      ...baseEnvelope,
      cta: { url: "https://us1.admin.mailchimp.com/lists/" },
    });
    // FieldGroup renders each field's key as an uppercase label — "cta"
    // itself should never appear as label text, only inside the href.
    expect(prepared.html).not.toMatch(/>cta</i);
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
