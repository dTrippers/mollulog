# Database

MolluLog의 runtime persistence는 PostgreSQL을 canonical store로 사용하며 Workers SSR/BFF에서 Hyperdrive를 거쳐 operation-scoped client로 접근합니다.

## Stack

- Database: PostgreSQL
- Connection path: Workers → uncached Hyperdrive → PostgreSQL
- ORM: Drizzle ORM with `drizzle-orm/node-postgres`
- PostgreSQL schemas: `app/db/postgres/schema.ts`
- PostgreSQL schema migrations: `db/postgres/migrations/*.sql`
- Retired migrations from a former store: `db/migrations/*.sql` (do not add to or apply them)

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
- Do not add PostgreSQL `CHECK` constraints. Validate value ranges and domain rules in application code instead; `pnpm run lint:postgres-migrations` rejects `CHECK` constraints in both migrations and the Drizzle schema.
- The approved Pyroxene receipt `v1:` UTF-8 base64url representation is stable and must not be changed by unrelated work.

## PostgreSQL migration procedure

For the shared local development DB, follow [Local development](../development.md).
Run `mise exec -- pnpm dev:db:migrate <new-file.sql>` for the task's selected SQL.
Existing untracked files have unknown application history and must not be replayed.
This local command is separate from the production procedure below.

Migration files use `yyyymmddhhmmss_{name}.sql` and are applied through the repository's approved PostgreSQL migration process. Apply and verify every required migration before deploying code that depends on the new schema. Runtime deploy commands never apply schema migrations automatically.

## Retiring tables and columns

- Do not drop a table or column. Leave a table that is no longer used in place; after a retention period, rename it with the `zzz_` prefix in a separate change.
- A `DROP` is acceptable only when a preceding step has already preserved all of that data intact elsewhere, for example a migration that copies every value into the new table or column before dropping the old one. A copy that keeps only some columns or converts values lossily does not qualify.

## Operational safety

- Do not print or persist database credentials. Read the approved 1Password fields individually and unset the variables after the operation.
- Run production schema changes in an explicitly approved operator window and verify the exact migration state before deploying dependent code.
- Keep credentials out of command arguments, logs, and repository files.
