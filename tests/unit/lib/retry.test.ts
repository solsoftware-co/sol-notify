import { describe, it, expect, vi } from "vitest";
import { withRetry, NonRetryableError, isRetryableStatus } from "../../../src/lib/retry.js";

describe("withRetry", () => {
  it("retries a transient failure and returns the eventual success", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows a NonRetryableError immediately, without retrying", async () => {
    const fn = vi.fn().mockRejectedValue(new NonRetryableError("bad token"));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow("bad token");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("isRetryableStatus", () => {
  it.each([
    [400, false],
    [401, false],
    [403, false],
    [422, false],
    [429, true],
    [500, true],
    [503, true],
    [null, true],
  ])("HTTP %s → retryable: %s", (status, expected) => {
    expect(isRetryableStatus(status)).toBe(expected);
  });
});
