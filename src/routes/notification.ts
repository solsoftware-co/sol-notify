import { Hono } from "hono";
import { notificationRequestSchema } from "../validators/notification.js";
import {
  prepareEmail,
  deliverEmail,
  UnknownEmailTemplateError,
  InvalidTemplateFieldsError,
} from "../services/email-notification.js";
import { SolApiNotFoundError } from "../lib/sol-api.js";
import { notFoundResponse, validationErrorResponse } from "../lib/responses.js";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "../types/index.js";

const notification = new Hono<AppEnv>();

notification.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const result = notificationRequestSchema.safeParse(body);

  if (!result.success) {
    return validationErrorResponse(c, "Validation failed", result.error.issues);
  }

  // Only member of the union today is the email envelope — SOL-13 adds a
  // slack branch here once slackEnvelopeSchema exists.
  const envelope = result.data;

  const solApiEnv = { 
    SOL_API_URL: c.env.SOL_API_URL, 
    SOL_API_KEY: c.env.SOL_API_KEY 
  };

  let prepared;
  try {
    prepared = await prepareEmail(solApiEnv, envelope);
  } catch (err) {
    if (err instanceof SolApiNotFoundError) {
      return notFoundResponse(c, err.message);
    }
    if (err instanceof InvalidTemplateFieldsError) {
      return validationErrorResponse(c, err.message, err.issues);
    }
    if (err instanceof UnknownEmailTemplateError) {
      return validationErrorResponse(c, err.message);
    }
    throw err;
  }

  logger.info("notification accepted", {
    requestId: c.get("requestId"),
    clientId: prepared.clientId,
    emailTemplate: prepared.emailTemplate,
  });

  // Send + log happen after the response is returned — this route is called
  // both by trusted backend services and directly over HTTP by client sites
  // (e.g. on form submit), so callers shouldn't be blocked through retry
  // backoff. See src/lib/retry.ts.
  c.executionCtx.waitUntil(
    deliverEmail(
      {
        ENVIRONMENT: c.env.ENVIRONMENT,
        RESEND_API_KEY: c.env.RESEND_API_KEY,
        MAILTRAP_API_TOKEN: c.env.MAILTRAP_API_TOKEN,
        MAILTRAP_INBOX_ID: c.env.MAILTRAP_INBOX_ID,
        ...solApiEnv,
      },
      prepared
    )
  );

  return c.json({ success: true, data: { accepted: true } }, 202);
});

export default notification;
