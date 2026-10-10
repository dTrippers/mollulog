# Student state projection migration

This runbook covers the additive P1 release and the 1-2 runtime read switch. P1 readers use legacy tables; 1-2 readers use the new relational projection. Participating writers continue updating both sources in one PostgreSQL transaction, and the nullable-semantics switch stays off. This document does not authorize an operational database change or deployment.

## P1 local validation

Use the workspace `mllg local` wrapper and an isolated schema named `student_state_<name>` for automated PostgreSQL fixtures. The fixture creates a unique schema, installs its own legacy and additive tables, and verifies that schema is gone before passing. Never point a test fixture at `public` or another shared application schema.

Create an isolated schema and install the existing legacy fixture tables plus `20261010000100_create_student_state_projection.sql` with that schema as the session search path. Do not apply this migration to the shared `public` schema for implementation tests. Before testing, add fixtures for recruited-only, relationship-only, target-only, an empty growth registration, a target below current, gift plans, and two registration timestamps that differ only in microseconds.

Run the preflight against the isolated schema and review its counts:

```bash
mllg local pnpm student-state:migration preflight --schema student_state_validation
```

Any non-null legacy `student_growth` current field is an operator stop condition by default. Do not clear it or infer a replacement. Preflight reports these rows, and backfill fails explicitly without partially projecting that user's rows. After reviewing their meaning and choosing to preserve the service's current values, pass `--confirm-legacy-growth-current-reviewed` to preflight, backfill, and parity. This acknowledgement permits only the reviewed shadow-current values: current growth fields are sourced exclusively from `recruited_students`, and all legacy rows, values, targets, and timestamps remain unchanged. A legacy relationship gift plan that is not an object of finite numbers (`invalid_gift_plan_rows`) still blocks migration even with the acknowledgement; live writers reject such input instead of storing it.

P1 live writers leave these legacy shadow-current columns untouched; the projected current values come only from `recruited_students`. Without the acknowledgement, shadow-current values block backfill and parity. With it, preflight retains the actual `unsupported_student_growth_current_rows` count and appends `legacy_growth_current_policy=preserve-reviewed`; a nonzero count alone no longer causes an error exit. Do not require the count to become zero by clearing data. Invalid gift plans must still be zero, and parity must still report `mismatches=0` before advancing to the 1-2 read switch. The acknowledgement does not bypass host/schema validation, the external-writer confirmation, or the post-activation backfill/parity prohibition.

The application-level PostgreSQL fixture creates and drops its own uniquely named isolated schema, and verifies the schema is gone before passing. Run it only when the selected local configuration resolves `PGHOST` to `127.0.0.1`:

```bash
mllg local env pnpm_config_verify_deps_before_run=warn STUDENT_STATE_POSTGRES_VALIDATION=1 pnpm exec jest test/app/db/postgres/student-state-projection.postgres.test.ts --runInBand
```

Backfill acquires the same per-user transaction advisory lock as application writes, then reads both the latest legacy sources and existing projection rows. It sets or clears each source-backed side; if a legacy side disappeared during the P1 rolling period, it clears that side's fields and source UID while preserving the other side. If all relevant legacy sources disappeared, it clears the remaining values and tombstones the existing projection row without changing its UID or `created_at`. The write holds a shared lock on the migration-control row through commit. Backfill writes no audit rows. Parity reads groups of up to 25 users in one repeatable-read, read-only snapshot per group and checks the control record with an ordinary `SELECT`; it does not take row or advisory locks. Both commands require an explicit acknowledgement that nonparticipating writers are stopped:

```bash
mllg local pnpm student-state:migration backfill --schema student_state_validation --confirm-no-external-writers
mllg local pnpm student-state:migration parity --schema student_state_validation --confirm-no-external-writers
```

Backfill copies source registration timestamps at microsecond precision, reconciles projection-only rows left by old nonparticipating writers, preserves tombstones, and writes no user audit rows. A successful parity run reports `mismatches=0`. Re-run both commands after a live-write/backfill race and after stopping/restarting the backfill to verify resumability. Keep the fixture schema isolated and drop it only after the test evidence is collected.

Backfill writes batches of at most 200 source keys per statement rather than sending a separate statement for each state/target row. Every batch for one user remains inside the same user transaction and advisory lock; a later batch failure rolls back all changes for that user. Source reads and control-row checks still happen under the lock. This reduces database round trips without parallelizing user transactions or changing reconciliation rules.

