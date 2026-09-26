import { describe, it, expect } from "vitest";
import app from "../../../src/index.js";
import { parseEnvironment, InvalidEnvironmentError } from "../../../src/lib/environment.js";

const BASE_ENV = { API_KEY: "test-api-key", SOL_API_URL: "", SOL_API_KEY: "", RESEND_API_KEY: "" };

describe("parseEnvironment", () => {
  it.each(["development", "preview", "staging", "production"])("accepts %s", (value) => {
    expect(parseEnvironment(value)).toBe(value);
  });

  it.each(["", "prod", "Staging", undefined, null])("rejects %j", (value) => {
    expect(() => parseEnvironment(value)).toThrow(InvalidEnvironmentError);
  });
});

describe("app — misconfigured ENVIRONMENT", () => {
  it("returns 500 on every route, including /health", async () => {
    const res = await app.request("/health", {}, { ...BASE_ENV, ENVIRONMENT: "prod" });
    expect(res.status).toBe(500);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });

  it("serves normally with a valid ENVIRONMENT", async () => {
    const res = await app.request("/health", {}, { ...BASE_ENV, ENVIRONMENT: "staging" });
    expect(res.status).toBe(200);
  });
});
