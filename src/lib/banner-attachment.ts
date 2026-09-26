import { Buffer } from "node:buffer";
import { DEFAULT_BANNER_URL } from "./banner-config.js";
import type { EmailAttachment } from "./email-sender.js";
import { logger } from "./logger.js";

// The banner is downloaded at send time and travels *inside* each email as
// an inline (CID) attachment, rather than being hotlinked as
// <img src="https://...">: a hotlinked image is re-fetched every time an
// email is opened, so it would break in every already-sent email the moment
// its URL stopped serving. Attached, the URL only has to be up at send time.
// Templates reference it as BANNER_CID_SRC.
export const BANNER_CONTENT_ID = "banner_image";
export const BANNER_CID_SRC = `cid:${BANNER_CONTENT_ID}`;

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BANNER_BYTES = 1_000_000;

// Tries the client's own banner URL (if any), then DEFAULT_BANNER_URL.
// Returns null only if both fail — the caller then falls back to hotlinking
// DEFAULT_BANNER_URL (see withHotlinkedBanner) rather than failing the
// email: a banner is never worth blocking a notification over.
export async function loadBannerAttachment(clientImageUrl?: string): Promise<EmailAttachment | null> {
  for (const url of clientImageUrl ? [clientImageUrl, DEFAULT_BANNER_URL] : [DEFAULT_BANNER_URL]) {
    try {
      return await fetchBannerAttachment(url);
    } catch (err) {
      logger.warn("banner fetch failed", {
        imageUrl: url,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}

// Last resort when no banner could be downloaded: point the cid: reference
// at the default URL directly, so the email still shows a banner once that
// URL is back up.
export function withHotlinkedBanner(html: string): string {
  return html.replaceAll(BANNER_CID_SRC, DEFAULT_BANNER_URL);
}

async function fetchBannerAttachment(url: string): Promise<EmailAttachment> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!contentType.startsWith("image/")) throw new Error(`not an image (content-type: ${contentType || "none"})`);

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_BANNER_BYTES) throw new Error(`too large (${bytes.byteLength} bytes)`);

    return {
      filename: `banner.${contentType.slice("image/".length)}`,
      content: Buffer.from(bytes).toString("base64"),
      contentType,
      contentId: BANNER_CONTENT_ID,
    };
  } finally {
    clearTimeout(timeout);
  }
}