The CLI reports committed progress after the first user, approximately every five seconds between user commits, and after the last user. `state_rows` and `target_rows` count upserted rows, including reconciled existing rows; they are not counts of newly created rows. A user transaction in progress is not included in these counters. After interrupting the CLI, run the same backfill command again with the same confirmed database/schema and flags. Completed users remain committed, the interrupted user's transaction rolls back when its connection closes, and replay preserves existing projection UIDs, creation times, and tombstone times. Do not delete partially backfilled projection data or replay schema migrations to restart.

Parity fetches legacy rows, projected states, and projected targets in three queries per group instead of per user. Joins and comparison keys include both `user_id` and `student_uid`, so identical student UIDs in different accounts remain independent. The comparison still checks every field, source registration timestamps at microsecond precision, missing rows, extra active rows, and tombstones; invalid gift plans and unreviewed shadow-current values still fail explicitly. Progress is reported after the first group, approximately every five seconds between groups, and after the last group. Parity never updates source/projection/control/audit rows and may be interrupted and restarted with the same command. Each group has a consistent snapshot; the full command is not a single global snapshot, just as the previous per-user command was not.

## 1-2 runtime read switch

Before deploying 1-2, verify that the 1-1 operational parity run reports `mismatches=0`. Runtime reads then use `student_states` and `student_targets`; participating writers continue mirroring every change to the legacy tables and projection in one transaction. No runtime fallback to legacy reads is provided.

While nullable semantics is off, the 1-2 version can be redeployed because it still mirrors writes to the legacy tables. Once nullable semantics has been activated, do not redeploy 1-1 or 1-2: their writes are rejected with a stale-state conflict and switching the control row off would make canonical-only data diverge from the legacy tables.

## 1-3/1-4 canonical writes and nullable semantics

The `nullable_semantics_enabled` control value is the single activation point. While it is false, the new Worker keeps the 1-2 write path and UI semantics. After activation, it writes only `student_states` and `student_targets`, allows current and target values to be independent, and rejects requests from 1-1/1-2 clients with the typed stale-state conflict. Activation is irreversible; recover from problems with a compatible forward fix.

Before activation, verify all of the following against the target database: the running Worker version and in-flight requests; preview and local services that share the database; and every direct SQL, external integration, or other writer. Stop every nonparticipating writer before acknowledging the command. The acknowledgement is an operator assertion, not an automated discovery mechanism.

Run the gates in order, then activate with the same explicit schema:

```bash
mllg local pnpm student-state:migration preflight --schema student_state_validation
mllg local pnpm student-state:migration backfill --schema student_state_validation --confirm-no-external-writers
mllg local pnpm student-state:migration parity --schema student_state_validation --confirm-no-external-writers
mllg local pnpm student-state:migration activate --schema student_state_validation --confirm-no-external-writers
```

`activate` uses a READ COMMITTED transaction, sets a 60-second `lock_timeout`, and locks the control row `FOR UPDATE`. It waits for writers that already hold the row's shared lock; later writers wait until activation commits and then use nullable semantics. The command checks parity for every user while it holds the lock. It leaves the switch off and exits with a nonzero status if parity reports any mismatch. An already enabled switch is an explicit error. After a successful commit it reports the recruited, planner, and relationship display-column invariant counts; all must be zero before proceeding.

Never turn the switch off after activation. Canonical-only writes no longer update the legacy tables, so disabling the switch would expose stale legacy data and allow old-version writes to overwrite the canonical state. Use forward fixes only. Do not use `backfill` or `parity` after activation; the CLI rejects those commands.

The 1-5 stage may begin only after activation completed with `mismatches=0`, every display-column invariant count was zero, and all 1-1/1-2 Workers and in-flight requests have exited. Before archiving legacy tables, also verify that the application and operational tooling no longer reference them.

## Operator use against a service schema

The CLI requires an explicit, lowercase PostgreSQL user-schema identifier of at most 63 characters. It accepts `public` as well as isolated test schemas. Before any operation it sets the session search path to only that schema, verifies that all seven required tables are base tables there, and checks the columns used by the migration. It does not create schemas or tables. A missing, incompatible, or ambiguous target stops before backfill.

