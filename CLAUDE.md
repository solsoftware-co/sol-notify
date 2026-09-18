# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Active implementation (SOL-8). Full plan and design-board references: https://linear.app/sol-software/issue/SOL-8

## Commands

```bash
npm run dev        # wrangler dev server on http://localhost:8788
npm test           # vitest via @cloudflare/vitest-pool-workers
npm run type-check # tsc --noEmit
npm run deploy     # deploy to Cloudflare Workers
```

Local secrets go in `.dev.vars` (gitignored, see `.dev.vars.example`):
```
API_KEY=dev-local-key
ENVIRONMENT=development
SOL_API_URL=http://localhost:8787
SOL_API_KEY=dev-local-key
RESEND_API_KEY=re_xxx
```

## Architecture

**Stack**: Hono 4.x → Cloudflare Workers (V8 isolate), no database. Client config and the audit-log trail both live behind `sol-api` (`../sol-api`), reached over HTTP with `X-API-Key` auth via `SOL_API_URL`/`SOL_API_KEY`.

This service is the new replacement for `sol-notification-service` (formerly `sol-notificaiton-service`, still live on Vercel + Inngest), built piece by piece per the design board's step plan. **First pass is email-only** — `type: "slack"` is separately ticketed as SOL-13 and not implemented here yet.

### Source layout

```
src/
├── index.ts                       # Hono app entry
├── routes/
│   ├── health.ts                    # GET /health (no auth)
│   └── notification.ts              # POST / — the single notification.requested entrypoint
├── validators/notification.ts       # z.discriminatedUnion("type", [emailEnvelopeSchema]) — one member today, SOL-13 appends slack
├── services/email-notification.ts   # prepareEmail() (sync) + deliverEmail() (backgrounded) — see request flow below
├── emails/
│   ├── styles.ts                    # design tokens, ported from the old service
│   ├── components/                  # shared primitives (EmailContainer, EmailHeader, EmailFooter, Banner, SectionDivider, FieldGroup, LabelText), ported from sales-lead-v1.tsx
│   ├── templates/integration-confirmation.tsx   # first template
│   └── registry.ts                  # emailTemplate -> { fieldsSchema, component } — add a template here, nothing else changes
├── lib/
│   ├── sol-api.ts                   # typed HTTP client: getClient(), writeNotificationLog()
│   ├── retry.ts                     # withRetry() — only ever called from inside ctx.waitUntil(), never the sync request path
│   ├── email-sender.ts              # Resend wrapper
│   └── logger.ts                    # structured JSON logger
├── middleware/{auth,error}.ts       # X-API-Key check, global error envelope
└── types/index.ts                   # Env bindings, AppEnv
```

### Request flow — synchronous vs. backgrounded

This service is called both by trusted backend services (e.g. integration-service, SOL-9) and directly over HTTP by client sites (e.g. on form submit), so the response must not be blocked through retry backoff.

**Synchronous** (caller waits): validate envelope → validate `fields` against the `emailTemplate`'s own schema → `GET /v1/clients/:clientId` → render → respond `202`.

**Backgrounded**, inside `c.executionCtx.waitUntil()` (after the response is sent): send via Resend (retried via `withRetry()`) → write the outcome to `POST /v1/notification-logs`. A failed log write is logged to console but never re-thrown — there's no caller left listening inside `waitUntil()`.

### Response envelope

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": null } }
```

### Email template registry

Adding a template is a `src/emails/registry.ts` entry (one Zod `fieldsSchema` + one React component) plus the component file — no other code changes. `fields` is validated against that template's own schema, not left generic, so different integration types (e.g. SOL-10's Google Sheets confirmations) can have entirely different field shapes without constraining each other. `FieldGroup` renders whatever key-value pairs it's given generically, so most new templates need no new rendering code either.

### Testing

Tests run inside the actual CF Workers runtime via `@cloudflare/vitest-pool-workers`. `services/email-notification.test.ts` mocks the `sol-api`/`email-sender` module boundaries — there's no database to run real integration tests against, so this is this repo's substitute for that tier.

## Related

- `sol-api` (`../sol-api`) — provides `GET /v1/clients/:clientId` and `POST /v1/notification-logs`, both camelCase (SOL-7).
- SOL-13 — adds the slack branch to `notification.requested`.
- SOL-16 / SOL-29 / SOL-17 / SOL-18 — persistent staging env, persistent production env, ephemeral per-PR env, and Bruno collection respectively (not yet built).
