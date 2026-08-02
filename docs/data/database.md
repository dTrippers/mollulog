# Database

This document does not list every table. Instead it captures the D1 / Drizzle modeling rules, canonical-store principles, and migration procedure.

## Stack

- DB: Cloudflare D1
- ORM: Drizzle ORM
- Migrations: `db/migrations/*.sql`
- Operational queries: `db/operations/*.sql`

## Where models are defined

Rather than a single central `schema.ts`, table definitions and domain logic are distributed across `app/models/*.ts`.

For example:

- `sqliteTable(...)` definitions
- D1 query / insert / update functions
- read logic combined with caching

A new DB task usually flows as:

1. Add SQL to `db/migrations`.
2. Add the table / functions to the relevant `app/models/*.ts`.
3. Use that model from routes, features, and views.

SQL that is not a schema change but a one-off correction, validation, or re-aggregation a person must run explicitly belongs in `db/operations`, not `db/migrations`.

## Naming and responsibility

- Table variables generally use a `*Table` suffix.
- DB access functions use names that express domain intent.
- Push SQL-flavored branching down to `models` rather than growing it in routes.
- Models handle data access only (CRUD, BAQL reads, source cache, normalization). Pure logic such as scoring or simulation belongs in `app/domain`, and screen composition belongs in `app/views`.
- Do not extend legacy tables in an area where a new canonical store is already defined.

## Validation boundary

- Do not add database `CHECK` constraints for domain or application validation in D1 or PostgreSQL migrations and Drizzle schemas.
- Validate allowed values, required combinations, ranges, and other domain rules in the application layer and cover them with tests.
- Structural declarations such as primary keys, `NOT NULL`, and indexes are not part of this restriction.

## Drizzle usage

```ts
import { drizzle } from "drizzle-orm/d1";

export async function getSomething(env: Env) {
  const db = drizzle(env.DB);
  return db.select();
}
```

- Split long DB logic into model functions rather than writing it directly in `loader` / `action`.
- Sort and filter at the DB level where possible.
- Given D1's characteristics, avoid a single oversized query or an excessive `IN` clause.

## Operational queries

`db/operations` holds operational SQL kept out of the schema migration chain.

For example:

- copy-only data corrections run once after a specific deploy order
- operational data validation or aggregation queries
- manual recovery queries hard to fold into automatic migration

Operational queries are not run with `pnpm dev:db:migrate` or `pnpm prod:db:migrate`. When one must run, execute it directly with a command that makes its purpose and target environment explicit, such as `wrangler d1 execute`. At the top of the file, note the run conditions, whether it is re-runnable, and that it is not a migration.

## Migration procedure

### Migration file name

New migration files use the `yyyymmddhhmmss_{name}.sql` format.

- Example: `20260429003526_rename_unused_tables_with_zzz_prefix.sql`
- Use a four-digit year.
- A second-precision timestamp reduces ordering conflicts when several people contribute at once.

### Apply locally

```bash
pnpm dev:db:migrate
```

### Apply to production

```bash
pnpm prod:db:migrate
```

### Pull production D1 to local

```bash
pnpm prod:db:pull
```

This command exports the remote D1 and overwrites the local state. Back up first if you need to keep local data.

## Notes

- D1 is SQLite-based, so account for data type and SQL feature differences.
- Migrations are managed one-directionally by default.
- Verify large structural changes on staging or a local replica first.
- The documentation does not keep a full table list. For the exact current state, read `db/migrations/` and `app/models/`.
