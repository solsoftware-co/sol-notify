import { describe, it, expect, vi } from "vitest";
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

describe("trace and submission ids (SOL-46)", () => {
  it("carries Sol Gate's trace and submission ids through the backgrounded send, onto every log line and every sol-api call", async () => {
    const solApiHeaders: string[] = [];
    const SOL_API = {
      fetch: async (_url: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        solApiHeaders.push(`${headers.get("X-Trace-Id")}|${headers.get("X-Submission-Id")}`);
        return Response.json({ success: true, data: { id: "acme-corp", name: "Acme Corp", settings: {} } });
      },
    } as unknown as Fetcher;
    const background: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => background.push(p), passThroughOnException: () => {} };
    const logSpy = vi.spyOn(console, "log");

    const res = await app.request(
      "/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": ENV.API_KEY, "X-Trace-Id": "trace-1", "X-Submission-Id": "sub-1" },
        body: JSON.stringify({
          clientId: "acme-corp",
          type: "email",
          recipients: ["owner@acme.com"],
          subject: "New lead",
          emailTemplate: "form_submission",
          fields: { submission: { email: "jane@example.com" } },
        }),
      },
      { ...ENV, SOL_API },
      ctx as unknown as ExecutionContext
    );
    await Promise.all(background);

    expect(res.status).toBe(202);
    const lines = logSpy.mock.calls.map(([line]) => JSON.parse(line as string));
    logSpy.mockRestore();
    expect(lines.map((l) => l.message)).toEqual(expect.arrayContaining(["notification accepted", "mock email send"]));
    for (const line of lines) expect(line).toMatchObject({ environment: "development", traceId: "trace-1", submissionId: "sub-1" });
    expect(solApiHeaders.length).toBeGreaterThan(0);
    expect(solApiHeaders.every((h) => h === "trace-1|sub-1")).toBe(true);
  });
});
