# Community PostgreSQL cutover

This runbook moves `community_posts`, `community_comments`,
`community_post_likes`, `community_post_tags`, and `recruitment_results` to
PostgreSQL behind Hyperdrive. The `senseis` and `recruited_students` tables
remain in D1. PostgreSQL reads use a small D1 author bridge for
username/profile visibility and an additive D1 projection for recruited
students.

## One-time preparation

Apply `db/postgres/migrations/20260801000100_create_community_and_recruitment_results.sql`
to the Hyperdrive origin before the cutover window. This is schema preparation;
the application remains D1-authoritative until the ordered switch below.

## Ordered cutover

Follow these steps in order. Keep the D1 snapshot, generated SQL, parity output,
and smoke results as the cutover evidence.

1. Deploy the application and cron Worker with both configs still set to
   `COMMUNITY_SOURCE_MODE=d1`. Confirm the deployed version and config before
   continuing.

2. Enable the existing community write freeze. Freeze is presence-based: any
   value at the key means writes are frozen.

   ```sh
   mise exec -- pnpm exec wrangler kv key put ops::community-write-freeze::v1 1 --binding KV_CACHE --remote --env production
   ```

3. With the freeze active, take the **FINAL D1 snapshot** of all five tables.
   Do not accept application writes between this snapshot and the Hyperdrive
   switch.

4. Generate, import, and verify the snapshot while the freeze remains active:

   ```sh
   mise exec -- node db/postgres/scripts/generate-community-postgres-import.mjs snapshot.json community-import.sql
   ```

   The generator prints deterministic table counts after creating the output
   file (exclusive-create; it will not overwrite an existing artifact). Run the
   SQL against the origin and require every typed row-set parity check and
   reference/linkage assertion to pass. Keep the generated file and the parity
   result with the snapshot evidence.

5. Change **both** `wrangler.jsonc` and `wrangler.cron.jsonc` to
   `COMMUNITY_SOURCE_MODE=hyperdrive`, then deploy the app and cron Workers
   together. Never run a mixed app/cron pair.

6. While the freeze is still active, run read-only smoke checks and post-switch
   parity checks for feed, comments/subcomments, likes, student gradings/tags,
   parties, and recruitment stats/results. Verify walkthrough/YouTube sync jobs
   are blocked or skipped by the freeze; do not exercise their writes yet. This
   is the rollback gate: if any check fails, keep the freeze active, switch both
   configs back to `d1`, deploy them together, and re-check the D1 path.

7. Only after the read-only smoke and parity gate passes, disable the freeze:

   ```sh
   mise exec -- pnpm exec wrangler kv key delete ops::community-write-freeze::v1 --binding KV_CACHE --remote --env production
   ```

   After unfreezing, run the application write smoke checks, including
   walkthrough/YouTube sync writes. These writes are PostgreSQL-authoritative
   and the D1 rollback window is closed.

## Rollback boundary and ongoing verification

- A rollback to D1 is allowed only while the freeze is active and before any
  PostgreSQL-authoritative application write occurs. The rollback consists of
  changing **both** Worker configs to `COMMUNITY_SOURCE_MODE=d1`, deploying them
  together, and only then unfreezing.
- Once the freeze is removed or a PostgreSQL write has begun, never send traffic
  back to the stale D1 snapshot. If a post-switch check or write fails, keep
  traffic on PostgreSQL, re-enable the freeze for remediation if needed, and
  forward-fix the PostgreSQL path.
- A PostgreSQL transaction commits a recruitment result and its linked community
  post together. The recruited-student D1 projection runs after that commit; a
  projection failure is returned as an error and is safe to retry.
- Confirm every PostgreSQL author ID resolves through D1 and that unresolved or
  private profiles are filtered according to the community visibility contract.
