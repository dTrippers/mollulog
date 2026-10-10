import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "@jest/globals";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import {
  pgRecruitedStudentsTable,
  pgStudentGrowthTable,
  pgStudentStateAuditsTable,
  pgStudentStateMigrationControlTable,
  pgStudentStatesTable,
  pgStudentTargetsTable,
} from "~/db/postgres/schema";
import { withStudentStateProjection } from "~/db/postgres/student-state-projection";
import {
  getRecruitedStudents,
  getRecruitedStudentTiers,
  removeRecruitedStudent,
  upsertRecruitedStudent,
} from "~/models/recruited-student";
import { getRelationshipLevel, getRelationshipLevels, upsertRelationshipLevel } from "~/models/relationship-level";
import {
  getStudentGrowth,
  getStudentGrowths,
  getStudentGrowthsWithMetadata,
  getStudentGrowthWithMetadata,
  upsertStudentGrowth,
} from "~/models/student-growth";
import { createAndApplySyncDraft } from "~/models/sync-draft";

const enabled = process.env.STUDENT_STATE_POSTGRES_VALIDATION === "1";
const describePostgres = enabled ? describe : describe.skip;

type CliResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

const MIGRATION_CLI_TIMEOUT_MS = 15_000;
const LOCK_OBSERVATION_TIMEOUT_MS = 8_000;
const ASYNC_CLEANUP_TIMEOUT_MS = 10_000;

function modelEnvForSchema(schema: string): Env {
  const connection = new URL("postgresql://127.0.0.1");
  if (process.env.PGPORT) connection.port = process.env.PGPORT;
  if (process.env.PGUSER) connection.username = process.env.PGUSER;
  if (process.env.PGPASSWORD) connection.password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE ?? process.env.PGUSER;
  if (database) connection.pathname = `/${database}`;
  connection.searchParams.set("options", `-c search_path=${schema}`);
  return { HYPERDRIVE: { connectionString: connection.toString() } } as unknown as Env;
}

function sortBy<T>(rows: readonly T[], key: (row: T) => string): T[] {
  return [...rows].sort((left, right) => key(left).localeCompare(key(right)));
}

async function expectLegacyAndProjectionReadsEqual(client: Client, env: Env, userId: number): Promise<void> {
  const legacyRecruited = await client.query(
    [
      "SELECT uid, student_uid, tier, level, skill_ex, skill_normal, skill_enhanced, skill_sub,",
      "  equip1, equip2, equip3, equip1_level, equip2_level, equip3_level, equip_special, weapon_level,",
      "  ability_hp, ability_atk, ability_heal FROM recruited_students WHERE user_id = $1",
    ].join("\n"),
    [userId],
  );
  const expectedRecruited = legacyRecruited.rows.map((row) => ({
    uid: row.uid,
    studentUid: row.student_uid,
    tier: row.tier,
    level: row.level,
    skillEx: row.skill_ex,
    skillNormal: row.skill_normal,
    skillEnhanced: row.skill_enhanced,
    skillSub: row.skill_sub,
    equip1: row.equip1,
    equip2: row.equip2,
    equip3: row.equip3,
    equip1Level: row.equip1_level,
    equip2Level: row.equip2_level,
    equip3Level: row.equip3_level,
    equipSpecial: row.equip_special,
    weaponLevel: row.weapon_level,
    abilityHp: row.ability_hp,
    abilityAtk: row.ability_atk,
    abilityHeal: row.ability_heal,
  }));
  const recruited = await getRecruitedStudents(env, userId);
  expect(sortBy(recruited, (row) => row.studentUid)).toEqual(sortBy(expectedRecruited, (row) => row.studentUid));
  expect(await getRecruitedStudentTiers(env, userId)).toEqual(
    Object.fromEntries(expectedRecruited.map((row) => [row.studentUid, row.tier])),
  );

  const legacyGrowths = await client.query(
    [
      "SELECT uid, student_uid, target_level, target_skill_ex, target_skill_normal, target_skill_enhanced,",
      "  target_skill_sub, target_equip1, target_equip2, target_equip3, target_equip_special, target_tier,",
      "  target_weapon_level, target_ability_hp, target_ability_atk, target_ability_heal,",
      "  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact",
      "FROM student_growth WHERE user_id = $1",
    ].join("\n"),
    [userId],
  );
  const expectedGrowths = legacyGrowths.rows.map((row) => ({
    uid: row.uid,
    studentUid: row.student_uid,
    targetLevel: row.target_level,
    targetSkillEx: row.target_skill_ex,
    targetSkillNormal: row.target_skill_normal,
    targetSkillEnhanced: row.target_skill_enhanced,
    targetSkillSub: row.target_skill_sub,
    targetEquip1: row.target_equip1,
    targetEquip2: row.target_equip2,
    targetEquip3: row.target_equip3,
    targetEquipSpecial: row.target_equip_special,
    targetTier: row.target_tier,
    targetWeaponLevel: row.target_weapon_level,
    targetAbilityHp: row.target_ability_hp,
    targetAbilityAtk: row.target_ability_atk,
    targetAbilityHeal: row.target_ability_heal,
  }));
  const growths = await getStudentGrowths(env, userId);
  expect(sortBy(growths, (row) => row.studentUid)).toEqual(sortBy(expectedGrowths, (row) => row.studentUid));
  const growthsWithMetadata = await getStudentGrowthsWithMetadata(env, userId);
  const expectedGrowthsWithMetadata = legacyGrowths.rows.map((row) => ({
    ...expectedGrowths.find((growth) => growth.studentUid === row.student_uid),
    createdAt: row.created_at_exact,
  }));
  expect(sortBy(growthsWithMetadata, (row) => row.studentUid)).toEqual(
    sortBy(expectedGrowthsWithMetadata, (row) => row.studentUid),
  );
  for (const growth of growths) {
    expect(await getStudentGrowth(env, userId, growth.studentUid)).toEqual(growth);
  }
  for (const growth of growthsWithMetadata) {
    expect(await getStudentGrowthWithMetadata(env, userId, growth.studentUid)).toEqual(growth);
  }

  const legacyRelationships = await client.query(
    [
      "SELECT uid, student_id, current_level, current_exp, target_level, items",
      "FROM user_relationship_levels WHERE user_id = $1",
    ].join("\n"),
    [userId],
  );
  const expectedRelationships = legacyRelationships.rows.map((row) => ({
    uid: row.uid,
    studentId: row.student_id,
    currentLevel: row.current_level,
    currentExp: row.current_exp,
    targetLevel: row.target_level,
    items: row.items,
  }));
  const relationships = await getRelationshipLevels(env, userId);
  expect(sortBy(relationships, (row) => row.studentId)).toEqual(sortBy(expectedRelationships, (row) => row.studentId));
  for (const relationship of relationships) {
    expect(await getRelationshipLevel(env, userId, relationship.studentId)).toEqual(relationship);
  }
}

