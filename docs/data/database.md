# Database

MolluLog의 runtime persistence는 PostgreSQL을 canonical store로 사용하며 Workers SSR/BFF에서 Hyperdrive를 거쳐 operation-scoped client로 접근합니다. D1은 final runtime binding이나 fallback store가 아니며, 기존 source table은 승인된 cutover 뒤 `zzz_` archive로만 보존합니다.

## Stack

- Database: PostgreSQL
- Connection path: Workers → uncached Hyperdrive → PostgreSQL
- ORM: Drizzle ORM with `drizzle-orm/node-postgres`
- PostgreSQL schemas: `app/db/postgres/schema.ts`
- PostgreSQL schema migrations: `db/postgres/migrations/*.sql`
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
- Do not add PostgreSQL `CHECK` constraints. Validate value ranges and domain rules in application code instead; `pnpm run lint:postgres-migrations` rejects `CHECK` constraints in both migrations and the Drizzle schema.
- The approved Pyroxene receipt `v1:` UTF-8 base64url representation is stable and must not be changed by unrelated work.

## PostgreSQL migration procedure

For the shared local development DB, follow [Local development](../development.md).
Run `mise exec -- pnpm dev:db:migrate <new-file.sql>` for the task's selected SQL.
Existing untracked files have unknown application history and must not be replayed.
This local command is separate from the production procedure below.

Migration files use `yyyymmddhhmmss_{name}.sql` and are applied through the repository's approved PostgreSQL migration process. Apply and verify every required migration before deploying code that depends on the new schema. Runtime deploy commands never apply schema migrations automatically.

The runtime does not provide D1 migration commands, D1 bindings, or a live D1 fallback. `db/migrations` remains historical source/archive material and must not be used for new runtime persistence.

## Operational safety

- Do not print or persist database credentials. Read the approved 1Password fields individually and unset the variables after the operation.
- Run production schema changes in an explicitly approved operator window and verify the exact migration state before deploying dependent code.
- Keep credentials out of command arguments, logs, and repository files.

## Haiku recruitment classification rollout

The runtime uses only `community_posts.recruitment_classification`: `NULL`
(not classified or not eligible), `pending`, `failed`, `result`, or `other`.
Eligibility is checked when creating/editing a root opinion, using its original
creation time and the recruitment start. Replies are not classified. A failed
classification remains visible. Only another author's `result` is hidden when
the viewer enables the existing setting.

Classification responses update only an unresolved opinion whose current
plaintext body still equals the classified body. A late failure cannot overwrite
a settled result. A late success can recover a failed attempt for the same body,
including an A → B → A edit sequence. Classification updates do not change the
post's display/edit timestamp.

Use one authorized operator window for the schema/code switch:

1. Provision the Worker secret `ANTHROPIC_API_KEY` in each target environment.
   Local launchers must inject it through the existing environment mechanism.
   Use a Claude Platform API key; subscription OAuth credentials are not used.
   Before deployment, validate a request through this API path and confirm the
   Axiom dataset retention policy. These external checks are deferred until
   deployment preparation; implementation tests do not require live credentials.
2. Pause opinion create/edit requests and drain existing old-version invocations
   and their background classification jobs. Confirm the legacy table has no
   `pending` rows. Keep writes paused through step 4: the old code does not write
   the new column, so mixing writers during backfill would lose updates.
3. Back up the legacy table and apply only
   `20261024000100_simplify_recruitment_classification.sql` through the approved
   PostgreSQL migration process. It validates legacy rows before copying them.
   It preserves manual corrections as ordinary `result`/`other` values and keeps
   failures distinct from missing classifications. It leaves the old table intact.
4. Deploy the new application and confirm it reads/writes the new column and
   emits classification logs. Resume opinion writes after every active version
   uses the new code. Verify own-post visibility, filtering, and failure handling.
   The retained legacy table is a snapshot, not a live replica: after new writes
   resume, reverting to old code also requires an explicit data reconciliation.
5. After verification, explicitly run
   `db/postgres/operations/20261024000200_drop_recruitment_opinion_extension.sql`.
   This separate cleanup is not part of the normal migration batch and removes
   the legacy rollback source. Do not roll back to old code after cleanup.

The read-only production preflight on 2026-10-24 found 20 `result` values
(including 4 manual corrections), 12 `other`, 337 `failed`, and 1,837 `NULL`.
There were no pending jobs, orphan rows, or completed opinions before recruitment
start. Treat these as a dated snapshot; recount during the operator window.
Existing failed opinions are not automatically reclassified by this migration.

Each classification execution logs its model, prompt version, verdict when
available, whether it updated the current opinion, duration, and success/failure.
The existing Workers Observability `axiom-logs` destination receives these logs
at the configured sampling rate of 1. Opinion text, author information, and API
credentials are excluded. Classification uses the existing `getLogger` transport
and does not add a second logging client.
Axiom retention is an account/dataset setting, not guaranteed by Worker config.
Confirm the actual dataset retention and export policy before calling this a
long-term archive. [Axiom retention settings](https://axiom.co/docs/reference/datasets#specify-data-retention-period)
are plan-dependent: Cloud supports custom retention including Forever, while
other plans cannot extend their default retention. Check the existing `axiom-logs`
dataset and organization settings without changing shared policy as part of a
code deployment. This change does not create an R2 archive or an audit table.
