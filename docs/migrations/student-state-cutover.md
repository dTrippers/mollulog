# Student-state Hyperdrive cutover runbook

This runbook prepares the eight student-state tables for a PostgreSQL direct
cutover. It is intentionally repository-only: do not run a remote migration,
import, deploy, or KV mutation while preparing a release candidate.

## Scope and hard stops

The snapshot allowlist is exactly:

`recruited_students`, `student_growth`, `user_relationship_levels`,
`growth_resource_inventory`, `sync_drafts`, `sync_draft_entries`,
`user_resource_inventory_drafts`, `user_resource_inventory_draft_items`.

The source identity for every table is `uid` (including rows whose
`sync_drafts.source_ref` is null). `source_ref` is only covered by the partial
unique index for non-null values. A count, UID/key, or canonical-content parity
mismatch is a hard stop; do not clear maintenance or continue deployment.

Never use `wrangler d1 export`. The collector uses read-only keyset SELECTs and
the importer only executes the explicit allowlist. Data replacement and parity
run as one PostgreSQL transaction using chunks of at most 500 rows, deleting
stale target rows and rolling back on any import or parity failure. Identity
sequences are repaired only after `COMMIT` because PostgreSQL sequence changes
are non-transactional. A sequence-repair failure is a hard stop with data
already committed; rerun the convergent importer before enabling writes.

## Local preparation

From the MolluLog worktree:

```sh
mise exec -- ./node_modules/.bin/react-router typegen
mise exec -- ./node_modules/.bin/tsc
mise exec -- ./node_modules/.bin/jest test/db/student-state-migration.test.ts test/app/lib/student-state-cutover.test.ts
mise exec -- node --test db/postgres/scripts/student-state-d1-collect.test.mjs db/postgres/scripts/student-state-transfer.test.mjs
git diff --check
```

Apply the 13-table `zzz_` migration to a disposable/local SQLite database and
run the migration test. The exact pre-cutover gate is the following list only:

`timeline_contents`, `posts`, `content_favorite_students`,
`content_favorite_counts`, `coupons`, `coupon_registrations`,
`feedback_tickets`, `feedback_replies`, `community_posts`,
`community_comments`, `community_post_likes`, `community_post_tags`,
`recruitment_results`.

Confirm each `zzz_` name exists and all eight source names remain unchanged.
Do not rename the eight source tables in this migration. Source cleanup is a
separate, post-observation approval.

## Operational order

1. Apply the separately observed 13-table D1 `zzz_` migration before any
   cutover writes. This is the pre-cutover gate and is not the eight-table
   cleanup. First inspect pending migrations and hard-stop on any unexpected
   entry; at minimum the reviewed `20260807000200_rename_unused_tables_with_zzz_prefix.sql`
   file must be pending:

   ```sh
   mise exec -- ./node_modules/.bin/wrangler d1 migrations list DB --remote --env production
   mise exec -- ./node_modules/.bin/wrangler d1 migrations apply DB --remote --env production
   mise exec -- ./node_modules/.bin/wrangler d1 execute DB --remote --env production --command="SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('zzz_timeline_contents','zzz_posts','zzz_content_favorite_students','zzz_content_favorite_counts','zzz_coupons','zzz_coupon_registrations','zzz_feedback_tickets','zzz_feedback_replies','zzz_community_posts','zzz_community_comments','zzz_community_post_likes','zzz_community_post_tags','zzz_recruitment_results') ORDER BY name;" --json
   mise exec -- ./node_modules/.bin/wrangler d1 execute DB --remote --env production --command="SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('recruited_students','student_growth','user_relationship_levels','growth_resource_inventory','sync_drafts','sync_draft_entries','user_resource_inventory_drafts','user_resource_inventory_draft_items') ORDER BY name;" --json
   ```

   The first query must return exactly the 13 expected `zzz_` names and the
   second must return all eight unchanged source names. Stop if either query
   differs; do not rename any source table in this migration.
