# Invozy — GST billing for many businesses

A multi-tenant SaaS on Next.js 16 (App Router, Server Actions) + Prisma/PostgreSQL. Each business signs
up as a **company** and gets its own workspace: GST invoices and PDFs, payments and receipts,
customers with special prices and schemes, inventory, purchases and suppliers, returns / credit notes /
refunds, reports with GSTR-1 and Tally exports, a team of owner and staff logins, an activity log, and
a daily summary email. A **platform admin** at `/admin` onboards, suspends and configures companies.

The feature set comes from the single-company ASB app (this branch carries ASB's git history on top of
the original Invozy, so later ASB work can be cherry-picked across); this repo adds the tenancy.

## How tenancy works

Every business row carries a `companyId`, and the app code reads like single-company code — it never
passes a company id around. The boundary is enforced in one place:

| Piece | What it does |
|---|---|
| `src/lib/prisma.ts` | `prisma` — the client all app code uses — is **tenant-scoped**. `rootPrisma` is unscoped and used only by sign-in/signup/password reset, `/admin`, and cron jobs choosing which companies to run. |
| `src/lib/tenant-scope.ts` | The Prisma query extension: ANDs the company filter into every read/update/delete, sets `companyId` on every create (nested too, never taken from input), limits nested `connect`s to the company's rows, rejects foreign keys pointing at another company's rows, and refuses raw SQL that doesn't mention `"companyId"`. Every model must be listed in `MODEL_SCOPES` (a type error otherwise). |
| `src/lib/tenant.ts` | Which company is in scope: `runWithTenant()` (cron, token routes, scripts) → `setRequestTenant()` (token-authorised `/print/*` pages) → the session JWT. None → every query throws `TenantMissingError`. |
| `src/lib/session.ts` | `requireUser()` checks the login still exists, is switched on, belongs to the company its token names, and that the company isn't suspended. |
| `src/lib/signed-token.ts`, `signed-request.ts` | PDF/print/share tokens name their company; verifying one scopes the request to it and refuses suspended companies. |
| Raw SQL | Can't be rewritten automatically, so every `$queryRaw` filters on `"companyId"` by hand (reports use the scoped `filterConds`/`creditNoteConds`/`paymentConds` helpers). |

Other per-company things: uploads live under `<companyId>/<kind>/`, settings (`AppSetting`) are keyed by
company, document numbers (invoice, credit note, receipt) are unique per company, nightly backups are
written per company, and the daily email is built inside each company's scope.

`companyId` columns default to `current_setting('app.company_id')`, which is never set — it exists only
so Prisma's types don't demand a companyId the scoped client injects anyway. A create that bypasses the
scoped client without one fails loudly instead of writing an orphan row.

## Roles

- **Platform admin** — `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH`, signs in at `/admin/login`, has no company and
  can't open company pages. Lists companies with usage and billing totals; adds a company with its first
  owner; suspends/restores a company (logins refused, shared links stop, nothing deleted); switches
  **modules** on/off per company; resets passwords; switches individual logins off.
- **Owner** — everything inside their company, including Company settings, PDF layout and Team.
- **Staff** — bill, take payments, receive stock; no deletes, company settings or logins (enforced on
  the server, not just hidden).

