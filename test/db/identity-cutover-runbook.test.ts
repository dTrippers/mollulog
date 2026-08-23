import { readFileSync } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const runbook = readFileSync("docs/migrations/identity-cutover.md", "utf8");

describe("identity cutover runbook contract", () => {
  it("keeps the guard, PostgreSQL deploy, smoke, unfreeze, and cleanup sequence executable", () => {
    const revisionA = runbook.indexOf("Revision A: guard-only");
    const freeze = runbook.indexOf("kv key put mollu:identity-cutover:maintenance");
    const revisionB = runbook.indexOf("Revision B: PostgreSQL");
    const unfreeze = runbook.indexOf("kv key delete mollu:identity-cutover:maintenance");
    const revisionC = runbook.indexOf("Revision C: guard cleanup");
    const frozenSmoke = runbook.indexOf("Revision B는 freeze가 유지된 상태로 smoke합니다");
    const writeSmoke = runbook.indexOf("successful write smoke를 실행합니다");

    expect(revisionA).toBeGreaterThanOrEqual(0);
    expect(revisionA).toBeLessThan(freeze);
    expect(freeze).toBeLessThan(revisionB);
    expect(revisionB).toBeLessThan(frozenSmoke);
    expect(frozenSmoke).toBeLessThan(unfreeze);
    expect(revisionB).toBeLessThan(unfreeze);
    expect(unfreeze).toBeLessThan(writeSmoke);
    expect(writeSmoke).toBeLessThan(revisionC);
    expect(unfreeze).toBeLessThan(revisionC);
    expect(runbook).toContain("db/postgres/migrations/20260822000200_create_identity.sql");
    expect(runbook).toContain("db/postgres/scripts/identity-d1-collect.mjs");
    expect(runbook).toContain("db/postgres/scripts/identity-transfer.mjs");
    expect(runbook).not.toMatch(/^\s*wrangler d1 export\b/m);
  });

  it("documents credential hygiene, rehearsal, parity, rollback, and connection gates", () => {
    for (const field of ["server", "port", "database", "username", "password"]) {
      expect(runbook).toContain(`--field ${field}`);
    }
    expect(runbook).toContain("실제 PostgreSQL");
    expect(runbook).toContain("round-trip");
    expect(runbook).toContain("ROLLBACK");
    expect(runbook).toContain("friends connection budget이 2회");
    expect(runbook).toContain("prod:build");
    const rehearsal = runbook.indexOf("## 실제 PostgreSQL rehearsal");
    const revisionA = runbook.indexOf("## Revision A: guard-only");
    const productionHardGate = runbook.indexOf("## Production PostgreSQL credential hard gate");
    const finalSnapshot = runbook.indexOf("## Freeze 후 최종 snapshot과 PostgreSQL import");
    const productionImportCredentials = runbook.indexOf("POSTGRES_ITEM", finalSnapshot);
    expect(runbook).toContain("REHEARSAL_PGHOST");
    expect(runbook).toContain("REHEARSAL_PGPASSWORD");
    expect(runbook).toContain("REHEARSAL_D1_DATABASE");
    expect(runbook).toContain("REHEARSAL_D1_ENV");
    expect(productionHardGate).toBeGreaterThan(rehearsal);
    expect(productionHardGate).toBeLessThan(revisionA);
    expect(productionImportCredentials).toBeGreaterThan(finalSnapshot);
    expect(runbook).toContain("psql -X -v ON_ERROR_STOP=1 -Atc 'SELECT 1'");
    expect(runbook).toContain("PG_PROBE");
    expect(runbook).toContain("field mismatch");
    expect(runbook).not.toMatch(/(?<!mise exec -- )pnpm exec wrangler/);
    expect(runbook).toContain("성공 write를 시도하지 않고");
    expect(runbook).toContain("Revision C runtime은 temporary guard key를 더 이상 읽지 않으므로");
    expect(runbook).toContain("guard-capable Revision B(또는 동등한 guard-only artifact)");
    expect(runbook).toContain("key만 설정하거나 KV health만 확인해서는 freeze로 간주하지 않습니다");
  });
});
