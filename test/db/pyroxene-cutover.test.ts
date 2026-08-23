import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const runbook = readFileSync("docs/migrations/pyroxene-cutover.md", "utf8");

const tables = [
  "pyroxene_owned_resources",
  "pyroxene_collected_sources",
  "pyroxene_timeline_items",
  "pyroxene_planner_options",
  "pyroxene_event_data",
  "pyroxene_guest_import_items",
];

describe("Pyroxene cutover runbook contract", () => {
  it("keeps rehearsal, freeze, import, smoke, unfreeze, and cleanup in hard-gate order", () => {
    const rehearsal = runbook.indexOf("## 실제 PostgreSQL rehearsal");
    const credentials = runbook.indexOf("## Production PostgreSQL credential hard gate");
    const revisionA = runbook.indexOf("Revision A: guard-only");
    const freeze = runbook.indexOf("kv key put mollu:pyroxene-cutover:maintenance");
    const finalSnapshot = runbook.indexOf("## Freeze 후 최종 snapshot과 PostgreSQL import");
    const revisionB = runbook.indexOf("Revision B: PostgreSQL");
    const frozenSmoke = runbook.indexOf("Revision B는 freeze가 유지된 상태로 smoke합니다");
    const unfreeze = runbook.indexOf("kv key delete mollu:pyroxene-cutover:maintenance");
    const writeSmoke = runbook.indexOf("successful write smoke를 실행합니다");
    const revisionC = runbook.indexOf("Revision C: guard cleanup");

    for (const position of [
      rehearsal,
      credentials,
      revisionA,
      freeze,
      finalSnapshot,
      revisionB,
      frozenSmoke,
      unfreeze,
      writeSmoke,
      revisionC,
    ]) {
      expect(position).toBeGreaterThanOrEqual(0);
    }
    expect(rehearsal).toBeLessThan(credentials);
    expect(credentials).toBeLessThan(revisionA);
    expect(revisionA).toBeLessThan(freeze);
    expect(freeze).toBeLessThan(finalSnapshot);
    expect(finalSnapshot).toBeLessThan(revisionB);
    expect(revisionB).toBeLessThan(frozenSmoke);
    expect(frozenSmoke).toBeLessThan(unfreeze);
    expect(unfreeze).toBeLessThan(writeSmoke);
    expect(writeSmoke).toBeLessThan(revisionC);
  });

  it("pins the six-table tooling, schema, credential hygiene, and safety gates", () => {
    expect(runbook).toContain("mollulog.pyroxene.snapshot.v1");
    expect(runbook).toContain("db/postgres/migrations/20260823000200_create_pyroxene_planner.sql");
    expect(runbook).toContain("db/postgres/scripts/pyroxene-d1-collect.mjs");
    expect(runbook).toContain("db/postgres/scripts/pyroxene-transfer.mjs");
    for (const table of tables) expect(runbook).toContain(table);
    for (const field of ["server", "port", "database", "username", "password"])
      expect(runbook).toContain(`--field ${field}`);
    for (const variable of [
      "REHEARSAL_PGHOST",
      "REHEARSAL_PGPASSWORD",
      "REHEARSAL_PGSSLMODE",
      "REHEARSAL_D1_DATABASE",
      "REHEARSAL_D1_ENV",
      "PG_PROBE",
    ]) {
      expect(runbook).toContain(variable);
    }
    expect(runbook).toContain("export REHEARSAL_PGSSLMODE='disable'");
    expect(runbook).toContain('export PGSSLMODE="$REHEARSAL_PGSSLMODE"');
    expect(runbook).toContain("export PGSSLMODE='require'");
    expect(runbook).toContain(
      "unset PGPASSWORD PGUSER PGDATABASE PGPORT PGHOST POSTGRES_ITEM D1_DATABASE PGSSLMODE REHEARSAL_PGSSLMODE",
    );
    expect(runbook).toContain("psql -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1'");
    expect(runbook).toContain("round-trip");
    expect(runbook).toContain("ROLLBACK");
    expect(runbook).toContain("pg_get_serial_sequence($1, 'id')");
    expect(runbook).toContain("ALTER SEQUENCE ... RESTART WITH");
    expect(runbook).toContain("prod:build");
    expect(runbook).toContain("성공 write를 시도하지 않고");
    expect(runbook).toContain("guard-capable Revision B(또는 동등한 guard-only artifact)");
    expect(runbook).toContain("key만 설정하거나 KV health만 확인해서는 freeze로 간주하지 않습니다");
    expect(runbook).toContain("Revision B -> A rollback");
    expect(runbook).toContain("PostgreSQL-only writes");
    expect(runbook).toContain("reconcile");
    expect(runbook).not.toMatch(/^\s*wrangler d1 export\b/m);
    expect(runbook).not.toMatch(/(?<!mise exec -- )pnpm exec wrangler/);
  });
});
