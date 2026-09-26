import { describe, it, expect, vi, afterEach } from "vitest";
import {
  loadBannerAttachment,
  withHotlinkedBanner,
  BANNER_CONTENT_ID,
} from "../../../src/lib/banner-attachment.js";
import { DEFAULT_BANNER_URL } from "../../../src/lib/banner-config.js";

const CLIENT_BANNER_URL = "https://acme.example.com/logo.jpg";

function imageResponse(bytes: number[], contentType: string) {
  return new Response(new Uint8Array(bytes), { headers: { "content-type": contentType } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadBannerAttachment", () => {
  it("downloads the default banner when the client has no banner of its own", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(imageResponse([1, 2, 3], "image/png"));

    expect(await loadBannerAttachment(undefined)).toEqual({
      filename: "banner.png",
      content: "AQID",
      contentType: "image/png",
      contentId: BANNER_CONTENT_ID,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(DEFAULT_BANNER_URL);
  });

  it("downloads the client's own banner when it has one, without touching the default", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(imageResponse([1, 2, 3], "image/jpeg; charset=binary"));

    expect(await loadBannerAttachment(CLIENT_BANNER_URL)).toMatchObject({
      filename: "banner.jpeg",
      contentType: "image/jpeg",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(CLIENT_BANNER_URL);
  });

  it.each([
    ["404s", () => Promise.resolve(new Response("gone", { status: 404 }))],
    ["isn't an image", () => Promise.resolve(new Response("<html></html>", { headers: { "content-type": "text/html" } }))],
    ["fails to fetch", () => Promise.reject(new Error("network down"))],
  ])("falls back to the default banner when the client URL %s", async (_label, clientResponse) => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(clientResponse)
      .mockResolvedValueOnce(imageResponse([1, 2, 3], "image/png"));

    expect(await loadBannerAttachment(CLIENT_BANNER_URL)).toMatchObject({ contentType: "image/png", content: "AQID" });
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual([CLIENT_BANNER_URL, DEFAULT_BANNER_URL]);
  });

  it("returns null when neither the client's banner nor the default can be downloaded", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    expect(await loadBannerAttachment(CLIENT_BANNER_URL)).toBeNull();
  });
});

describe("withHotlinkedBanner", () => {
  it("points the cid: reference at the default banner URL", () => {
    expect(withHotlinkedBanner('<img src="cid:banner_image">')).toBe(`<img src="${DEFAULT_BANNER_URL}">`);
  });
});
