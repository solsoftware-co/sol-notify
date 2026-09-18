import { describe, it, expect } from "vitest";
import { parseBannerConfig } from "../../../src/lib/banner-config.js";

describe("parseBannerConfig", () => {
  it("returns an empty config when settings has no banner key", () => {
    expect(parseBannerConfig({})).toEqual({});
  });

  it("returns an empty config when banner isn't an object", () => {
    expect(parseBannerConfig({ banner: "not-an-object" })).toEqual({});
  });

  it("accepts a valid https imageUrl, height, and width", () => {
    expect(
      parseBannerConfig({ banner: { imageUrl: "https://acme.example.com/logo.png", height: 50, width: 200 } })
    ).toEqual({ imageUrl: "https://acme.example.com/logo.png", height: 50, width: 200 });
  });

  it("drops an invalid imageUrl but keeps valid height/width", () => {
    expect(parseBannerConfig({ banner: { imageUrl: "not-a-url", height: 50 } })).toEqual({ height: 50 });
  });

  it("drops a non-http(s) imageUrl protocol", () => {
    expect(parseBannerConfig({ banner: { imageUrl: "javascript:alert(1)" } })).toEqual({});
  });

  it("drops a non-integer or non-positive height/width", () => {
    expect(parseBannerConfig({ banner: { height: 0, width: -5 } })).toEqual({});
    expect(parseBannerConfig({ banner: { height: 12.5 } })).toEqual({});
  });
});
