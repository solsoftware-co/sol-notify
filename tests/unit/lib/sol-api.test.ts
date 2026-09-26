import { describe, it, expect, vi } from "vitest";
import { getClient, SolApiNotFoundError } from "../../../src/lib/sol-api.js";

function fakeBinding(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response);
  return { binding: { fetch } as unknown as Fetcher, fetch };
}

describe("getClient", () => {
  it("calls sol-api through the binding with the client path and API key", async () => {
    const { binding, fetch } = fakeBinding(
      Response.json({ success: true, data: { id: "sol", name: "Sol Software" } })
    );

    await expect(getClient(binding, "key", "sol")).resolves.toMatchObject({ id: "sol" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(url as string).pathname).toBe("/v1/clients/sol");
    expect((init as RequestInit).headers).toMatchObject({ "X-API-Key": "key" });
  });

  it("surfaces a non-JSON response with its status and body, not a JSON SyntaxError", async () => {
    const { binding } = fakeBinding(new Response("error code: 1042\n", { status: 530 }));

    await expect(getClient(binding, "key", "sol")).rejects.toThrow(
      "sol-api returned non-JSON (HTTP 530): error code: 1042"
    );
  });

  it("maps a JSON 404 to SolApiNotFoundError", async () => {
    const { binding } = fakeBinding(
      Response.json({ success: false, error: { code: "NOT_FOUND", message: "Client not found" } }, { status: 404 })
    );

    await expect(getClient(binding, "key", "nope")).rejects.toBeInstanceOf(SolApiNotFoundError);
  });
});