2. Apply the PostgreSQL schema and run schema/preflight checks. The repository
   migration is applied with `psql` in an operator-controlled session; do not
   use the D1 migration command for this file. Verify the application role
   keeps its normal short `statement_timeout`; the one-off importer uses its
   own longer session timeout:

   ```sh
   TARGET_PG_URL="$(op read 'op://<vault>/<item>/TARGET_PG_URL')"
   mise exec -- psql "$TARGET_PG_URL" \
     --set=ON_ERROR_STOP=1 \
     --file=db/postgres/migrations/20260807000100_create_student_state.sql
   mise exec -- psql "$TARGET_PG_URL" --set=ON_ERROR_STOP=1 \
     --command="SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('recruited_students','student_growth','user_relationship_levels','growth_resource_inventory','sync_drafts','sync_draft_entries','user_resource_inventory_drafts','user_resource_inventory_draft_items') ORDER BY table_name;" \
     --command="SHOW statement_timeout;"
   unset TARGET_PG_URL
   ```

   The schema/preflight command must show all eight tables and the expected
   application timeout. Do not continue if a migration or preflight query
   fails.
3. Take the initial read-only D1 snapshot. Replace `D1_DATABASE` and
   `SNAPSHOT_FILE` with operator-provided values; do not put credentials in a
   file:

   ```sh
   umask 077
   mise exec -- node db/postgres/scripts/student-state-d1-collect.mjs \
     --database D1_DATABASE --env production --output SNAPSHOT_FILE
   ```

4. Import and verify the snapshot using a secret-manager-provided URL. The
   URL must not be printed, committed, or persisted:

   ```sh
   TARGET_PG_URL="$(op read 'op://<vault>/<item>/TARGET_PG_URL')" \
   mise exec -- node db/postgres/scripts/student-state-transfer.mjs \
     --snapshot SNAPSHOT_FILE
   unset TARGET_PG_URL
   ```

   Stop on any importer error or count/UID/canonical-content parity mismatch.
5. Set the one targeted maintenance key in the shared production KV namespace
   used by both services. MolluLog's `KV_CACHE` and MolluConnect's `KV` binding
   point to the same production namespace (`a613bc84ffeb4362b3deaa05c617a7b3`),
   so both services must observe this one key before proceeding:

   ```sh
   MAINTENANCE_KEY='mollu:student-state-cutover:maintenance'
   KV_NAMESPACE_ID='a613bc84ffeb4362b3deaa05c617a7b3'
   mise exec -- ./node_modules/.bin/wrangler kv key put "$MAINTENANCE_KEY" 1 --namespace-id "$KV_NAMESPACE_ID"
   ```

   A present `KV_CACHE` key freezes only student-state writes. A KV read
   failure also fails closed. Do not clear the key until step 11. Confirm the
   MolluConnect `KV` binding resolves this same key before continuing.
6. Deploy MolluConnect once with its existing structured 503 and
   `Retry-After` behavior. Use the separately approved MolluConnect release
   command; do not edit this repository or deploy unrelated services.
7. Build and deploy only the MolluLog App Worker. The app config is
   `wrangler.jsonc`; do not run the package `prod:deploy` script because it
   also deploys `dist/cron/wrangler.json`. Use:

   ```sh
   CLOUDFLARE_ENV=production mise exec -- ./node_modules/.bin/react-router build --mode production
   mise exec -- ./node_modules/.bin/wrangler deploy --env production
   ```

   Do not deploy the cron Worker.
