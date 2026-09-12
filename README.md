# Arctic Blocks — Billing & Invoicing

A real Next.js 16 (App Router) + Server Actions + Prisma/PostgreSQL implementation of the
Arctic Blocks GST billing app, built from `frontend-documentation.md`, `backend-documentation.md`,
and `end-to-end-flow.md`.

## What's actually implemented

- **Company** — view/edit business profile, GST rate toggles (CGST/SGST/IGST).
- **Products** — master-detail catalog, grouped by category, full CRUD via Server Actions.
- **Customers** — master-detail directory with a real billing ledger (invoices + totals) in the detail pane.
- **Invoices** — list grouped by status (Overdue → Draft → Sent → Partially Paid → Paid) when unfiltered,
  a full invoice builder with live GST calculation and a Bill-To search that supports quick-adding a
  guest customer, and a printable invoice document view.
- **Reports** — billing trend chart, tax composition donut, top customers — all hand-rolled inline SVG,
  no charting dependency.
- **The business logic** (`src/lib/gst.ts`) is the real thing: CGST/SGST vs IGST split, line + overall
  discounts, rounding, credit-limit checks, status derivation from payments. Server Actions
  (`src/actions/*.ts`) recompute totals server-side on every write rather than trusting client input —
  see backend-documentation.md §3 for why.

## What's intentionally out of scope for this pass

- **Auth / multi-tenancy** — single-company assumption throughout, matching the prototype. See
  backend-documentation.md §7.
- **Mobile nav** — the sidebar hides below `md:`, but there's no bottom tab bar replacement yet.
- **Command palette / right-side sheet dialogs** — the HTML prototype's `⌘K` palette and slide-in sheets
  aren't rebuilt here; forms are plain pages/panels. Worth adding if you want that exact feel back.
- **Optimistic-update polish** — Products/Customers apply the edited row to local state immediately
  after a successful save; a failed save still shows the error, but there's no rollback animation.

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Point at a Postgres database.** Either a local Postgres or a free [Neon](https://neon.tech) project
works — copy its connection string into a `.env` file:
```bash
cp .env.example .env
# then edit .env and set DATABASE_URL
```

**3. Generate the Prisma client and create the schema:**
```bash
npm run db:generate
npm run db:migrate
```
(`db:migrate` will prompt you to name the migration — anything like `init` is fine.)

**4. Seed sample data** (Arctic Blocks Ice Co., a product catalog, a few customers, one invoice):
```bash
npm run db:seed
```

**5. Run it:**
```bash
npm run dev
```
Open http://localhost:3000 — it redirects straight to `/dashboard`.

## A note on how this was built

This was scaffolded and written inside a sandboxed container without open internet access to two
specific things Next.js/Prisma normally reach out to:

- **Prisma's query-engine binary** (`binaries.prisma.sh`) — so `npx prisma generate` could not be run
  or verified in that sandbox. It will work normally for you with regular internet access; if it
  doesn't, `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 npx prisma generate` is a fallback.
- **Google Fonts** (`fonts.googleapis.com`) — `next/font/google` fetches font files at build time;
  the sandboxed build failed here too, for the same reason.

Everything else was verified directly: dependencies installed clean with **0 vulnerabilities** (the
initially-planned Next.js 14.2.15 was upgraded on the spot after research turned up a disclosed
critical vulnerability — this ships on Next 16.3.4 / React 19 instead), and `tsc --noEmit` was run
and manually audited — every single error it produced traced back to the one root cause (Prisma
types not generated in that environment, e.g. `Company` not being an exported type yet); there were
zero errors of any other kind. That's a good signal, not a guarantee — please run through the app
yourself once it's up, especially the invoice builder's GST math against a few real scenarios
(same-state vs. interstate customer, partial payments, a discount) before trusting it with real data.

## Project structure

```
src/
  app/              Routes (App Router) — one folder per page, colocated client components
  actions/          Server Actions — one file per resource (products, customers, invoices, company, reports)
  components/
    shell/          TopBar, Sidebar
    ui/             Field, StatusBadge — small shared primitives
  lib/
    gst.ts          The authoritative billing math — read this first
    prisma.ts       Prisma client singleton
    get-company.ts  Single-tenant company lookup
    number-to-words.ts
prisma/
  schema.prisma
  seed.ts
```

## Suggested next steps

1. Run through backend-documentation.md §7's open items (multi-tenancy, soft-delete policy) before
   this handles a second real company.
2. Add the command palette and right-side sheet pattern from the original prototype if you want that
   interaction model back — end-to-end-flow.md documents how they're supposed to behave.
3. Add a mobile nav (bottom tab bar) — the prototype had one; this scaffold doesn't yet.
4. Consider caching computed invoice totals (a `total` column, refreshed on write) once invoice volume
   grows — right now Reports and the customer ledger recompute GST for every invoice on every request,
   which is correct but not free.
# invozy
