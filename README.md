# sol-notify

New notification service (Cloudflare Workers + Hono), replacing `sol-notification-service` (formerly `sol-notificaiton-service`, Vercel + Inngest) piece by piece. See [SOL-8](https://linear.app/sol-software/issue/SOL-8).

Single thin `POST /` entrypoint, Zod-discriminated on `type` (email-only for now — see SOL-13 for slack). No database — client config and audit logging both go through [sol-api](https://github.com/solsoftware-co/sol-api).

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars
# fill in SOL_API_KEY (matches sol-api's local API_KEY) and RESEND_API_KEY
npm run dev
```

## Commands

```bash
npm run dev          # wrangler dev server on http://localhost:8788
npm test             # vitest via @cloudflare/vitest-pool-workers
npm run type-check   # tsc --noEmit
npm run deploy       # wrangler deploy
```

## Architecture

- `src/routes/notification.ts` — the entrypoint. Synchronous: validate envelope, validate `fields` against the template's schema, fetch client, render. Then responds `202` and continues send + audit-log write inside `ctx.waitUntil()`, so callers (including client sites calling this directly on form submit) aren't blocked through retry backoff.
- `src/emails/registry.ts` — `emailTemplate` enum → `{fieldsSchema, component}`. Adding a template is one schema + one component + one registry entry.
- `src/lib/sol-api.ts` — the only way this service touches client/audit data.
- `src/lib/retry.ts` — exponential-backoff retry, used only inside the backgrounded `waitUntil` work, never the synchronous request path.

Full design rationale: see the SOL-8 implementation plan (Casey's machine, `~/.claude/plans/request-interrupted-by-user-golden-graham.md`) or the [design board](https://miro.com/app/board/uXjVHolYGyo=/).
