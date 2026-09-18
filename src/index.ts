import { Hono } from "hono";
import { errorHandler } from "./middleware/error.js";
import { requireApiKey } from "./middleware/auth.js";
import health from "./routes/health.js";
import notification from "./routes/notification.js";
import preview from "./routes/preview.js";
import type { AppEnv } from "./types/index.js";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

app.route("/health", health);
// Unauthenticated so it can be opened directly in a browser during local
// dev — self-gated to development-only inside the handler (see preview.ts).
app.route("/__preview", preview);
app.use("/*", requireApiKey);
app.route("/", notification);

export default app;
