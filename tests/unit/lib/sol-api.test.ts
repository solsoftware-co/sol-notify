import { describe, it, expect, vi, afterEach } from "vitest";
import { getClient, SolApiNotFoundError } from "../../../src/lib/sol-api.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getClient", () => {
  it("surfaces a non-JSON response with its status and body, not a JSON SyntaxError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("error code: 1042\n", { status: 530 }));

    await expect(getClient("https://sol-api.test", "key", "sol")).rejects.toThrow(
      "sol-api returned non-JSON (HTTP 530): error code: 1042"
    );
  });

  it("still maps a JSON 404 to SolApiNotFoundError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ success: false, error: { code: "NOT_FOUND", message: "Client not found" } }, { status: 404 })
    );

    await expect(getClient("https://sol-api.test", "key", "nope")).rejects.toBeInstanceOf(SolApiNotFoundError);
  });
});