8. Verify a frozen write returns the typed maintenance result with HTTP 503,
   `Retry-After: 30`, and no PostgreSQL or D1 mutation. Verify browser paths
   restore optimistic state and show the shared maintenance toast. The current
   repository has no background writer for these eight tables, so there is no
   skip hook to invoke; if one is added later it must report `skipped`, not
   `failed`. Example read-only smoke requests and one guarded-write probe:

   ```sh
   AUTH_COOKIE='<authenticated-session-cookie>'
   curl --fail-with-body -sS -H "Cookie: $AUTH_COOKIE" "https://mollulog.net/@<username>/students"
   curl --fail-with-body -sS -H "Cookie: $AUTH_COOKIE" "https://mollulog.net/utils/growth"
   curl --fail-with-body -sS -H "Cookie: $AUTH_COOKIE" "https://mollulog.net/utils/relationship"
   curl --fail-with-body -sS -H "Cookie: $AUTH_COOKIE" "https://mollulog.net/utils/resources/inventory"
   curl --fail-with-body -sS -H "Cookie: $AUTH_COOKIE" "https://mollulog.net/@<username>/pickups"
   curl -i -sS -X POST "https://mollulog.net/api/recruitment-results" \
     -H "Cookie: $AUTH_COOKIE" \
     -H 'content-type: application/json' \
     --data '{"action":"complete"}'
   unset AUTH_COOKIE
   ```

   The guarded probe must be `503`, include `Retry-After: 30`, have
   `kind=studentStateMaintenance` and `code=STUDENT_STATE_MAINTENANCE`, and
   leave both stores unchanged. Treat any `2xx`, missing header/payload, or
   observed write as a hard stop.
   With MolluConnect deployed once, run an authenticated draft-write probe
   against the same key (using an operator-provided scoped key, never storing
   it in this repository):

   ```sh
   CONNECT_DRAFT_WRITE_KEY='<authenticated-draft-write-api-key>'
   curl -i -sS -X POST "https://connect.mollulog.net/api/v1/drafts" \
     -H "Authorization: Bearer $CONNECT_DRAFT_WRITE_KEY" \
     -H 'content-type: application/json' \
     --data '{"type":"student_state","source":{"toolName":"cutover-probe"},"entries":[{"studentId":"__student-state-maintenance-probe__","current":{"level":1}}]}'
   unset CONNECT_DRAFT_WRITE_KEY
   ```

   MolluConnect must return its existing JSON maintenance response with HTTP
   `503` and `Retry-After: 30`; no `sync_drafts` or `sync_draft_entries` row may
   be created. A successful response or a namespace mismatch is a hard stop.
9. While maintenance remains set, take the final authoritative D1 snapshot and
   run the same full importer/parity check. This final snapshot is the source
   of truth for cutover.

   ```sh
   umask 077
   mise exec -- node db/postgres/scripts/student-state-d1-collect.mjs \
     --database D1_DATABASE --env production --output FINAL_SNAPSHOT_FILE
   TARGET_PG_URL="$(op read 'op://<vault>/<item>/TARGET_PG_URL')" \
   mise exec -- node db/postgres/scripts/student-state-transfer.mjs \
     --snapshot FINAL_SNAPSHOT_FILE
   unset TARGET_PG_URL
   ```
10. Run read-only smoke checks for student lists, growth, relationship levels,
   inventory, pending drafts, and recruitment history. Do not perform a write
   in this phase.
11. Clear the shared maintenance key only after all gates pass:

    ```sh
    mise exec -- ./node_modules/.bin/wrangler kv key delete "$MAINTENANCE_KEY" --namespace-id "$KV_NAMESPACE_ID"
    unset MAINTENANCE_KEY KV_NAMESPACE_ID
    ```

    Enable controlled PostgreSQL-authoritative writes and observe logs, latency,
    and error rates.

## Rollback boundary

Before maintenance is cleared and before PostgreSQL-authoritative writes begin,
D1 rollback is allowed. After that point D1 is stale by design; recovery is to
re-enable maintenance and apply a PostgreSQL forward-fix. Do not roll back D1
after PostgreSQL-authoritative writes have started. The 13-table `zzz_` rename
is a separately observed pre-cutover gate and is not part of this rollback
boundary.
