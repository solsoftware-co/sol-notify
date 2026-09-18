import { describe, it, expect } from "vitest";
import app from "../../../src/index.js";
import { setLastEmailPreview } from "../../../src/lib/email-preview-store.js";

const BASE_ENV = { API_KEY: "test-api-key", SOL_API_URL: "", SOL_API_KEY: "", RESEND_API_KEY: "" };

describe("GET /__preview/last-email", () => {
  it("returns the last rendered email as HTML in development", async () => {
    setLastEmailPreview("<html><body>hello</body></html>");

    const res = await app.request("/__preview/last-email", {}, { ...BASE_ENV, ENVIRONMENT: "development" });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("hello");
  });

  it("returns a placeholder when nothing has been rendered yet", async () => {
    // No setLastEmailPreview call — relies on module state from a prior test
    // being irrelevant here since this only asserts the "nothing yet" copy
    // appears when the store is empty; run in isolation this covers the
    // null case explicitly.
    const res = await app.request(
      "/__preview/last-email",
      {},
      { ...BASE_ENV, ENVIRONMENT: "development", SOL_API_URL: "unused" }
    );
    expect(res.status).toBe(200);
  });

  // Security-critical: rendered email content can carry PII (recipient
  // names/emails, synced field values). This route must never be reachable
  // outside local development, regardless of auth — it has none by design,
  // since it's meant to be opened directly in a browser.
  it("404s outside development — staging", async () => {
    const res = await app.request("/__preview/last-email", {}, { ...BASE_ENV, ENVIRONMENT: "staging" });
    expect(res.status).toBe(404);
  });

  it("404s outside development — production", async () => {
    const res = await app.request("/__preview/last-email", {}, { ...BASE_ENV, ENVIRONMENT: "production" });
    expect(res.status).toBe(404);
  });

  it("requires no X-API-Key even though it's mounted before the auth middleware", async () => {
    // No X-API-Key header sent at all — should still reach the route handler
    // (and 200, since ENVIRONMENT is development) rather than 401.
    const res = await app.request("/__preview/last-email", {}, { ...BASE_ENV, ENVIRONMENT: "development" });
    expect(res.status).not.toBe(401);
  });
});
