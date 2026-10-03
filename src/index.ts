import { Hono } from "hono";
import { errorHandler } from "./middleware/error.js";
import { requireApiKey } from "./middleware/auth.js";
import health from "./routes/health.js";
import notification from "./routes/notification.js";
import preview from "./routes/preview.js";
import { parseEnvironment } from "./lib/environment.js";
import { SUBMISSION_ID_HEADER, TRACE_ID_HEADER, idFromHeader, withLogScope } from "./lib/log-context.js";
import type { AppEnv } from "./types/index.js";

const app = new Hono<AppEnv>();

app.onError(errorHandler);
app.use("*", async (c, next) => {
  // The caller's trace (Sol Gate's, forwarded), or a new one; and Sol Gate's
  // submissionId when the request is for a submission — never made up here.
  // Both go on every log line of the request, including the backgrounded
  // send, and are forwarded to sol-api (SOL-46).
  const traceId = idFromHeader(c.req.header(TRACE_ID_HEADER)) ?? crypto.randomUUID();
  const submissionId = idFromHeader(c.req.header(SUBMISSION_ID_HEADER));

  await withLogScope({ environment: c.env.ENVIRONMENT, traceId, submissionId }, async () => {
    // Fail fast on a misconfigured ENVIRONMENT, on every route (including
    // /health, so a bad preview deploy fails pr.yml's reachability check) —
    // rather than only discovering it inside the backgrounded send, where the
    // error could only be logged, never returned to anyone.
    parseEnvironment(c.env.ENVIRONMENT);
    await next();
  });
});

app.route("/health", health);
// Unauthenticated so it can be opened directly in a browser during local
// dev — self-gated to development-only inside the handler (see preview.ts).
app.route("/__preview", preview);
app.use("/*", requireApiKey);
app.route("/", notification);

export default app;