`preflight` reports unsupported legacy current-growth values and does not mutate data. Before `backfill` or `parity`, an operator must verify the actual running Worker versions and in-flight requests, every direct SQL or external writer, and all preview/local services using the same database. Only after every nonparticipating writer has stopped may the operator pass `--confirm-no-external-writers`. This explicit flag does not replace the operational review. A nonzero parity result is a stop condition; do not advance the rollout.

For a later separately authorized service-schema operation, use the approved environment wrapper and select the target schema explicitly, for example:

```bash
mllg local pnpm student-state:migration preflight --schema public
mllg local pnpm student-state:migration backfill --schema public --confirm-no-external-writers
mllg local pnpm student-state:migration parity --schema public --confirm-no-external-writers
```

For an explicitly selected remote database, keep its existing `PGHOST`, port, database, credentials, and TLS settings. Append `--confirm-db-host <verified-host>` to each command; the value must exactly match the resolved `PGHOST`. A missing `PGHOST`, an unconfirmed non-loopback host, or a mismatched confirmation stops before connecting. Existing `PGHOST=127.0.0.1` commands still work without the option. `LOCAL_DB_ALLOWED_HOSTS` is a development setting and does not replace this operator confirmation.

For example, in a shell where the approved production `PG*` variables have already been resolved, replace `db.example.com` below with the independently verified target hostname:

```bash
mise exec -- pnpm student-state:migration preflight --schema public --confirm-db-host db.example.com
mise exec -- pnpm student-state:migration backfill --schema public --confirm-db-host db.example.com --confirm-no-external-writers
mise exec -- pnpm student-state:migration parity --schema public --confirm-db-host db.example.com --confirm-no-external-writers
```

Host confirmation does not replace schema validation or the nonparticipating-writer check. These commands document the tool interface only; production operations still require an explicitly selected and authorized target. Run the host-validation tests without database access with `mise exec -- node --test scripts/student-state-migration.test.mjs`.

### Preserve reviewed legacy current values

If an operator has reviewed non-null legacy growth-current values and selected the existing service values as authoritative, append the acknowledgement to every stage below. Keep the selected database's existing credentials and TLS configuration; replace the hostname with the verified target. These commands do not clear or update any legacy source row:

```bash
mise exec -- pnpm student-state:migration preflight --schema public --confirm-db-host db.example.com --confirm-legacy-growth-current-reviewed
mise exec -- pnpm student-state:migration backfill --schema public --confirm-db-host db.example.com --confirm-no-external-writers --confirm-legacy-growth-current-reviewed
mise exec -- pnpm student-state:migration parity --schema public --confirm-db-host db.example.com --confirm-no-external-writers --confirm-legacy-growth-current-reviewed
```

For example, a reviewed preflight can succeed with `unsupported_student_growth_current_rows=264 invalid_gift_plan_rows=0 legacy_growth_current_policy=preserve-reviewed`. The count is preserved for visibility. Conflicting old growth-current values never overwrite recruited current values, including explicit nulls and lower values. A growth row without a recruited row does not recreate ownership or contribute growth-current fields; its targets and any separate relationship record are still migrated. Original rows remain available for comparison until a separately authorized legacy archive/removal operation. This preservation is not a point-in-time database backup and does not replace the rollout's database backup.

Run the CLI regression against the approved local database with an isolated, uniquely named schema; it creates and drops only its own fixture schema:

```bash
mllg local env STUDENT_STATE_POSTGRES_VALIDATION=1 node --test scripts/student-state-migration.test.mjs
```

## Operator gates before a production stage transition

Before each later release or backfill, verify the actual running Worker versions and in-flight requests, all direct SQL writers and external integrations, and every preview or local service connected to the same database. A repository SHA or deployment record alone does not prove that a nonparticipating writer has stopped. If any such writer remains, or parity is nonzero, stop before advancing the stage.

The sequence is additive schema plus dual-write, backfill and parity, new reads with legacy mirroring, then one release that combines canonical-only writes with independent nullable semantics. Archive legacy tables only after every version and tool that references them has exited. The P1 release establishes dual-write; 1-2 delivers the read switch while legacy writes remain mirrored. This runbook documents the operator gates; it does not authorize production migrations, activation, deployment, or stage transitions.

After canonical-only writes begin, do not roll back to a version that reads stale legacy tables. Recover with a compatible version that understands canonical student state.
