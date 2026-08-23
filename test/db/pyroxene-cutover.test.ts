import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const runbook = readFileSync("docs/migrations/pyroxene-cutover.md", "utf8");
const archiveMigration = readFileSync("db/migrations/20260824000400_rename_d1_cutover_tables_with_zzz_prefix.sql", "utf8");

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
    const freeze = runbook.indexOf("mise exec -- pnpm exec wrangler kv key put");
    const snapshot = runbook.indexOf("### Maintenance freeze and final source snapshot");
    const importGate = runbook.indexOf("### PostgreSQL transaction import");
    const roundTwo = runbook.indexOf("### Round 2: PostgreSQL-only final release");
    const checklist = runbook.indexOf("## Exact operator checklist");
    const rollback = runbook.indexOf("### Rollback before unfreeze");
    const forwardFix = runbook.indexOf("### Forward-fix after unfreeze");
    const archive = runbook.indexOf("### `zzz_` archive and D1-zero observation");

    for (const position of [roundOne, freeze, snapshot, importGate, roundTwo, checklist, rollback, forwardFix, archive]) {
      expect(position).toBeGreaterThanOrEqual(0);
    }
    expect(roundOne).toBeLessThan(snapshot);
    expect(snapshot).toBeLessThan(freeze);
    expect(freeze).toBeLessThan(importGate);
    expect(importGate).toBeLessThan(roundTwo);
    expect(roundTwo).toBeLessThan(checklist);
    expect(checklist).toBeLessThan(rollback);
    expect(rollback).toBeLessThan(forwardFix);
    expect(forwardFix).toBeLessThan(archive);
  });

  it("pins the ten-table format, shared key, tooling, credentials, and safety gates", () => {
    expect(runbook).toContain("mollulog.d1.snapshot.v1");
    expect(runbook).toContain("mollu:d1-cutover:maintenance");
    expect(runbook).toContain("db/postgres/scripts/pyroxene-d1-collect.mjs");
    expect(runbook).toContain("db/postgres/scripts/pyroxene-transfer.mjs");
    expect(runbook).toContain("db/postgres/scripts/d1-cutover.integration.test.mjs");
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
    ]) {
      expect(runbook).toContain(variable);
    }
    expect(runbook).toContain("--reveal");
    expect(runbook).toContain("psql -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1'");
    expect(runbook).toContain("source-minus-target 및 target-minus-source typed `EXCEPT`");
    expect(runbook).toContain("ROLLBACK");
    expect(runbook).toContain("pg_get_serial_sequence($1, 'id')");
    expect(runbook).toContain("MAX(id)+1");
    expect(runbook).toContain("frozen read smoke");
    expect(runbook).toContain("re-freeze");
    expect(runbook).toContain("D1-zero");
    expect(runbook).toContain("cache_refresh_jobs");
    expect(runbook).toContain("PostgreSQL에 성공한 write");
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
