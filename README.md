# HappyMed Pharmacy — Inventory Management System

Batch-level inventory and expiry tracking for HappyMed Pharmacy.

## What it does

Tracks what is on the shelf, records every movement in and out, and warns about
medicines approaching their expiry date **per batch** — because the same product
routinely sits on the shelf under several lot numbers with different expiry
dates.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript |
| Database | Supabase (managed PostgreSQL) |
| ORM | Prisma 7 (driver adapter: `@prisma/adapter-pg`) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | Database-backed opaque sessions + bcrypt |
| Validation | Zod (shared between client and server) |

## Getting started

The database is **Supabase** (managed PostgreSQL), used for both development and
production.

### 1. Create the Supabase project

At supabase.com, create a project in the region closest to the pharmacy. Save
the database password it generates - it is shown only once.

### 2. Fill in `.env`

```bash
cp .env.example .env
```

From Supabase Dashboard -> **Connect**, copy two connection strings:

| Variable | Which connection | Port | Used by |
|---|---|---|---|
| `DATABASE_URL` | **Transaction** pooler | `6543` | The running app |
| `DIRECT_DATABASE_URL` | **Session** pooler | `5432` | `prisma migrate` only |

Both use the *pooler* host (`aws-0-<region>.pooler.supabase.com`) and the
tenant-prefixed username (`postgres.<project-ref>`). They differ only in port.

**Migrations must not go through port 6543.** Transaction-mode pooling cannot
carry DDL or the session-level advisory locks Prisma holds while migrating, so
migrations sent there hang or half-apply.

> **Do not use the Direct connection** (`db.<project-ref>.supabase.co:5432`)
> unless you have Supabase's IPv4 add-on. It resolves to an **IPv6 address only**,
> so on any network without an IPv6 route it fails with `ENOTFOUND` before it
> ever reaches Postgres. The Session pooler above is the IPv4-reachable
> equivalent and supports everything migrations need.

### TLS

Both URLs carry `uselibpqcompat=true&sslmode=require`.

Recent `pg` versions reinterpret a bare `sslmode=require` as `verify-full`, and
Supabase serves a certificate chain that is not rooted in the public CA store -
so without `uselibpqcompat=true` every connection fails with
`SELF_SIGNED_CERT_IN_CHAIN`. With it, traffic is **encrypted but the server
certificate is not verified**.

That is how most Supabase deployments run, and the exposure is narrow: it would
take a BGP- or datacenter-level attacker to exploit. To close it properly before
go-live, download the CA certificate from Dashboard -> Settings -> Database ->
SSL Configuration and switch both URLs to:

```
?sslmode=verify-full&sslrootcert=/absolute/path/to/prod-ca-2021.crt
```

### 3. Set up the schema

```bash
npm install
npm run db:deploy       # apply migrations
npm run db:seed         # demo catalogue, staff accounts and stock
npm run db:check-rls    # confirm the REST surface is closed
npm run dev
```

Open http://localhost:3000 and sign in with the credentials the seed prints.

## Supabase: closing the REST surface

Supabase publishes the `public` schema through PostgREST using the `anon` key,
which is public by design - it ships to browsers. Tables created by Prisma have
**no Row Level Security**, so without intervention every row in `Product`,
`Batch`, `StockMovement` and `User` is readable and writable by anyone holding
that key.

The `lock_down_public_schema` migration closes this: deny-all RLS on every
table, and the `anon` / `authenticated` roles revoked from the schema entirely,
including default privileges for tables added later. This app never uses
PostgREST - it connects directly as the table owner - so nothing in the
application is affected.

RLS is enabled **without `FORCE`** on purpose. A table's owner bypasses RLS, and
the app connects as that owner. Adding `FORCE` would lock out the application
itself, because there are deliberately no policies.

> **A table added by a future migration arrives with RLS off.** `npm run db:check-rls`
> fails if any table in `public` lacks RLS or if the API roles regain a grant.
> Run it in CI so the hole cannot reappear silently.

### Shadow database

`prisma migrate dev` needs a scratch database to diff against. `SHADOW_DATABASE_URL`
is optional - when unset, Prisma creates and drops a temporary database on the
target server. If the Supabase role cannot create databases, point
`SHADOW_DATABASE_URL` at a second free Supabase project instead.

### Before go-live

The free tier pauses projects after inactivity and has limited backups. Upgrade
to Pro for daily backups and point-in-time recovery **before** real stock data
goes in.

### Seeded accounts

| Email | Role |
|---|---|
| `owner@happymed.local` | Owner |
| `pharmacist@happymed.local` | Pharmacist |
| `staff@happymed.local` | Staff |

Password for all three comes from `SEED_OWNER_PASSWORD` in `.env`.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed demo data |
| `npm run db:check-rls` | Verify the Supabase REST surface stays closed |
| `npm run db:studio` | Prisma Studio |

## Design rules

These are not stylistic preferences. Breaking any of them produces an inventory
system that quietly loses count.

**1. Quantities are stored in base units.** The smallest dispensable unit — one
tablet, one millilitre — never packs. `unitsPerPack` is a display and data-entry
convenience only. The pharmacy dispenses loose units, so a schema that stored
"3.5 boxes" would be unreconcilable within a week.

**2. `StockMovement` is append-only.** Never `UPDATE`, never `DELETE`. A mistake
is corrected by appending an offsetting `ADJUSTMENT` with a reason. This is what
makes the audit trail worth having.

**3. `Batch.quantityOnHand` is a cache, and only `applyDelta` may write it.**
It is updated in the same transaction that appends the ledger row, by a single
conditional `UPDATE` that both mutates and validates. Reading a quantity into
JavaScript, subtracting, and writing it back would silently lose one of two
simultaneous dispenses. `findLedgerDiscrepancies()` proves the cache still
matches the ledger.

