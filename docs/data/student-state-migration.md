# Student state: phase 1-5 cleanup

Student current values, ownership and relationship state live in `student_states`;
independent targets, planner membership and gift plans live in `student_targets`.
`student_state_audits` records changes in the same transaction as the writes.
The application no longer reads a migration flag or mirrors writes to legacy tables.
Per-user transaction advisory locks still serialize saves and imports.

The earlier backfill, parity and activation CLI has been removed. Activation was
completed with `users=4065 mismatches=0 activated=true`; the follow-up display-column
checks were rerun read-only after a timeout and all three reported zero violations.
This is the completed cutover's evidence, not a readiness check for another database.

## Archive scope

| Previous name | Preserved name |
| --- | --- |
| `recruited_students` | `zzz_recruited_students` |
| `student_growth` | `zzz_student_growth` |
| `user_relationship_levels` | `zzz_user_relationship_levels` |
| `student_state_migration_control` | `zzz_student_state_migration_control` |

The archive migration performs only table renames. It preserves rows, legacy shadow
current values, timestamps, columns, indexes, sequences, constraints and grants.
It does not rename indexes or sequences separately. Canonical row UIDs and the
membership/registration fields remain unchanged. The audit table remains active.
Archived tables are historical records, not a backup of subsequent canonical writes.

Keep previously applied SQL migration files unchanged: their checksums and history
are still needed. Fresh local fixtures can install the canonical schema directly;
they do not need to replay the retired migration CLI.

## Deployment and operational order

1. Confirm this database completed activation and display-column validation. Verify
   the current and target save, relationship/gift-plan, import and OCR flows. Every
   environment must complete cutover before deploying this cleanup version.
2. Deploy the cleanup version to all Workers and other participating services.
   This code runs both before and after the table renames. Drain the older Workers,
   queued/in-flight work, and preview/local services using the shared database.
   Stop direct SQL or external tools referencing the four old tables. A deployment
   record alone does not prove all such callers have stopped.
3. Use the approved operator's existing writer connection and TLS configuration to
   run `db/postgres/migrations/20261011000100_archive_student_state_legacy_tables.sql`:

   ```bash
   psql -X --no-psqlrc --set=ON_ERROR_STOP=1 \
     --command='SET search_path TO public' \
     --file=db/postgres/migrations/20261011000100_archive_student_state_legacy_tables.sql
   ```

   Select the intended database explicitly in that connection; the example sets
   the schema to `public`. The SQL uses the session search path. It requires the activated control record, locks
   all four tables, and renames them atomically. The lock timeout is one second;
   the statement timeout is 15 seconds. A lock timeout, inactive/missing flag,
   missing source, or destination-name collision aborts the transaction and leaves
   all names unchanged. Retry only after resolving the reported cause; do not
   reset flags or delete tables to make the migration pass.
4. Verify that all four `zzz_` tables exist, the original names are absent, and the
   preserved counts match the recorded pre-archive counts. Verify canonical reads,
   partial saves, independent/null targets, gift plans, imports and audit writes
   again. Keep the archived tables and all their data.

Deploy code **before** this SQL, unlike an additive schema migration: older Workers
still query the original control table even after activation and would fail after
the rename. After rename, do not deploy an older version or turn activation off.
Recover with a compatible forward fix. Running production SQL and deploying are
separate operator steps; adding this migration file does not execute them.

Forms still carry `stateFormat=nullable`. Missing/legacy formats remain rejected
at the write boundary because old full-value forms can overwrite independent
current/target values. This request guard does not read an archived control table.

## Validation

Use the selected official local environment and an isolated, uniquely named schema:

```bash
mllg local env STUDENT_STATE_POSTGRES_VALIDATION=1 \
  pnpm exec jest --runInBand --runTestsByPath \
  test/app/db/postgres/student-state.postgres.test.ts
```

The fixture validates activation and rename failures, exact preservation of the
four archived tables, canonical writes after the old names disappear, audit
atomicity, stale requests, and isolation between accounts. It creates and removes
only its own schema, never the shared `public` schema or production data.
