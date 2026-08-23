import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const runbook = readFileSync("docs/migrations/d1-cutover.md", "utf8");
const archiveMigration = readFileSync(
  "db/migrations/20260824000400_rename_d1_cutover_tables_with_zzz_prefix.sql",
  "utf8",
);

const tables = [
  "pickup_histories",
  "event_shop_states",
  "pyroxene_owned_resources",
  "pyroxene_collected_sources",
  "pyroxene_timeline_items",
  "pyroxene_planner_options",
  "pyroxene_event_data",
  "pyroxene_guest_import_items",
  "connect_api_keys",
  "connect_request_logs",
];

describe("all-at-once D1 cutover runbook contract", () => {
  it("keeps the two deployment rounds and hard gates in order", () => {
    const roundOne = runbook.indexOf("### Round 1: pre-cutover guard-only release");
    const cacheMigration = runbook.indexOf("20260823000100_create_cache_refresh_jobs.sql");
    const cacheVerification = runbook.indexOf('test "$CACHE_REFRESH_TABLE" = "cache_refresh_jobs"');
    const deployAfterCache = runbook.indexOf(
      "The migration and availability check above must pass immediately before the Round 1 application/cron deployment.",
    );
    const snapshot = runbook.indexOf("### Maintenance freeze and final source snapshot");
    const openBaseline = runbook.indexOf("**verify the open/read baseline**");
    const activate = runbook.indexOf("**activate exactly once**");
    const active503 = runbook.indexOf("**verify actual typed HTTP 503 in both runtimes**");
    const tmuxGuard = runbook.indexOf("TMUX");
    const preflight = runbook.indexOf("--preflight");
    const snapshotCommand = runbook.indexOf("mise exec -- node db/postgres/scripts/d1-cutover-collect.mjs");
    const importGate = runbook.indexOf("### PostgreSQL transaction import");
    const schemaApply = runbook.indexOf("#### 5b. Apply the four schema migrations explicitly");
    const schemaVerify = runbook.indexOf("#### 5c. Verify the exact schema and migration state");
    const transfer = runbook.indexOf("#### 5d. Run the one-transaction import");
    const retrySafety = runbook.indexOf("#### 5e. Retry and partial-DDL recovery");
    const zeroGate = runbook.indexOf("### Final artifact D1-zero hard gate");
    const roundTwo = runbook.indexOf("### Round 2: PostgreSQL-only final release");
    const checklist = runbook.indexOf("## Exact operator checklist");
    const rollback = runbook.indexOf("### Rollback before unfreeze");
    const forwardFix = runbook.indexOf("### Forward-fix after unfreeze");
    const archive = runbook.indexOf("### `zzz_` archive and D1-zero observation");

    for (const position of [
      roundOne,
      cacheMigration,
      cacheVerification,
      deployAfterCache,
      snapshot,
      openBaseline,
      activate,
      active503,
      tmuxGuard,
      preflight,
      snapshotCommand,
      importGate,
      schemaApply,
      schemaVerify,
      transfer,
      retrySafety,
      zeroGate,
      roundTwo,
      checklist,
      rollback,
      forwardFix,
      archive,
    ]) {
      expect(position).toBeGreaterThanOrEqual(0);
    }
    expect(roundOne).toBeLessThan(cacheMigration);
    expect(cacheMigration).toBeLessThan(cacheVerification);
    expect(cacheVerification).toBeLessThan(deployAfterCache);
    expect(deployAfterCache).toBeLessThan(snapshot);
    expect(snapshot).toBeLessThan(openBaseline);
    expect(openBaseline).toBeLessThan(activate);
    expect(activate).toBeLessThan(active503);
    expect(active503).toBeLessThan(tmuxGuard);
    expect(tmuxGuard).toBeLessThan(preflight);
    expect(active503).toBeLessThan(snapshotCommand);
    expect(snapshotCommand).toBeLessThan(importGate);
    expect(importGate).toBeLessThan(schemaApply);
    expect(schemaApply).toBeLessThan(schemaVerify);
    expect(schemaVerify).toBeLessThan(transfer);
    expect(transfer).toBeLessThan(retrySafety);
    expect(retrySafety).toBeLessThan(zeroGate);
    expect(zeroGate).toBeLessThan(roundTwo);
    expect(roundTwo).toBeLessThan(checklist);
    expect(checklist).toBeLessThan(rollback);
    expect(rollback).toBeLessThan(forwardFix);
    expect(forwardFix).toBeLessThan(archive);
  });

  it("pins the ten-table format, shared key, tooling, credentials, and safety gates", () => {
    expect(runbook).toContain("mollulog.d1.snapshot.v1");
    expect(runbook).toContain("mollu:d1-cutover:maintenance");
    expect(runbook).toContain("KV.get이 `null`을 반환하는 missing key");
    expect(runbook).toContain("오직 KV read timeout/error만 fail-closed");
    expect(runbook).not.toContain("KV value가 없거나 KV read가 timeout/error이면 fail-closed");
    expect(runbook).toContain("export D1_DATABASE='mollulog'");
    expect(runbook).toContain('wrangler d1 execute "$D1_DATABASE"');
    expect(runbook).toContain("--file db/migrations/20260824000400_rename_d1_cutover_tables_with_zzz_prefix.sql");
    expect(runbook).toContain("20260823000100_create_cache_refresh_jobs.sql");
    expect(runbook).toContain("db/postgres/scripts/d1-cutover-collect.mjs");
    expect(runbook).toContain("db/postgres/scripts/d1-cutover-zero-scan.mjs");
    expect(runbook).toContain("db/postgres/scripts/d1-cutover-transfer.mjs");
    expect(runbook).toContain("db/postgres/scripts/d1-cutover.integration.mjs");
    for (const table of tables) expect(runbook).toContain(table);
    for (const field of ["server", "port", "database", "username", "password"])
      expect(runbook).toContain(`--field ${field}`);
    for (const variable of [
      "POSTGRES_ITEM",
      "PGHOST",
      "PGPASSWORD",
      "PGSSLMODE=require",
      "D1_CUTOVER_TEST_CONFIRM=local-disposable",
      "D1_DATABASE",
      "MOLLULOG_ROOT",
      "CONNECT_ROOT",
      "ADMIN_ROOT",
    ]) {
      expect(runbook).toContain(variable);
    }
    expect(runbook).toContain("MAX_TOTAL_ROWS=100000");
    expect(runbook).toContain("MAX_SOURCE_BYTES=$((256 * 1024 * 1024))");
    expect(runbook).toContain("tmux, screen, 또는 equivalent persistent session");
    expect(runbook).toContain("completed schema migration을 재실행하지 않고");
    expect(runbook).toContain("partial-DDL failure");
    expect(runbook).toContain("IF NOT EXISTS");
    expect(runbook).toContain("4.107.0");
    expect(runbook).toContain("4.98.0");
    expect(runbook).toContain("--reveal");
    expect(runbook).toContain("psql -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1'");
    expect(runbook).toContain("source-minus-target 및 target-minus-source typed `EXCEPT`");
    expect(runbook).toContain("ROLLBACK");
    expect(runbook).toContain("pg_get_serial_sequence($1, 'id')");
    expect(runbook).toContain("MAX(id)+1");
    expect(runbook).toContain("frozen read smoke");
    expect(runbook).toContain("frozen 상태에서 authenticated draft `GET` 성공을 요구하지 않습니다");
    expect(runbook).toContain("첫 post-unfreeze smoke");
    expect(runbook).toContain("실제 API-key-authenticated draft `GET`이 성공");
    expect(runbook).toContain("service를 open 상태로 유지");
    expect(runbook).toContain("성공한 smoke 뒤의 observation을 위해 자동으로 re-freeze하지 않습니다");
    expect(runbook).toContain("그 operation이 freeze를 요구할 때만");
    expect(runbook).toContain("re-freeze");
    expect(runbook).toContain("D1-zero");
    expect(runbook).toContain("cache_refresh_jobs");
    expect(runbook).toContain("PostgreSQL에 성공한 write");
    expect(runbook).not.toContain("write smoke가 끝나면 다시 shared key를 active로 설정");
    expect(runbook).not.toMatch(/^\s*wrangler d1 export\b/m);
    expect(runbook).not.toMatch(/(?<!mise exec -- )pnpm exec wrangler/);
  });

  it("archives exactly the ten source tables plus cache refresh jobs", () => {
    for (const table of [...tables, "cache_refresh_jobs"]) {
      expect(archiveMigration).toContain(`ALTER TABLE ${table} RENAME TO zzz_${table};`);
    }
    expect(archiveMigration.match(/ALTER TABLE /g)).toHaveLength(11);
  });
});