**4. Expiry status is never stored.** It is derived from `expiryDate` and the
current date on every read, against the `expiryDate` indexes. A stored status
column is wrong the moment the clock passes midnight.

**5. Nothing operational is hard-deleted.** Products, suppliers and users are
deactivated via `isActive`; batches move through `status`. Foreign keys into the
ledger must stay intact.

**6. Expiry status colours are not brand colours.** Red, orange and amber are
safety signals. They live in their own `--status-*` tokens and must never be
restyled to match the green brand palette.

## Layout

```
prisma/
  schema.prisma          Data model, with the invariants documented inline
  seed.ts                Demo data, created through the real ledger path
src/
  app/
    (app)/               Authenticated shell: dashboard, expiry, inventory...
    login/               Sign-in
    forbidden.tsx        403 page
  components/
    ui/                  shadcn primitives
    app-shell/           Sidebar, mobile nav, user menu
  lib/
    stock.ts             The ledger. All quantity changes go through here.
    expiry.ts            Pure expiry classification
    settings.ts          Runtime-tunable configuration
    auth/                Sessions, passwords, RBAC
    queries/             Read models for the dashboard and expiry pages
  proxy.ts               Edge gate: bounces requests with no session cookie
```

## Roles

| | Owner | Pharmacist | Staff |
|---|---|---|---|
| View inventory and alerts | ✓ | ✓ | ✓ |
| Dispense | ✓ | ✓ | ✓ |
| Receive, adjust, dispose | ✓ | ✓ | — |
| Manage catalogue and suppliers | ✓ | ✓ | — |
| Purchase orders | ✓ | ✓ | — |
| Users, settings, audit log | ✓ | — | — |

Enforced server-side. Hiding a nav link is cosmetic; every page and action
re-checks.

## What is built

All seven phases are implemented.

### Operations
- **Dashboard** - expiry tiles, reorder list, recent movements, stock value.
- **Expiry alerts** - every batch inside the warning window, filterable by
  severity, with value at risk.
- **Stock on hand** - batch-level view with adjust, quarantine/release, dispose
  and return-to-supplier, each requiring a reason.
- **Dispense** - product search, pack/loose entry, and a live FEFO preview that
  names the exact cartons to take off the shelf. Overriding the suggested batch
  requires a reason and is audited.
- **Receive** - books in deliveries, capturing lot number and expiry per carton.
  Refuses already-expired dates and refuses a known lot whose expiry disagrees.

### Catalogue
- **Products** - full CRUD with search and category/stock filters, a detail page
  showing every batch and the movement history, and a discontinue flow that
  refuses while stock is still on the shelf. The base unit locks once any batch
  exists, because changing it would silently reinterpret every recorded quantity.
- **Categories and suppliers** - CRUD with soft deactivation.

### Procurement
- **Purchase orders** - draft, submit, cancel, and receive line by line.
  Reorder suggestions are pre-filled from products below their reorder point,
  costed at what was last actually paid. Order status is recomputed from the
  lines rather than tracked separately, so the two cannot disagree. Cancelling
  is blocked once stock has been received against the order.

### Administration
- **Staff** - create accounts, change roles, reset passwords, deactivate.
  Deactivation and role changes revoke every active session immediately. The
  last active Owner cannot be demoted, deactivated, or self-demoted.
- **Settings** - pharmacy name, timezone, currency, locale, expiry thresholds
  and digest recipients. Timezone, currency and locale are validated by running
  them through `Intl` before they are saved.
- **Audit log** - searchable, filterable by person, with before/after values.
- **Reports** - stock valuation by category or supplier, wastage at acquisition
  cost, movement summary, and stock that has not moved at all in the period.

### Nightly job (`/api/cron/daily`)
Runs at 22:00 UTC (06:00 Manila). Four independent steps, so a mail outage
cannot stop the safety-critical one:

1. Quarantine every batch past its expiry date.
2. Reconcile the ledger against cached balances; any drift is logged and audited.
3. Send the expiry digest, if enabled.
4. Purge lapsed sessions.

Authenticated with a bearer `CRON_SECRET`, compared in constant time. An
unauthenticated caller gets a 404, not a 401, so the endpoint does not announce
itself.

## Security

- Database-backed opaque sessions; only a SHA-256 of the token is stored.
- bcrypt at 12 rounds, with a constant-time dummy comparison on unknown emails
  so response timing cannot enumerate staff accounts.
- Account lockout after 5 failed attempts, held in the database because
  serverless instances do not share memory.
- Every page and every Server Action re-checks permissions. Hiding a nav link is
  cosmetic only.
- CSP, HSTS, `frame-ancestors 'none'`, nosniff and a restrictive
  Permissions-Policy on every response.
- Supabase REST surface closed: deny-all RLS plus revoked `anon`/`authenticated`
  grants, verified by `npm run db:check-rls`.

Known gap: `script-src` still allows `'unsafe-inline'`, because Next injects an
inline bootstrap on every page. Tightening it needs per-request nonces plumbed
through `proxy.ts`.

## Before go-live

- [ ] Rotate the database password and remove seed accounts.
- [ ] Upgrade off the Supabase free tier for daily backups and point-in-time
      recovery, and to stop the project auto-pausing.
- [ ] Set `CRON_SECRET` to a real generated secret in production.
- [ ] Set `RESEND_API_KEY` and `DIGEST_FROM_EMAIL` if you want the digest emailed.
- [ ] Switch TLS to `verify-full` with Supabase's CA certificate.
- [ ] Add `npm run db:check-rls` to CI.
