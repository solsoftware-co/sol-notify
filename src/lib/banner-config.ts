// Fetched at send time and attached to the email (see banner-attachment.ts),
// so this only needs to be serving when an email is *sent* — emails already
// delivered carry their own copy. A client's own banner (from
// clients.settings.banner) overrides this; a client with no (or invalid)
// banner settings gets this instead, never no banner at all.
export const DEFAULT_BANNER_URL = "https://www.solsoftware.co/image/logo.png";

export interface BannerConfig {
  imageUrl?: string;
  height?: number;
  width?: number;
}

// Ported from the old service's parseBannerConfig: validates each field
// independently and silently drops invalid ones rather than failing the
// whole email — a client's custom banner is a nice-to-have, never worth
// blocking a notification over. A client with no (or invalid) banner
// settings gets an empty config here; the default Sol Software banner
// (DEFAULT_BANNER_URL) is attached in that case, never no banner at all.
export function parseBannerConfig(settings: Record<string, unknown>): BannerConfig {
  const raw = settings.banner;
  if (!raw || typeof raw !== "object") return {};

  const banner = raw as Record<string, unknown>;
  const config: BannerConfig = {};

  if (typeof banner.imageUrl === "string") {
    try {
      const url = new URL(banner.imageUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        config.imageUrl = banner.imageUrl;
      }
    } catch {
      // Invalid URL — drop silently, fall back to the default banner.
    }
  }

  if (typeof banner.height === "number" && Number.isInteger(banner.height) && banner.height > 0) {
    config.height = banner.height;
  }
  if (typeof banner.width === "number" && Number.isInteger(banner.width) && banner.width > 0) {
    config.width = banner.width;
  }

  return config;
}
