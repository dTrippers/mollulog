# Student state projection migration

This runbook covers the additive P1 release. Legacy tables remain the read source; every participating writer updates legacy and the new relational projection in one PostgreSQL transaction. The nullable-semantics switch stays off. This document does not authorize an operational database change or deployment.

## P1 local validation

Use the workspace `mllg local` wrapper and an isolated schema named `student_state_<name>` for automated PostgreSQL fixtures. The fixture creates a unique schema, installs its own legacy and additive tables, and verifies that schema is gone before passing. Never point a test fixture at `public` or another shared application schema.

Create an isolated schema and install the existing legacy fixture tables plus `20261010000100_create_student_state_projection.sql` with that schema as the session search path. Do not apply this migration to the shared `public` schema for implementation tests. Before testing, add fixtures for recruited-only, relationship-only, target-only, an empty growth registration, a target below current, gift plans, and two registration timestamps that differ only in microseconds.

Run the preflight against the isolated schema and review its counts:

```bash
mllg local pnpm student-state:migration preflight --schema student_state_validation
```

Any non-null legacy `student_growth` current field is an operator stop condition. Do not clear it, infer a replacement, or continue the backfill until its meaning is resolved. Preflight reports these rows, and backfill fails explicitly without partially projecting that user's rows. A legacy relationship gift plan that is not an object of finite numbers (`invalid_gift_plan_rows`) is the same kind of stop condition; live writers reject such input instead of storing it.

P1 live writers leave these legacy shadow-current columns untouched; the projected current values come only from `recruited_students`. This does not relax the migration gate: while preflight or backfill reports a shadow-current value, do not complete parity or advance to P2 read switching or later legacy fadeout.

The application-level PostgreSQL fixture creates and drops its own uniquely named isolated schema, and verifies the schema is gone before passing. Run it only when the selected local configuration resolves `PGHOST` to `127.0.0.1`:

```bash
mllg local env pnpm_config_verify_deps_before_run=warn STUDENT_STATE_POSTGRES_VALIDATION=1 pnpm exec jest test/app/db/postgres/student-state-projection.postgres.test.ts --runInBand
```

Backfill acquires the same per-user transaction advisory lock as application writes, then reads both the latest legacy sources and existing projection rows. It sets or clears each source-backed side; if a legacy side disappeared during the P1 rolling period, it clears that side's fields and source UID while preserving the other side. If all relevant legacy sources disappeared, it clears the remaining values and tombstones the existing projection row without changing its UID or `created_at`. The write holds a shared lock on the migration-control row through commit. Backfill writes no audit rows. Parity reads a repeatable-read, read-only snapshot and checks the control record with an ordinary `SELECT`; it does not take row or advisory locks. Both commands require an explicit acknowledgement that nonparticipating writers are stopped:

```bash
mllg local pnpm student-state:migration backfill --schema student_state_validation --confirm-no-external-writers
mllg local pnpm student-state:migration parity --schema student_state_validation --confirm-no-external-writers
```

Backfill copies source registration timestamps at microsecond precision, reconciles projection-only rows left by old nonparticipating writers, preserves tombstones, and writes no user audit rows. A successful parity run reports `mismatches=0`. Re-run both commands after a live-write/backfill race and after stopping/restarting the backfill to verify resumability. Keep the fixture schema isolated and drop it only after the test evidence is collected.

## Operator use against a service schema

The CLI requires an explicit, lowercase PostgreSQL user-schema identifier of at most 63 characters. It accepts `public` as well as isolated test schemas. Before any operation it sets the session search path to only that schema, verifies that all seven required tables are base tables there, and checks the columns used by the migration. It does not create schemas or tables. A missing, incompatible, or ambiguous target stops before backfill.

`preflight` reports unsupported legacy current-growth values and does not mutate data. Before `backfill` or `parity`, an operator must verify the actual running Worker versions and in-flight requests, every direct SQL or external writer, and all preview/local services using the same database. Only after every nonparticipating writer has stopped may the operator pass `--confirm-no-external-writers`. This explicit flag does not replace the operational review. A nonzero parity result is a stop condition; do not advance the rollout.

For a later separately authorized service-schema operation, use the approved environment wrapper and select the target schema explicitly, for example:

```bash
mllg local pnpm student-state:migration preflight --schema public
mllg local pnpm student-state:migration backfill --schema public --confirm-no-external-writers
mllg local pnpm student-state:migration parity --schema public --confirm-no-external-writers
```

These commands document the tool interface only. This implementation does not authorize an operational or production database connection, migration, backfill, deployment, or stage transition. The host restriction and pending environment confirmation must be resolved before connecting to any non-loopback selected target. Do not change credentials, local/remote environment selection, or database allowlists to bypass that restriction.

## Operator gates before a production stage transition

Before each later release or backfill, verify the actual running Worker versions and in-flight requests, all direct SQL writers and external integrations, and every preview or local service connected to the same database. A repository SHA or deployment record alone does not prove that a nonparticipating writer has stopped. If any such writer remains, or parity is nonzero, stop before advancing the stage.

The required sequence is additive schema plus dual-write, backfill and parity, new reads with legacy mirroring, canonical-only writes after every dual-write version exits, independent nullable semantics after all servers and clients are compatible, and legacy-table archive only after every reference has ended. This P1 implementation delivers only the first stage and its tooling. Do not enable nullable semantics, switch reads, remove legacy writes, archive tables, or perform a production migration as part of this runbook.

After canonical-only writes begin, do not roll back to a version that reads stale legacy tables. Recover with a compatible version that understands canonical student state.
