import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmailEnvelope } from "../../../src/validators/notification.js";

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
const { DEFAULT_BANNER_URL } = await import("../../../src/lib/banner-config.js");

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

  it("references the banner as an inline attachment, with no client URL when the client has no banner settings", async () => {
    const prepared = await prepareEmail(SOL_API_ENV, baseEnvelope);
    expect(prepared.html).toContain('src="cid:banner_image"');
    expect(prepared.bannerImageUrl).toBeUndefined();
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
    // Never hotlinked — the URL is only carried forward for deliverEmail to
    // fetch and attach.
    expect(prepared.html).toContain('src="cid:banner_image"');
    expect(prepared.html).not.toContain("https://acme.example.com/logo.png");
    expect(prepared.bannerImageUrl).toBe("https://acme.example.com/logo.png");
    expect(prepared.html).toContain('height="60"');
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
    expect(prepared.html).toContain('src="cid:banner_image"');
    expect(prepared.bannerImageUrl).toBeUndefined();
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
  // Every deliverEmail call downloads a banner first — stubbed here so no
  // test reaches the real network. Individual tests override it.
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } })
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const prepared = {
    clientId: "acme-corp",
    emailTemplate: "mailchimp_confirmation",
    recipients: ["sales@acme.com"],
    subject: "New lead added to Mailchimp",
    html: "<html></html>",
  };

  it("logs outcome sent on a successful send", async () => {
    sendEmailMock.mockResolvedValue({ mode: "resend", resendId: "resend-1" });
    writeNotificationLogMock.mockResolvedValue(undefined);

    await deliverEmail(FULL_ENV, prepared);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(writeNotificationLogMock).toHaveBeenCalledWith(
      FULL_ENV.SOL_API_URL,
      FULL_ENV.SOL_API_KEY,
      expect.objectContaining({ clientId: "acme-corp", outcome: "sent", type: "email", resendId: "resend-1" })
    );
  });

  it("attaches the downloaded banner inline", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })
    );
    sendEmailMock.mockResolvedValue({ mode: "mock" });
    writeNotificationLogMock.mockResolvedValue(undefined);

    await deliverEmail(FULL_ENV, { ...prepared, html: '<img src="cid:banner_image">' });

    expect(sendEmailMock).toHaveBeenCalledWith(
      FULL_ENV,
      expect.objectContaining({
        html: '<img src="cid:banner_image">',
        attachments: [expect.objectContaining({ contentId: "banner_image", content: "AQID" })],
      })
    );
  });

  it("still sends, with the default banner hotlinked, when no banner can be downloaded", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    sendEmailMock.mockResolvedValue({ mode: "mock" });
    writeNotificationLogMock.mockResolvedValue(undefined);

    await deliverEmail(FULL_ENV, { ...prepared, html: '<img src="cid:banner_image">' });

    expect(sendEmailMock).toHaveBeenCalledWith(
      FULL_ENV,
      expect.objectContaining({ html: `<img src="${DEFAULT_BANNER_URL}">`, attachments: [] })
    );
    expect(writeNotificationLogMock).toHaveBeenCalledWith(
      FULL_ENV.SOL_API_URL,
      FULL_ENV.SOL_API_KEY,
      expect.objectContaining({ outcome: "sent" })
    );
  });

  it("logs a null resendId for a non-Resend send, never another provider's id", async () => {
    sendEmailMock.mockResolvedValue({ mode: "mailtrap", mailtrapMessageIds: ["mt-1"] });
    writeNotificationLogMock.mockResolvedValue(undefined);

    await deliverEmail(FULL_ENV, prepared);

    expect(writeNotificationLogMock).toHaveBeenCalledWith(
      FULL_ENV.SOL_API_URL,
      FULL_ENV.SOL_API_KEY,
      expect.objectContaining({ outcome: "sent", resendId: null })
    );
  });

  it("retries a transient send failure and logs the eventual success, not the first failure", async () => {
    sendEmailMock
      .mockRejectedValueOnce(new Error("temporary Resend outage"))
      .mockResolvedValueOnce({ mode: "resend", resendId: "resend-2" });
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
    sendEmailMock.mockResolvedValue({ mode: "mock" });
    writeNotificationLogMock.mockRejectedValue(new Error("sol-api unreachable"));

    await expect(deliverEmail(FULL_ENV, prepared)).resolves.toBeUndefined();
  });
});
