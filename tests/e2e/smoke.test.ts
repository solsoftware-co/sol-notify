import { describe, it, expect, beforeAll } from "vitest";
import { waitForEmail, getEmailAttachments, type MailtrapMessage, type MailtrapAttachment } from "./helpers/mailtrap.js";

const PREVIEW_URL = process.env.PREVIEW_URL;
const API_KEY = process.env.API_KEY_STAGING;
// Must exist in sol-api's persistent `dev` environment (SOL-31), which is
// what preview Workers' SOL_API service binding targets.
const CLIENT_ID = process.env.E2E_CLIENT_ID ?? "sol";

const skip = !PREVIEW_URL;

function post(body: unknown, headers: Record<string, string> = { "X-API-Key": API_KEY! }) {
  return fetch(`${PREVIEW_URL}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function emailEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    clientId: CLIENT_ID,
    type: "email",
    recipients: ["e2e-test@example.com"],
    subject: "E2E smoke test",
    emailTemplate: "mailchimp_confirmation",
    fields: { email: "e2e-test@example.com" },
    ...overrides,
  };
}

// Unlike sol-api's shallow status-code smoke tests, the full-send block
// below asserts on the *actual rendered HTML* as delivered — the preview
// Worker runs in mailtrap send mode (ENVIRONMENT=preview), so the email
// really lands in a Mailtrap sandbox inbox this suite can poll.
describe.skipIf(skip)("E2E smoke tests", () => {
  it("GET /health returns 200 in the preview environment", async () => {
    const res = await fetch(`${PREVIEW_URL}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ success: true, data: { status: "ok", environment: "preview" } });
  });

  it("GET /__preview/last-email is not reachable outside development", async () => {
    const res = await fetch(`${PREVIEW_URL}/__preview/last-email`);
    expect(res.status).toBe(404);
  });

  describe("POST /", () => {
    it("returns 401 without an API key", async () => {
      const res = await post(emailEnvelope(), {});
      expect(res.status).toBe(401);
    });

    it("returns 422 for an invalid envelope", async () => {
      const res = await post({ type: "email" });
      expect(res.status).toBe(422);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for a client that doesn't exist in sol-api", async () => {
      const res = await post(emailEnvelope({ clientId: "e2e-smoke-nonexistent-client" }));
      expect(res.status).toBe(404);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("mailchimp_confirmation — delivered email", () => {
    // Unique per run, so concurrent PR runs sharing one Mailtrap inbox can
    // never match each other's email (waitForEmail's timestamp window alone
    // narrows it, this makes it exact).
    const runId = crypto.randomUUID().slice(0, 8);
    const fields = { email: `e2e-${runId}@example.com`, "First name": "E2E Test User" };
    const ctaUrl = `https://example.com/e2e/${runId}`;
    let email: MailtrapMessage;
    let attachments: MailtrapAttachment[];

    beforeAll(async () => {
      const triggeredAt = new Date(Date.now() - 5_000); // tolerate clock skew vs. Mailtrap
      const res = await post(
        emailEnvelope({
          subject: `E2E smoke ${runId}`,
          fields,
          cta: { url: ctaUrl, label: "View your audience" },
        })
      );
      expect(res.status).toBe(202);
      email = await waitForEmail(new RegExp(`E2E smoke ${runId}`), triggeredAt);
      attachments = await getEmailAttachments(email.id);
    });

    it("has the [PREVIEW] subject prefix", () => {
      expect(email.subject).toBe(`[PREVIEW] E2E smoke ${runId}`);
    });

    it("delivers a non-empty HTML body", () => {
      expect(email.html_body.length).toBeGreaterThan(50);
    });

    it("renders the real field labels and values", () => {
      for (const [label, value] of Object.entries(fields)) {
        expect(email.html_body).toContain(label);
        expect(email.html_body).toContain(value);
      }
    });

    it("renders the CTA link and label", () => {
      expect(email.html_body).toContain(`href="${ctaUrl}"`);
      expect(email.html_body).toContain("View your audience");
    });

    // The banner travels inside the email (see src/lib/banner-attachment.ts),
    // never as a hosted URL that could later stop serving.
    it("attaches the banner inline and references it by cid", () => {
      const banner = attachments.find((a) => a.content_id === "banner_image");
      expect(banner).toBeDefined();
      expect(banner?.content_type).toMatch(/^image\//);
      expect(banner?.attachment_size).toBeGreaterThan(0);
      // The sent source, not html_body: Mailtrap's formatted HTML rewrites
      // cid: references to its own hosted URLs for display.
      expect(email.html_source).toContain('src="cid:banner_image"');
    });

    it("contains no raw template syntax", () => {
      expect(email.html_body).not.toContain("{{");
      expect(email.html_body).not.toContain("}}");
    });

    it("contains no serialisation artefacts", () => {
      expect(email.html_body).not.toContain("undefined");
      expect(email.html_body).not.toContain(">null<");
      expect(email.html_body).not.toContain("[object Object]");
    });
  });
});
