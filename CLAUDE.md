# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

Active implementation (SOL-8). Full plan and design-board references: https://linear.app/sol-software/issue/SOL-8

## Commands

```bash
npm run dev        # wrangler dev server on http://localhost:8788
npm test           # vitest via @cloudflare/vitest-pool-workers (unit; tests/e2e excluded)
npm run test:e2e   # e2e smoke suite in plain Node against PREVIEW_URL (skips if unset)
npm run type-check # tsc --noEmit
npm run deploy     # deploy to Cloudflare Workers
```

## Environments

- **`development`** (local `npm run dev`) — email sends are mocked, see below.
- **`preview`** (ephemeral, worker `sol-notify-pr-<PR#>`, SOL-17) — deployed by `.github/workflows/pr.yml` on every same-repo PR (fork PRs skipped — no secrets), deleted by `.github/workflows/cleanup.yml` on close. Deployed with `--var ENVIRONMENT:preview`, which puts `email-sender.ts` in **mailtrap** mode: real delivery via Mailtrap's sandbox HTTP API (not nodemailer/SMTP — Workers have no raw TCP sockets) into an inbox no real mailbox receives, subject prefixed `[PREVIEW]`. `SOL_API_URL` points at sol-api's persistent `dev` env (SOL-31), not staging. `tests/e2e/smoke.test.ts` then POSTs a real notification and polls Mailtrap's Testing API (`tests/e2e/helpers/mailtrap.ts`, ported from the old service) to assert on the delivered HTML.
- **`staging`** (`env.staging` in `wrangler.toml`, worker `sol-notify-staging`) — deployed automatically by `.github/workflows/release.yml` on every merge to `main`. Real Resend sends, subject prefixed `[STAGING]` (see `src/lib/email-sender.ts`).
- **`production`** (`env.production`, worker `sol-notify`) — deployed by the same workflow's `deploy-production` job, gated behind the `production` GitHub Environment (required reviewer approval — this repo is public specifically so that gate works on GitHub's free plan; private repos need a paid org plan for required-reviewer protection). Runs after `deploy-staging` succeeds. Real Resend sends, no subject prefix.

Staging deploy requires these secrets on the GitHub repo: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `RELEASE_TOKEN`, `API_KEY_STAGING`, `SOL_API_URL_STAGING`, `SOL_API_KEY_STAGING`, `RESEND_API_KEY` (shared with production — one Resend key covers both). Production adds: `API_KEY_PRODUCTION`, `SOL_API_URL_PRODUCTION`, `SOL_API_KEY_PRODUCTION`. PR previews add: `SOL_API_URL_DEV`, `SOL_API_KEY_DEV`, `MAILTRAP_API_TOKEN`, `MAILTRAP_INBOX_ID`, `MAILTRAP_ACCOUNT_ID` (reusing `API_KEY_STAGING` as the preview Worker's inbound key, same as sol-api's previews).

Local secrets go in `.dev.vars` (gitignored, see `.dev.vars.example`):
```
API_KEY=dev-local-key
ENVIRONMENT=development
SOL_API_URL=http://localhost:8787
SOL_API_KEY=dev-local-key
RESEND_API_KEY=re_xxx
```

### Viewing a rendered email locally

In `development`, email sending is mocked — no real send happens. Instead of dumping raw HTML to the terminal, the most recently rendered email is held in memory and served as a real page: after POSTing a `notification.requested` payload, open **http://localhost:8788/__preview/last-email** in a browser to see it rendered. This route is self-gated to `ENVIRONMENT === "development"` (404s in staging/production, unauthenticated by design since it's meant to be opened directly in a browser) — rendered email content can carry PII, so it must never be reachable anywhere else.

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
│   ├── templates/mailchimp-confirmation.tsx   # first template
│   └── registry.ts                  # emailTemplate -> { fieldsSchema, component } — add a template here, nothing else changes
├── lib/
│   ├── sol-api.ts                   # typed HTTP client: getClient(), writeNotificationLog()
│   ├── retry.ts                     # withRetry() — only ever called from inside ctx.waitUntil(), never the sync request path
│   ├── email-sender.ts              # send modes: mock (development) / mailtrap (preview) / live Resend (staging, production)
│   └── logger.ts                    # structured JSON logger
├── middleware/{auth,error}.ts       # X-API-Key check, global error envelope
└── types/index.ts                   # Env bindings, AppEnv
tests/
├── unit/                            # Workers pool (vitest.config.ts)
└── e2e/                             # plain Node vs. a deployed preview Worker (vitest.e2e.config.ts)
```

### Request flow — synchronous vs. backgrounded

This service is called both by trusted backend services (e.g. integration-service, SOL-9) and directly over HTTP by client sites (e.g. on form submit), so the response must not be blocked through retry backoff.

**Synchronous** (caller waits): validate envelope → validate `fields` against the `emailTemplate`'s own schema → `GET /v1/clients/:clientId` → render → respond `202`.

**Backgrounded**, inside `c.executionCtx.waitUntil()` (after the response is sent): resolve the banner attachment → send (retried via `withRetry()`) → write the outcome to `POST /v1/notification-logs`. A failed log write is logged to console but never re-thrown — there's no caller left listening inside `waitUntil()`.

### Response envelope

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "NOT_FOUND", "message": "...", "details": null } }
```

### Banner — inline attachment, not a hosted URL

Every email's banner is downloaded at send time and attached inline, referenced as `<img src="cid:banner_image">` (`src/lib/banner-attachment.ts`), rather than hotlinked — so a banner URL only has to be serving when an email is *sent*; already-delivered emails keep their own copy even if it later stops. Order: the client's own `settings.banner.imageUrl` → `DEFAULT_BANNER_URL` (`src/lib/banner-config.ts`) → if neither downloads, the email still sends with the default URL hotlinked. Locally, `/__preview/last-email` swaps `cid:` for `data:` URIs so the banner still shows in a browser.

### Email template registry

Adding a template is a `src/emails/registry.ts` entry (one Zod `fieldsSchema` + one React component) plus the component file — no other code changes. `fields` is validated against that template's own schema, not left generic, so different integration types (e.g. SOL-10's Google Sheets confirmations) can have entirely different field shapes without constraining each other. `FieldGroup` renders whatever key-value pairs it's given generically, so most new templates need no new rendering code either.

### Testing

Unit tests run inside the actual CF Workers runtime via `@cloudflare/vitest-pool-workers`. `services/email-notification.test.ts` mocks the `sol-api`/`email-sender` module boundaries — there's no database to run real integration tests against, so this is this repo's substitute for that tier.

## Related

- `sol-api` (`../sol-api`) — provides `GET /v1/clients/:clientId` and `POST /v1/notification-logs`, both camelCase (SOL-7).
- SOL-13 — adds the slack branch to `notification.requested`.
- SOL-16 (staging, this doc) — done, deployed.
- SOL-29 (production, this doc) — workflow/config built; deploy is pending the production GitHub secrets listed above being added.
- SOL-18 (Bruno collection, `bruno/`) — done.
- SOL-17 (preview, this doc) — ephemeral per-PR env + Mailtrap-backed e2e email suite (ported from the old service's `tests/e2e/email/` pattern) rather than sol-api's shallow status-code smoke test style.
