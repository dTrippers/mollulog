# Database

MolluLog의 runtime persistence는 PostgreSQL을 canonical store로 사용하며 Workers SSR/BFF에서 Hyperdrive를 거쳐 operation-scoped client로 접근합니다. D1은 final runtime binding이나 fallback store가 아니며, 기존 source table은 승인된 cutover 뒤 `zzz_` archive로만 보존합니다.

## Stack

- Database: PostgreSQL
- Connection path: Workers → uncached Hyperdrive → PostgreSQL
- ORM: Drizzle ORM with `drizzle-orm/node-postgres`
- PostgreSQL schemas: `app/db/postgres/schema.ts`
- PostgreSQL schema migrations: `db/postgres/migrations/*.sql`
- Cutover snapshot/import tooling: `db/postgres/scripts/d1-cutover-*.mjs`
- Historical source/archive migrations: `db/migrations/*.sql`

## Where models are defined

Domain models and PostgreSQL repositories are separated by responsibility.

- `app/models/*.ts` preserves domain-facing API and user-visible behavior.
- `app/db/postgres/*.ts` owns PostgreSQL queries, transforms, and operation spans.
- `app/db/postgres/schema.ts` is the typed PostgreSQL schema source.
- `app/domain` contains pure calculations and validation without database I/O.

Database access uses `withPostgresClient` from `app/lib/postgres.server.ts`. A repository creates and releases its client inside one operation; clients are never kept in module or request-global state. A transaction may span only the statements owned by that operation.

## Schema and type rules

- Every table has a generated `id` identity, `created_at`, and `updated_at` where the domain requires modification timestamps.
- Use PostgreSQL-native `timestamptz`, `boolean`, `jsonb`, identity columns, indexes, and unique indexes.
- Keep user-visible JSON/domain types at the repository boundary. Malformed required data is an explicit failure, not a fake empty value.
- Keep natural-key uniqueness and ordering in the schema and query. Add an index for every repeated lookup/order path.
- Domain validation belongs in application code and tests. Structural constraints such as `PRIMARY KEY`, `NOT NULL`, and unique indexes belong in the migration.
- The approved Pyroxene receipt `v1:` UTF-8 base64url representation is stable and must not be changed by unrelated work.

## PostgreSQL migration procedure

Migration files use `yyyymmddhhmmss_{name}.sql` and are applied through the repository's approved PostgreSQL migration process. The ten-table D1 transfer is an all-at-once operation; use [the cutover runbook](../migrations/d1-cutover.md) for freeze, protected snapshot, one-transaction import, parity, sequence repair, rollback, and archive gates.

The final cutover artifact does not provide D1 migration package commands, D1 bindings, or a live D1 fallback. `db/migrations` remains only as historical source/archive material until the separately authorized D1 cleanup operation is complete.

## Operational safety

- Do not print or persist database credentials. Read the approved 1Password fields individually and unset the variables after the operation.
- Keep snapshots outside the repository with mode `0600`; collector output is exclusive and never overwrites an existing file.
- Snapshot/import allowlists are exact. `cache_refresh_jobs` is imported directly to PostgreSQL in the pre-cutover deployment and is excluded from the ten-table D1 snapshot.
- Import count and both typed parity directions must pass before commit. Any row, transform, timeout, or sequence failure rolls back the entire transaction.
- Production cutover, KV mutation, deploy, and production database operations require an explicitly approved operator window; this implementation does not execute them.