**Modules** (`src/lib/modules.ts`): Inventory, Purchases & suppliers, Returns & credit notes, Reports &
exports, Team logins. Off = hidden from navigation, its pages show a "not enabled" notice
(`src/components/modules/module-gate.tsx`), and its own server actions and API routes refuse
(`src/lib/require-module.ts`); data is untouched. The core (dashboard, invoices, customers, products,
company) is always on, and the few module actions the core uses (dashboard stock widgets, the invoice
builder's cost/batch hints) stay available — so those widgets still show when a module is off.

Sign-in: a login is an email or a phone (never both shapes in one field), unique platform-wide; the
admin's email can't be a company login. Wrong-password lockouts count per login however the phone is
spaced, and the admin has its own counter. Rotating `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` ends admin
sessions.

## Running the platform

**Subscriptions** (`src/lib/plans.ts`, `src/lib/entitlements.ts`): plans Starter / Growth / Business
decide the included modules and limits (invoices a month, active logins) — prices are placeholders in
`plans.ts`. New companies get a 14-day trial with every module. When a trial or paid period ends there's
a 7-day grace period with a warning, then new invoices, customers, products, purchases, credit notes and
logins are refused (`src/lib/subscription-guard.ts`) — viewing, editing, payments and exports always keep
working. Companies that existed before subscriptions are grandfathered: Business, no end date.
Owners see their plan, usage and payments at `/billing` and pay with Razorpay when its keys are set
(checkout + webhook, applied idempotently); otherwise, and for bank transfers, the admin records
payments in `/admin`. Reminder emails go out 3 days before and after the end (daily job).

**Admin panel** (`/admin`): companies with plan/billing state, trial extension, manual payments, plan and
status changes, suspend/restore, modules, password resets, logins on/off, **view as company** (opens the
workspace read-only for 30 minutes — every write is refused at the data layer, `src/lib/view-as.ts`),
**permanent deletion** (suspended companies only, name typed; `src/lib/company-purge.ts`), and an
**audit log** (`/admin/audit`) of every admin action, kept even for deleted companies. Owners can ask for
deletion from `/billing`. Admin sign-in: optional authenticator codes (`npm run admin-totp` →
`ADMIN_TOTP_SECRET`) and a per-network throttle.

**Sign-up and logins:** new logins get an email-confirmation link (`/verify-email`; a banner offers to
resend it); sign-ups are limited to 5 per network per hour, with an optional Cloudflare Turnstile check.

**Onboarding:** new owners get a "Get set up" checklist on the dashboard (worked out from their real
data) and a full guided tour of every section they have (`src/components/onboarding/onboarding-tour.tsx`,
also under the account menu → "Take the tour").

**Scheduled jobs:** `/api/cron/daily` and `/api/cron/backup` hand each active company its own job at
`/api/cron/company` (its own function run and time limit) — the 8 AM summary + subscription reminders,
and the nightly per-company backup.

**Monitoring:** server errors are logged as JSON lines and, with `ERROR_WEBHOOK_URL`, posted to a chat
channel (`src/instrumentation.ts`); `/api/health` is for an uptime monitor.

## Setup (local)

```bash
npm install
cp .env.example .env        # fill DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH
npm run db:deploy           # applies prisma/migrations
npm run dev
```

If `.env` points at a real (production) database, develop against a local one instead: put
`DATABASE_URL="postgresql://<you>@localhost:5432/invozy_dev"` and `BLOB_READ_WRITE_TOKEN=""` in
`.env.local` (git-ignored; `next dev` prefers it over `.env`), then `npm run db:deploy:local` and
`npm run db:seed` with that URL. New code against an un-migrated database fails with "The column … does
not exist".

Then either sign up at `/signup`, add a company from `/admin`, or from the command line:

```bash
npm run create-company -- --name "Arctic Blocks Ice Co." --state "Tamil Nadu" --email owner@example.com
```

(If that email already exists in any company, its password is reset instead — the lock-out recovery
tool.) `npm run db:seed` creates a demo company with sample products, customers and an invoice.

## Deploying the upgrade to an existing database

Two migrations upgrade a database that has the original Invozy migrations applied:
`20261116100000_saas_asb_features` (below) and `20261117000000_subscriptions_audit_verification`
(subscriptions, audit log, email verification — existing companies become Business with no end date,
existing logins count as verified). `20261116100000_saas_asb_features` It is additive: no column or row is dropped. It adds the new tables and columns,
converts `Role` → `UserRole` keeping every login's role, gives payments their company, and backfills
each existing invoice's `amountPaid`, stored totals (the same float math as `computeTotals()`, verified
equal on 600 generated invoices) and `stockTaken`.

On a live database:

1. Back up every table first.
2. `npx prisma migrate status` — only the new migration should be pending.
3. `npm run db:deploy`.
4. Compare row counts before/after — only `_prisma_migrations` should change.

Deploy the code and the migration together: the code expects the new columns.

New environment variables for production: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (raw hash in the host's
UI), `CRON_SECRET`, `AUTH_URL`; optional `ADMIN_TOTP_SECRET`, `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
`RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, `ERROR_WEBHOOK_URL`,
`SIGNUPS_DISABLED=1` (see `.env.example`). `AUTH_URL` is what password-reset emails,
share links and the PDF renderer use for the site's address; when it's unset they fall back to request
headers, which is only safe on hosts that set those headers themselves (Vercel does). **Self-hosting
requires `AUTH_URL`.** `vercel.json` pins functions to `sin1`,
next to a Singapore Neon database — keep them in the same region.

## Tests

```bash
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/invozy_test npm run test:actions
```

Runs the real server actions against a throwaway local Postgres (it's wiped; only localhost is
accepted): stock, returns and refunds, purchases and attachments, company settings and discounts as one
company — then a second company trying to read, bill against, pay, delete, restock, credit, upload over
and impersonate the first one's data, plus raw-SQL and no-session checks.

## Project structure

```
src/
  app/(app)/        Company workspace pages (one folder per screen)
  app/admin/        Platform admin panel
  app/print/        Print pages the headless PDF renderer opens (token-authorised)
  app/api/          PDFs, share links, exports, uploads, cron
  actions/          Server Actions — one file per resource; admin.ts is the platform admin's
  components/       UI; modules/ holds the module gate and provider
  lib/
    prisma.ts, tenant.ts, tenant-scope.ts   The tenancy boundary — read these first
    session.ts, signed-token.ts, signed-request.ts
    modules.ts      Admin-controlled modules
    gst.ts          The billing math (computeTotals)
    invoice-totals.ts, stock.ts, invoice-pdf.ts, settings.ts, uploads.ts, backup.ts
prisma/
  schema.prisma, migrations/, seed.ts
scripts/
  create-company.ts, test-actions/
```

## Stored invoice totals

Each invoice stores its computed `taxable`/`cgst`/`sgst`/`igst`/`total`/`interState` and `amountPaid`, so
dashboards, reports, lists and ledgers are SQL aggregates. `computeTotals()` in `src/lib/gst.ts` is still
the only place the math lives; every action that changes an invoice writes its result through
`src/lib/invoice-totals.ts`.