function runMigrationCli(
  action: "preflight" | "backfill" | "parity",
  schema: string,
  applicationName: string,
  children: Set<ChildProcess>,
): Promise<CliResult> {
  return new Promise((resolve) => {
    const args = ["scripts/student-state-migration.mjs", action, "--schema", schema];
    if (action !== "preflight") args.push("--confirm-no-external-writers");
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, PGAPPNAME: applicationName },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 1_000);
    }, MIGRATION_CLI_TIMEOUT_MS);
    const clearTimers = () => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
    };
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimers();
      children.delete(child);
      resolve({ code: null, stdout, stderr: stderr + error.message, timedOut });
    });
    child.on("close", (code) => {
      clearTimers();
      children.delete(child);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

function trackTask<T>(tasks: Promise<unknown>[], task: Promise<T>): Promise<T> {
  tasks.push(task);
  void task.catch(() => undefined);
  return task;
}

function withTimeout<T>(task: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    task,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${timeoutMs}ms.`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function closeClient(client: Client, label: string): Promise<void> {
  const ending = client.end();
  try {
    await withTimeout(ending, `${label} close`, ASYNC_CLEANUP_TIMEOUT_MS);
  } catch (error) {
    client.connection.stream.destroy();
    try {
      await withTimeout(ending, `${label} forced close`, ASYNC_CLEANUP_TIMEOUT_MS);
    } catch {
      throw error;
    }
  }
}

function terminateChildren(children: Iterable<ChildProcess>, signal: NodeJS.Signals): void {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

function waitForGateOrFailure(gate: Promise<void>, operation: Promise<unknown>, label: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    gate.then(() => ({ kind: "gate" as const })),
    operation.then(
      () => ({ kind: "finished" as const }),
      (error: unknown) => ({ kind: "failed" as const, error }),
    ),
    new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "timeout" }), LOCK_OBSERVATION_TIMEOUT_MS);
    }),
  ]).then((result) => {
    if (timer) clearTimeout(timer);
    if (result.kind === "gate") return;
    if (result.kind === "failed") throw result.error;
    if (result.kind === "finished") throw new Error(`${label} finished before reaching its test gate.`);
    throw new Error(`${label} did not reach its test gate within ${LOCK_OBSERVATION_TIMEOUT_MS}ms.`);
  });
}

async function waitForLockWait(observer: Client, applicationName: string, operation: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const operationResult = operation.then(
    () => ({ kind: "finished" as const }),
    (error: unknown) => ({ kind: "failed" as const, error }),
  );
  const timeout = new Promise<{ kind: "timeout" }>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout" }), LOCK_OBSERVATION_TIMEOUT_MS);
  });
  try {
    while (true) {
      const observation = await Promise.race([
        observer
          .query("SELECT wait_event_type FROM pg_stat_activity WHERE application_name = $1", [applicationName])
          .then(({ rows }) => ({
            kind: rows[0]?.wait_event_type === "Lock" ? ("locked" as const) : ("waiting" as const),
          })),
        operationResult,
        timeout,
      ]);
      if (observation.kind === "locked") return;
      if (observation.kind === "failed") throw observation.error;
      if (observation.kind === "finished") {
        throw new Error(`PostgreSQL operation for ${applicationName} finished before waiting on a lock.`);
      }
      if (observation.kind === "timeout") {
        throw new Error(`PostgreSQL client ${applicationName} did not wait on a lock.`);
      }
      const next = await Promise.race([
        new Promise<{ kind: "retry" }>((resolve) => setTimeout(() => resolve({ kind: "retry" }), 25)),
        operationResult,
        timeout,
      ]);
      if (next.kind === "failed") throw next.error;
      if (next.kind === "finished") {
        throw new Error(`PostgreSQL operation for ${applicationName} finished before waiting on a lock.`);
      }
      if (next.kind === "timeout") {
        throw new Error(`PostgreSQL client ${applicationName} did not wait on a lock.`);
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describePostgres("student-state projection against isolated PostgreSQL", () => {
  it("validates projection, audit atomicity, backfill parity, and activation races", async () => {
    if (process.env.PGHOST !== "127.0.0.1") {
      throw new Error("Set up local PostgreSQL through the mllg local wrapper before running this suite.");
    }

    const schema = `student_state_p1_${process.pid}_${randomBytes(3).toString("hex")}`;
    const clients: Client[] = [];
    const migrationChildren = new Set<ChildProcess>();
    const migrationRuns: Promise<unknown>[] = [];
    const activeTasks: Promise<unknown>[] = [];
    const releaseGates = new Set<() => void>();
    const runCli = (action: "preflight" | "backfill" | "parity", applicationName: string) => {
      const run = trackTask(
        migrationRuns,
        runMigrationCli(action, schema, applicationName, migrationChildren).then((result) => {
          if (result.timedOut) throw new Error(`Student-state ${action} CLI exceeded its timeout.`);
          return result;
        }),
      );
      return run;
    };
    const registerRelease = (release: () => void) => {
      releaseGates.add(release);
      return () => {
        releaseGates.delete(release);
        release();
      };
    };
    const connect = async (applicationName?: string) => {
      const client = new Client({
        ...(applicationName ? { application_name: applicationName } : {}),
        query_timeout: LOCK_OBSERVATION_TIMEOUT_MS,
      });
      clients.push(client);
      await client.connect();
      await client.query(`SET search_path TO "${schema}"`);
      return { client, db: drizzle(client) };
    };
    const admin = new Client({ query_timeout: LOCK_OBSERVATION_TIMEOUT_MS });
    clients.push(admin);
    await admin.connect();
    let schemaCreated = false;
    let activationTransaction: Client | null = null;
    let testFailure: unknown;
    let cleanupFailure: AggregateError | undefined;

    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      schemaCreated = true;
      await admin.query(`SET search_path TO "${schema}"`);
      for (const migration of [
        "db/postgres/migrations/20260807000100_create_student_state.sql",
        "db/postgres/migrations/20260901000200_add_recruited_student_equipment_levels.sql",
        "db/postgres/migrations/20261010000100_create_student_state_projection.sql",
      ]) {
        await admin.query(await readFile(path.join(process.cwd(), migration), "utf8"));
      }

      await admin.query(
        [
          "INSERT INTO recruited_students (uid, user_id, student_uid, tier, level, equip1_level, created_at) VALUES",
          "  ('recruited-current', 7, 'student-current', 3, 80, 2, '2026-09-01T00:00:00.000123Z'),",
          "  ('recruited-microsecond', 7, 'student-microsecond', 2, 40, NULL, '2026-09-01T00:00:00.000987Z'),",
          "  ('recruited-tombstone', 7, 'student-tombstone', 1, 10, NULL, '2026-09-01T00:00:00.000555Z');",
          "INSERT INTO student_growth (uid, user_id, student_uid, target_level, target_tier, created_at) VALUES",
          "  ('growth-current', 7, 'student-current', 25, 2, '2026-09-01T00:00:00.000123Z'),",
          "  ('growth-empty', 7, 'student-empty-plan', NULL, NULL, '2026-09-01T00:00:00.000123Z'),",
          "  ('growth-target-only', 7, 'student-target-only', 99, NULL, '2026-09-01T00:00:00.000987Z');",
          "INSERT INTO user_relationship_levels (uid, user_id, student_id, current_level, current_exp, target_level, items, created_at) VALUES",
          "  ('relationship-current', 7, 'student-current', 20, 246, 10, '{\"gift-x\": 3}'::jsonb, '2026-09-01T00:00:00.000456Z'),",
          "  ('relationship-only', 7, 'student-relationship-only', 4, 12, 7, '{}'::jsonb, '2026-09-01T00:00:00.000654Z');",
        ].join("\n"),
      );

      await admin.query(
        "INSERT INTO student_growth (uid, user_id, student_uid, level, skill_ex, target_level) VALUES ('growth-shadow-current', 7, 'student-shadow-current', 70, 3, 80)",
      );
      const unsupportedPreflight = await runCli("preflight", `state-preflight-shadow-current-${process.pid}`);
      expect(unsupportedPreflight.code).toBe(2);
      expect(unsupportedPreflight.stdout).toMatch(/unsupported_student_growth_current_rows=1/);
      const unsupportedBackfill = await runCli("backfill", `state-backfill-shadow-current-${process.pid}`);
      expect(unsupportedBackfill.code).toBe(1);
      expect(unsupportedBackfill.stderr).toContain(
        "Legacy student_growth current values require an operator review for student-shadow-current.",
      );
      expect((await admin.query("SELECT uid FROM student_states")).rows).toHaveLength(0);
      expect((await admin.query("SELECT uid FROM student_targets")).rows).toHaveLength(0);
      expect((await admin.query("SELECT id FROM student_state_audits")).rows).toHaveLength(0);
      await admin.query("DELETE FROM student_growth WHERE student_uid = 'student-shadow-current'");

      const baseline = await runCli("backfill", `state-backfill-${process.pid}`);
      expect(baseline.code).toBe(0);
      expect(baseline.stdout).toMatch(/audit_rows=0/);

      const { rows: states } = await admin.query(
        [
          "SELECT student_uid, recruited_student_uid, relationship_level_uid, level,",
          "  CASE WHEN recruited_at IS NULL THEN NULL ELSE to_char(recruited_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') END AS recruited_at_exact",
          "FROM student_states ORDER BY student_uid",
        ].join("\n"),
      );
      expect(states).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            student_uid: "student-current",
            recruited_student_uid: "recruited-current",
            relationship_level_uid: "relationship-current",
            level: 80,
            recruited_at_exact: "2026-09-01T00:00:00.000123Z",
          }),
          expect.objectContaining({
            student_uid: "student-microsecond",
            recruited_at_exact: "2026-09-01T00:00:00.000987Z",
          }),
          expect.objectContaining({
            student_uid: "student-relationship-only",
            recruited_student_uid: null,
            relationship_level_uid: "relationship-only",
          }),
        ]),
      );
      expect(states.some((row) => row.student_uid === "student-target-only")).toBe(false);

      const { rows: targets } = await admin.query(
        [
          "SELECT student_uid, student_growth_uid, relationship_level_uid, target_level,",
          "  relationship_target_level, gift_plan,",
          "  CASE WHEN planner_added_at IS NULL THEN NULL ELSE to_char(planner_added_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') END AS planner_added_at_exact",
          "FROM student_targets ORDER BY student_uid",
        ].join("\n"),
      );
      expect(targets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            student_uid: "student-current",
            target_level: 25,
            relationship_target_level: 10,
            gift_plan: { "gift-x": 3 },
          }),
          expect.objectContaining({
            student_uid: "student-empty-plan",
            student_growth_uid: "growth-empty",
            target_level: null,
            planner_added_at_exact: "2026-09-01T00:00:00.000123Z",
          }),
          expect.objectContaining({
            student_uid: "student-relationship-only",
            student_growth_uid: null,
            planner_added_at_exact: null,
            relationship_target_level: 7,
          }),
        ]),
      );
      const registrationOrder = await admin.query(
        [
          "SELECT student_uid FROM student_targets",
          "WHERE student_uid IN ('student-empty-plan', 'student-target-only')",
          "ORDER BY planner_added_at, student_uid",
        ].join("\n"),
      );
      expect(registrationOrder.rows.map((row) => row.student_uid)).toEqual([
        "student-empty-plan",
        "student-target-only",
      ]);
      expect((await admin.query("SELECT id FROM student_state_audits")).rows).toHaveLength(0);
      expect((await runCli("parity", `state-parity-${process.pid}`)).stdout).toMatch(/mismatches=0/);

      const modelEnv = modelEnvForSchema(schema);
      await expectLegacyAndProjectionReadsEqual(admin, modelEnv, 7);

      const app = await connect("state-projection-validation");
      await app.db.transaction((tx) =>
        withStudentStateProjection(tx, 7, ["student-current"], "student_growth", async (lockedTx) =>
          lockedTx
            .update(pgStudentGrowthTable)
            .set({ targetLevel: 25 })
            .where(and(eq(pgStudentGrowthTable.userId, 7), eq(pgStudentGrowthTable.studentUid, "student-current"))),
        ),
      );
      expect((await admin.query("SELECT id FROM student_state_audits")).rows).toHaveLength(0);

      await app.db.transaction((tx) =>
        withStudentStateProjection(tx, 7, ["student-current"], "student_growth", async (lockedTx) =>
          lockedTx
            .update(pgStudentGrowthTable)
            .set({ targetLevel: 26 })
            .where(and(eq(pgStudentGrowthTable.userId, 7), eq(pgStudentGrowthTable.studentUid, "student-current"))),
        ),
      );
      const changedAudit = await admin.query(
        "SELECT actor_user_id, source, before_state, after_state FROM student_state_audits WHERE student_uid = 'student-current'",
      );
      expect(changedAudit.rows).toHaveLength(1);
      expect(changedAudit.rows[0]).toMatchObject({
        actor_user_id: 7,
        source: "student_growth",
        before_state: { growth: expect.objectContaining({ targetLevel: 25 }) },
        after_state: { growth: expect.objectContaining({ targetLevel: 26 }) },
      });

      await admin.query(
        [
          "CREATE FUNCTION reject_student_state_audit() RETURNS trigger LANGUAGE plpgsql AS $$",
          "BEGIN RAISE EXCEPTION 'validation audit failure'; END;",
          "$$;",
          "CREATE TRIGGER reject_student_state_audit BEFORE INSERT ON student_state_audits",
          "  FOR EACH ROW EXECUTE FUNCTION reject_student_state_audit();",
        ].join("\n"),
      );
      await expect(
        app.db.transaction((tx) =>
          withStudentStateProjection(tx, 7, ["student-current"], "student_growth", async (lockedTx) =>
            lockedTx
              .update(pgStudentGrowthTable)
              .set({ targetLevel: 27 })
              .where(and(eq(pgStudentGrowthTable.userId, 7), eq(pgStudentGrowthTable.studentUid, "student-current"))),
          ),
        ),
      ).rejects.toThrow(/insert into "student_state_audits"/);
      await admin.query("DROP TRIGGER reject_student_state_audit ON student_state_audits");
      await admin.query("DROP FUNCTION reject_student_state_audit()");
      expect(
        (await admin.query("SELECT target_level FROM student_growth WHERE student_uid = 'student-current'")).rows[0]
          .target_level,
      ).toBe(26);
      expect(
        (await admin.query("SELECT target_level FROM student_targets WHERE student_uid = 'student-current'")).rows[0]
          .target_level,
      ).toBe(26);
      expect(
        (await admin.query("SELECT id FROM student_state_audits WHERE student_uid = 'student-current'")).rows,
      ).toHaveLength(1);

      const writerUserId = 8;
      await upsertRecruitedStudent(modelEnv, writerUserId, "writer-recruited-only", 3);
      await upsertStudentGrowth(modelEnv, writerUserId, "writer-empty-planner", {
        targetLevel: null,
        targetSkillEx: null,
        targetSkillNormal: null,
        targetSkillEnhanced: null,
        targetSkillSub: null,
        targetEquip1: null,
        targetEquip2: null,
        targetEquip3: null,
        targetEquipSpecial: null,
        targetTier: null,
        targetWeaponLevel: null,
        targetAbilityHp: null,
        targetAbilityAtk: null,
        targetAbilityHeal: null,
      });
      await upsertRelationshipLevel(modelEnv, writerUserId, "writer-relationship", 15, 246, 20, { "gift-x": 3 });
      await upsertStudentGrowth(modelEnv, writerUserId, "writer-target-only", {
        targetLevel: 85,
        targetSkillEx: null,
        targetSkillNormal: null,
        targetSkillEnhanced: null,
        targetSkillSub: null,
        targetEquip1: null,
        targetEquip2: null,
        targetEquip3: null,
        targetEquipSpecial: null,
        targetTier: null,
        targetWeaponLevel: null,
        targetAbilityHp: null,
        targetAbilityAtk: null,
        targetAbilityHeal: null,
      });
      await upsertRelationshipLevel(modelEnv, writerUserId, "writer-lower-target", 8, 321, 12, { "gift-y": 2 });
      await createAndApplySyncDraft(modelEnv, writerUserId, {
        source: "first_party_ocr",
        sourceRef: "student-state-writer-lower-target",
        type: "student_state",
        toolName: "Student state PostgreSQL fixture",
        entries: [
          {
            entryKey: "writer-lower-target",
            value: 2,
            valueJson: JSON.stringify({ current: { tier: 2, bond: 20 }, target: null }),
          },
        ],
      });
      await expectLegacyAndProjectionReadsEqual(admin, modelEnv, writerUserId);
      await expect(getRelationshipLevel(modelEnv, writerUserId, "writer-relationship")).resolves.toMatchObject({
        currentLevel: 15,
        currentExp: 246,
        targetLevel: 20,
        items: { "gift-x": 3 },
      });
      await expect(getRelationshipLevel(modelEnv, writerUserId, "writer-lower-target")).resolves.toMatchObject({
        currentLevel: 20,
        currentExp: null,
        targetLevel: 12,
        items: { "gift-y": 2 },
      });
      const writerAuditCount = (
        await admin.query("SELECT id FROM student_state_audits WHERE user_id = $1", [writerUserId])
      ).rows.length;
      expect(writerAuditCount).toBeGreaterThan(0);

      await removeRecruitedStudent(modelEnv, 7, "student-tombstone");
      const tombstone = await admin.query(
        "SELECT recruited_student_uid, deleted_at FROM student_states WHERE user_id = $1 AND student_uid = $2",
        [7, "student-tombstone"],
      );
      expect(tombstone.rows[0]).toMatchObject({ recruited_student_uid: null, deleted_at: expect.any(Date) });
      await expect(getRecruitedStudents(modelEnv, 7, ["student-tombstone"])).resolves.toEqual([]);

      await admin.query(
        "INSERT INTO recruited_students (uid, user_id, student_uid, tier) VALUES ('recruited-race', 7, 'student-backfill-race', 1)",
      );
      let acquiredWriterLock!: () => void;
      let releaseWriter!: () => void;
      const writerHasLock = new Promise<void>((resolve) => {
        acquiredWriterLock = resolve;
      });
      const waitForRelease = new Promise<void>((resolve) => {
        releaseWriter = resolve;
      });
      const raceWriter = trackTask(
        activeTasks,
        app.db.transaction((tx) =>
          withStudentStateProjection(tx, 7, ["student-backfill-race"], "recruited_student", async (lockedTx) => {
            acquiredWriterLock();
            await waitForRelease;
            return lockedTx
              .update(pgRecruitedStudentsTable)
              .set({ tier: 2 })
              .where(
                and(
                  eq(pgRecruitedStudentsTable.userId, 7),
                  eq(pgRecruitedStudentsTable.studentUid, "student-backfill-race"),
                ),
              );
          }),
        ),
      );
      const unlockRaceWriter = registerRelease(releaseWriter);
      await waitForGateOrFailure(writerHasLock, raceWriter, "Backfill race writer");
      const backfillApplication = `state-backfill-race-${process.pid}`;
      const backfillResult = runCli("backfill", backfillApplication);
      try {
        await waitForLockWait(admin, backfillApplication, backfillResult);
      } finally {
        unlockRaceWriter();
      }
      await raceWriter;
      const completedBackfill = await backfillResult;
      expect(completedBackfill.code).toBe(0);
      expect(
        (await admin.query("SELECT tier FROM student_states WHERE student_uid = 'student-backfill-race'")).rows[0].tier,
      ).toBe(2);
      expect((await runCli("parity", `state-parity-after-race-${process.pid}`)).stdout).toMatch(/mismatches=0/);

      await admin.query(
        [
          "INSERT INTO recruited_students (uid, user_id, student_uid, tier, level) VALUES",
          "  ('recruited-rolling-side', 7, 'student-rolling-side', 2, 70),",
          "  ('recruited-rolling-gone', 7, 'student-rolling-gone', 3, 80);",
          "INSERT INTO student_growth (uid, user_id, student_uid, target_level, target_tier) VALUES",
          "  ('growth-rolling-side', 7, 'student-rolling-side', 90, 3),",
          "  ('growth-rolling-gone', 7, 'student-rolling-gone', 100, 4);",
          "INSERT INTO user_relationship_levels (uid, user_id, student_id, current_level, target_level, items) VALUES",
          "  ('relationship-rolling-side', 7, 'student-rolling-side', 8, 9, '{\"gift-still\": 2}'::jsonb);",
        ].join("\n"),
      );
      const rollingAuditCountBeforeProjection = (await admin.query("SELECT id FROM student_state_audits")).rows.length;
      for (const [studentUid, tier] of [
        ["student-rolling-side", 2],
        ["student-rolling-gone", 3],
      ] as const) {
        await app.db.transaction((tx) =>
          withStudentStateProjection(tx, 7, [studentUid], "recruited_student", async (lockedTx) =>
            lockedTx
              .update(pgRecruitedStudentsTable)
              .set({ tier })
              .where(and(eq(pgRecruitedStudentsTable.userId, 7), eq(pgRecruitedStudentsTable.studentUid, studentUid))),
          ),
        );
      }
      const projectedBeforeLegacyDelete = await admin.query(
        [
          "SELECT 'state' AS projection, student_uid, uid,",
          "  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact",
          "FROM student_states WHERE student_uid IN ('student-rolling-side', 'student-rolling-gone')",
          "UNION ALL",
          "SELECT 'target' AS projection, student_uid, uid,",
          "  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact",
          "FROM student_targets WHERE student_uid IN ('student-rolling-side', 'student-rolling-gone')",
        ].join("\n"),
      );
      const beforeDeleteByKey = new Map(
        projectedBeforeLegacyDelete.rows.map((row) => [`${row.projection}:${row.student_uid}`, row]),
      );
      expect(beforeDeleteByKey.size).toBe(4);
      expect((await admin.query("SELECT id FROM student_state_audits")).rows).toHaveLength(
        rollingAuditCountBeforeProjection,
      );

      await admin.query("BEGIN");
      await admin.query(
        "DELETE FROM recruited_students WHERE student_uid IN ('student-rolling-side', 'student-rolling-gone')",
      );
      await admin.query(
        "DELETE FROM student_growth WHERE student_uid IN ('student-rolling-side', 'student-rolling-gone')",
      );
      await admin.query("COMMIT");

      const reconciliation = await runCli("backfill", `state-backfill-rolling-delete-${process.pid}`);
      expect(reconciliation.code).toBe(0);
      expect(reconciliation.stdout).toMatch(/audit_rows=0/);
      expect((await runCli("parity", `state-parity-rolling-delete-${process.pid}`)).stdout).toMatch(/mismatches=0/);
      const rollingAuditCountAfterBackfill = (await admin.query("SELECT id FROM student_state_audits")).rows.length;
      expect(rollingAuditCountAfterBackfill).toBe(rollingAuditCountBeforeProjection);
      const reconciledStates = await admin.query(
        [
          "SELECT student_uid, uid, recruited_student_uid, relationship_level_uid,",
          "  tier, level, relationship_current_level, relationship_current_exp, deleted_at,",
          "  to_char(recruited_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS source_at_exact,",
          "  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact",
          "FROM student_states WHERE student_uid IN ('student-rolling-side', 'student-rolling-gone')",
        ].join("\n"),
      );
      const reconciledTargets = await admin.query(
        [
          "SELECT student_uid, uid, student_growth_uid, relationship_level_uid,",
          "  target_level, relationship_target_level, gift_plan, deleted_at,",
          "  to_char(planner_added_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS source_at_exact,",
          "  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at_exact",
          "FROM student_targets WHERE student_uid IN ('student-rolling-side', 'student-rolling-gone')",
        ].join("\n"),
      );
      const reconciledRows = [
        ...reconciledStates.rows.map((row) => ({ ...row, projection: "state" })),
        ...reconciledTargets.rows.map((row) => ({ ...row, projection: "target" })),
      ];
      for (const row of reconciledRows) {
        const before = beforeDeleteByKey.get(`${row.projection}:${row.student_uid}`);
        expect(row.uid).toBe(before.uid);
        expect(row.created_at_exact).toBe(before.created_at_exact);
      }
      expect(reconciledRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            projection: "state",
            student_uid: "student-rolling-side",
            recruited_student_uid: null,
            relationship_level_uid: "relationship-rolling-side",
            tier: null,
            level: null,
            relationship_current_level: 8,
            deleted_at: null,
            source_at_exact: null,
          }),
          expect.objectContaining({
            projection: "target",
            student_uid: "student-rolling-side",
            student_growth_uid: null,
            relationship_level_uid: "relationship-rolling-side",
            target_level: null,
            relationship_target_level: 9,
            gift_plan: { "gift-still": 2 },
            deleted_at: null,
            source_at_exact: null,
          }),
          expect.objectContaining({
            projection: "state",
            student_uid: "student-rolling-gone",
            recruited_student_uid: null,
            relationship_level_uid: null,
            tier: null,
            level: null,
            relationship_current_level: null,
            deleted_at: expect.any(Date),
            source_at_exact: null,
          }),
          expect.objectContaining({
            projection: "target",
            student_uid: "student-rolling-gone",
            student_growth_uid: null,
            relationship_level_uid: null,
            target_level: null,
            relationship_target_level: null,
            gift_plan: {},
            deleted_at: expect.any(Date),
            source_at_exact: null,
          }),
        ]),
      );
      expect((await admin.query("SELECT id FROM student_state_audits")).rows).toHaveLength(
        rollingAuditCountAfterBackfill,
      );

      const concurrentRows = ["student-concurrent-a", "student-concurrent-b"];
      await admin.query(
        "INSERT INTO recruited_students (uid, user_id, student_uid, tier) VALUES ('recruited-concurrent-a', 7, $1, 1), ('recruited-concurrent-b', 7, $2, 1)",
        concurrentRows,
      );
      const writers = await Promise.all([connect("state-concurrent-a"), connect("state-concurrent-b")]);
      await Promise.all(
        writers.map(({ db }, index) =>
          db.transaction((tx) =>
            withStudentStateProjection(tx, 7, [concurrentRows[index]], "recruited_student", async (lockedTx) =>
              lockedTx
                .update(pgRecruitedStudentsTable)
                .set({ tier: 2 })
                .where(
                  and(
                    eq(pgRecruitedStudentsTable.userId, 7),
                    eq(pgRecruitedStudentsTable.studentUid, concurrentRows[index]),
                  ),
                ),
            ),
          ),
        ),
      );
      const concurrentState = await admin.query(
        "SELECT student_uid, tier FROM student_states WHERE student_uid = ANY($1::text[]) ORDER BY student_uid",
        [concurrentRows],
      );
      expect(concurrentState.rows).toEqual([
        { student_uid: "student-concurrent-a", tier: 2 },
        { student_uid: "student-concurrent-b", tier: 2 },
      ]);

      let activationWriterLocked!: () => void;
      let releaseActivationWriter!: () => void;
      const activationLock = new Promise<void>((resolve) => {
        activationWriterLocked = resolve;
      });
      const allowActivationWriter = new Promise<void>((resolve) => {
        releaseActivationWriter = resolve;
      });
      const activationWriterClient = await connect("state-activation-writer");
      const activationWriter = trackTask(
        activeTasks,
        activationWriterClient.db.transaction((tx) =>
          withStudentStateProjection(tx, 7, ["student-backfill-race"], "recruited_student", async (lockedTx) => {
            activationWriterLocked();
            await allowActivationWriter;
            return lockedTx
              .update(pgRecruitedStudentsTable)
              .set({ tier: 3 })
              .where(
                and(
                  eq(pgRecruitedStudentsTable.userId, 7),
                  eq(pgRecruitedStudentsTable.studentUid, "student-backfill-race"),
                ),
              );
          }),
        ),
      );
      const unlockActivationWriter = registerRelease(releaseActivationWriter);
      await waitForGateOrFailure(activationLock, activationWriter, "Activation race writer");
      const activation = await connect(`state-activation-${process.pid}`);
      activationTransaction = activation.client;
      await activation.client.query("BEGIN");
      const activationUpdate = trackTask(
        activeTasks,
        activation.client.query(
          "UPDATE student_state_migration_control SET nullable_semantics_enabled = true WHERE key = 'default'",
        ),
      );
      try {
        await waitForLockWait(admin, `state-activation-${process.pid}`, activationUpdate);
      } finally {
        unlockActivationWriter();
      }
      await activationWriter;
      await activationUpdate;
      await activation.client.query("COMMIT");
      activationTransaction = null;
      expect(
        (await admin.query("SELECT tier FROM student_states WHERE student_uid = 'student-backfill-race'")).rows[0].tier,
      ).toBe(3);

      await expect(
        app.db.transaction((tx) =>
          withStudentStateProjection(tx, 7, ["student-backfill-race"], "recruited_student", async (lockedTx) =>
            lockedTx
              .update(pgRecruitedStudentsTable)
              .set({ tier: 4 })
              .where(
                and(
                  eq(pgRecruitedStudentsTable.userId, 7),
                  eq(pgRecruitedStudentsTable.studentUid, "student-backfill-race"),
                ),
              ),
          ),
        ),
      ).rejects.toMatchObject({ code: "STUDENT_STATE_STALE" });
      expect(
        (await admin.query("SELECT tier FROM recruited_students WHERE student_uid = 'student-backfill-race'")).rows[0]
          .tier,
      ).toBe(3);
      expect(
        (await admin.query("SELECT tier FROM student_states WHERE student_uid = 'student-backfill-race'")).rows[0].tier,
      ).toBe(3);
      expect((await runCli("backfill", `state-backfill-disabled-${process.pid}`)).code).not.toBe(0);
      expect((await runCli("parity", `state-parity-disabled-${process.pid}`)).code).not.toBe(0);

      expect(
        await app.db
          .select({ id: pgStudentStateAuditsTable.id })
          .from(pgStudentStateAuditsTable)
          .where(eq(pgStudentStateAuditsTable.userId, 7)),
      ).toHaveLength(6);
      const finalStates = await app.db
        .select({ studentUid: pgStudentStatesTable.studentUid, deletedAt: pgStudentStatesTable.deletedAt })
        .from(pgStudentStatesTable)
        .where(eq(pgStudentStatesTable.userId, 7));
      expect(finalStates).toHaveLength(9);
      expect(
        finalStates
          .filter((row) => row.deletedAt == null)
          .map((row) => row.studentUid)
          .sort(),
      ).toEqual([
        "student-backfill-race",
        "student-concurrent-a",
        "student-concurrent-b",
        "student-current",
        "student-microsecond",
        "student-relationship-only",
        "student-rolling-side",
      ]);
      expect(
        finalStates
          .filter((row) => row.deletedAt != null)
          .map((row) => row.studentUid)
          .sort(),
      ).toEqual(["student-rolling-gone", "student-tombstone"]);
      const finalTargets = await app.db
        .select({ studentUid: pgStudentTargetsTable.studentUid, deletedAt: pgStudentTargetsTable.deletedAt })
        .from(pgStudentTargetsTable)
        .where(eq(pgStudentTargetsTable.userId, 7));
      expect(finalTargets).toHaveLength(6);
      expect(
        finalTargets
          .filter((row) => row.deletedAt == null)
          .map((row) => row.studentUid)
          .sort(),
      ).toEqual([
        "student-current",
        "student-empty-plan",
        "student-relationship-only",
        "student-rolling-side",
        "student-target-only",
      ]);
      expect(finalTargets.filter((row) => row.deletedAt != null).map((row) => row.studentUid)).toEqual([
        "student-rolling-gone",
      ]);
      expect(
        await app.db
          .select({ enabled: pgStudentStateMigrationControlTable.nullableSemanticsEnabled })
          .from(pgStudentStateMigrationControlTable)
          .where(eq(pgStudentStateMigrationControlTable.key, "default")),
      ).toEqual([{ enabled: true }]);
      await expectLegacyAndProjectionReadsEqual(admin, modelEnv, 7);
      await expectLegacyAndProjectionReadsEqual(admin, modelEnv, writerUserId);
      expect(
        (await admin.query("SELECT id FROM student_state_audits WHERE user_id = $1", [writerUserId])).rows,
      ).toHaveLength(writerAuditCount);
    } catch (error) {
      testFailure = error;
    } finally {
      const cleanupErrors: Error[] = [];
      const gates = [...releaseGates];
      releaseGates.clear();
      for (const release of gates) release();

      const children = [...migrationChildren];
      terminateChildren(children, "SIGTERM");
      const settleOperations = () => Promise.allSettled([...activeTasks, ...migrationRuns]);
      try {
        await withTimeout(settleOperations(), "PostgreSQL fixture operations", ASYNC_CLEANUP_TIMEOUT_MS);
      } catch {
        terminateChildren(children, "SIGKILL");
        for (const client of clients) {
          if (client !== admin) client.connection.stream.destroy();
        }
        try {
          await withTimeout(
            settleOperations(),
            "PostgreSQL fixture forced operation cleanup",
            ASYNC_CLEANUP_TIMEOUT_MS,
          );
        } catch (error) {
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }

      if (activationTransaction && !activationTransaction.connection.stream.destroyed) {
        try {
          await withTimeout(
            activationTransaction.query("ROLLBACK"),
            "Activation transaction rollback",
            ASYNC_CLEANUP_TIMEOUT_MS,
          );
        } catch (error) {
          activationTransaction.connection.stream.destroy();
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      activationTransaction = null;

      for (const client of clients) {
        if (client === admin) continue;
        try {
          await closeClient(client, "Fixture client");
        } catch (error) {
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }

      try {
        await withTimeout(
          settleOperations(),
          "PostgreSQL fixture operation settlement after client close",
          ASYNC_CLEANUP_TIMEOUT_MS,
        );
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
      }

      if (schemaCreated) {
        try {
          await withTimeout(
            admin.query(`DROP SCHEMA "${schema}" CASCADE`),
            "Owned fixture schema drop",
            ASYNC_CLEANUP_TIMEOUT_MS,
          );
          const { rows } = await withTimeout(
            admin.query("SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS still_exists", [schema]),
            "Owned fixture schema removal check",
            ASYNC_CLEANUP_TIMEOUT_MS,
          );
          if (rows[0]?.still_exists !== false) {
            cleanupErrors.push(new Error(`Owned fixture schema ${schema} still exists after cleanup.`));
          }
        } catch (error) {
          cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }

      try {
        await closeClient(admin, "Fixture admin client");
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
      }
      if (cleanupErrors.length > 0) {
        cleanupFailure = new AggregateError(cleanupErrors, "PostgreSQL fixture cleanup failed.");
      }
    }
    if (cleanupFailure && testFailure) {
      throw new AggregateError([testFailure, cleanupFailure], "PostgreSQL test and fixture cleanup failed.");
    }
    if (cleanupFailure) throw cleanupFailure;
    if (testFailure) throw testFailure;
  }, 60_000);
});
