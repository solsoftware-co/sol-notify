import { describe, it, expect, vi, afterEach } from "vitest";
import { sendEmail } from "../../../src/lib/email-sender.js";
import { getLastEmailPreview } from "../../../src/lib/email-preview-store.js";
import { NonRetryableError } from "../../../src/lib/retry.js";

const REQUEST = { to: ["jane@example.com"], subject: "New lead", html: "<p>hi</p>" };
const BANNER = { filename: "banner.png", content: "AQID", contentType: "image/png", contentId: "banner_image" };
const PREVIEW_ENV = {
  ENVIRONMENT: "preview",
  RESEND_API_KEY: "",
  MAILTRAP_API_TOKEN: "mt-token",
  MAILTRAP_INBOX_ID: "12345",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendEmail — mailtrap mode (ENVIRONMENT=preview)", () => {
  it("posts to the Mailtrap sandbox inbox with a [PREVIEW] subject prefix", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true, message_ids: ["mt-1"] }));

    const result = await sendEmail(PREVIEW_ENV, REQUEST);

    expect(result).toEqual({ mode: "mailtrap", mailtrapMessageIds: ["mt-1"] });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://sandbox.api.mailtrap.io/api/send/12345");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer mt-token");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      to: [{ email: "jane@example.com" }],
      subject: "[PREVIEW] New lead",
      html: "<p>hi</p>",
    });
  });

  it("sends attachments inline, referenced by content_id", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ success: true, message_ids: ["mt-1"] }));

    await sendEmail(PREVIEW_ENV, { ...REQUEST, attachments: [BANNER] });

    expect(JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string).attachments).toEqual([
      { filename: "banner.png", content: "AQID", type: "image/png", disposition: "inline", content_id: "banner_image" },
    ]);
  });

  it("throws a NonRetryableError for a rejected credential, so withRetry doesn't hammer Mailtrap", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: false, errors: ["Unauthorized"] }, { status: 401 })
    );

    const err = await sendEmail(PREVIEW_ENV, REQUEST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NonRetryableError);
    expect((err as Error).message).toBe("Mailtrap send failed (HTTP 401): Unauthorized");
  });

  it.each([429, 500, 503])("throws a retryable error for HTTP %i", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: false, errors: ["try later"] }, { status })
    );

    const err = await sendEmail(PREVIEW_ENV, REQUEST).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NonRetryableError);
  });

  it("throws without sending if the Mailtrap secrets are missing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      sendEmail({ ENVIRONMENT: "preview", RESEND_API_KEY: "" }, REQUEST)
    ).rejects.toThrow("MAILTRAP_API_TOKEN and MAILTRAP_INBOX_ID are required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("sendEmail — resend mode (ENVIRONMENT=staging/production)", () => {
  const resendOk = () => Response.json({ id: "resend-1" });

  it("sends the idempotency key as an Idempotency-Key header, prefixed with the environment", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(resendOk());

    const result = await sendEmail(
      { ENVIRONMENT: "production", RESEND_API_KEY: "re_test" },
      { ...REQUEST, idempotencyKey: "sub-1:channel-1" }
    );

    expect(result).toEqual({ mode: "resend", resendId: "resend-1" });
    const headers = new Headers(fetchSpy.mock.calls[0]![1]!.headers);
    expect(headers.get("Idempotency-Key")).toBe("production:sub-1:channel-1");
  });

  // Staging and production share one Resend key, so the same caller key
  // must never dedupe across the two.
  it("prefixes staging keys differently from production", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(resendOk());

    await sendEmail({ ENVIRONMENT: "staging", RESEND_API_KEY: "re_test" }, { ...REQUEST, idempotencyKey: "sub-1:channel-1" });

    expect(new Headers(fetchSpy.mock.calls[0]![1]!.headers).get("Idempotency-Key")).toBe("staging:sub-1:channel-1");
  });

  it("sends no Idempotency-Key header without a key", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(resendOk());

    await sendEmail({ ENVIRONMENT: "production", RESEND_API_KEY: "re_test" }, REQUEST);

    expect(new Headers(fetchSpy.mock.calls[0]![1]!.headers).has("Idempotency-Key")).toBe(false);
  });

  it("retries a concurrent request with the same key, though Resend answers 409", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { statusCode: 409, name: "concurrent_idempotent_requests", message: "Same key already in progress" },
        { status: 409 }
      )
    );

    const err = await sendEmail(
      { ENVIRONMENT: "production", RESEND_API_KEY: "re_test" },
      { ...REQUEST, idempotencyKey: "sub-1:channel-1" }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(NonRetryableError);
  });

  it("doesn't retry a key reused with different content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        { statusCode: 409, name: "invalid_idempotent_request", message: "Same key, different payload" },
        { status: 409 }
      )
    );

    const err = await sendEmail(
      { ENVIRONMENT: "production", RESEND_API_KEY: "re_test" },
      { ...REQUEST, idempotencyKey: "sub-1:channel-1" }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NonRetryableError);
  });
});

describe("sendEmail — mock mode (ENVIRONMENT=development)", () => {
  it("swaps cid: references for data: URIs in the local preview, since a browser can't resolve cid:", async () => {
    await sendEmail(
      { ENVIRONMENT: "development", RESEND_API_KEY: "" },
      { ...REQUEST, html: '<img src="cid:banner_image">', attachments: [BANNER] }
    );

    expect(getLastEmailPreview()).toBe('<img src="data:image/png;base64,AQID">');
  });
});

describe("sendEmail — ENVIRONMENT guard", () => {
  it.each(["", "prod", "Production", undefined])("throws without sending for ENVIRONMENT=%j", async (value) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      sendEmail({ ENVIRONMENT: value as string, RESEND_API_KEY: "re_test" }, REQUEST)
    ).rejects.toThrow("Invalid ENVIRONMENT");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
