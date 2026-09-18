// In-memory only, deliberately not persisted anywhere — this is a local dev
// convenience, not a feature. Workers have no real filesystem to write a
// preview file to (unlike the old service's fs-based .email-preview/last.html
// mechanism), so instead of writing to disk we hold the most recently
// rendered email in memory and serve it back as a page (see
// routes/preview.ts). Module-level state persists across requests within a
// single `wrangler dev` process, which is exactly the lifetime this needs.
let lastRenderedHtml: string | null = null;

export function setLastEmailPreview(html: string): void {
  lastRenderedHtml = html;
}

export function getLastEmailPreview(): string | null {
  return lastRenderedHtml;
}
