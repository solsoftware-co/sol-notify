import { describe, it, expect } from "vitest";
import app from "../../../src/index.js";

const ENV = { API_KEY: "test-api-key", SOL_API_KEY: "", RESEND_API_KEY: "", ENVIRONMENT: "development" };

function post(body: unknown) {
  return app.request(
    "/",
    { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": ENV.API_KEY }, body: JSON.stringify(body) },
    ENV
  );
}

describe("POST /", () => {
  // Rejected before sol-api is called, so no SOL_API binding is needed here.
  it("returns 422 listing the invalid recipients when none is a valid email address", async () => {
    const res = await post({
      clientId: "acme-corp",
      type: "email",
      recipients: ["sales@acme", ""],
      subject: "New lead",
      emailTemplate: "mailchimp_confirmation",
      fields: {},
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "recipients contains no valid email address",
        details: { invalidRecipients: ["sales@acme", ""] },
      },
    });
  });
});
