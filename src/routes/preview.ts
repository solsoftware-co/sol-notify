import { Hono } from "hono";
import { getLastEmailPreview } from "../lib/email-preview-store.js";
import type { AppEnv } from "../types/index.js";

const preview = new Hono<AppEnv>();

// Dev-only, gated inside the handler (not by omitting the route) so it's
// inert regardless of environment rather than relying on this file never
// being deployed somewhere it shouldn't be — rendered email content can
// carry PII, so this must never be reachable outside local development.
// No auth on this route: it's meant to be opened directly in a browser
// during local dev, and it 404s everywhere auth would matter anyway.
preview.get("/last-email", (c) => {
  if (c.env.ENVIRONMENT !== "development") {
    return c.notFound();
  }

  const html = getLastEmailPreview();
  if (!html) {
    return c.html("<p>No email rendered yet — POST a notification.requested payload first.</p>");
  }
  return c.html(html);
});

export default preview;
