import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "@jest/globals";
import { Client } from "pg";
import { getRecruitedStudents, removeRecruitedStudent, upsertRecruitedStudent } from "~/models/recruited-student";
import { getRelationshipLevel, updateRelationshipLevel, upsertRelationshipLevel } from "~/models/relationship-level";
import { saveStudentBasicInfo } from "~/models/student-basic-info";
import { getStudentGrowth, removeStudentGrowth, saveStudentGrowthAndCurrentState } from "~/models/student-growth";
import { applySyncDraft, createSyncDraft } from "~/models/sync-draft";

const enabled = process.env.STUDENT_STATE_POSTGRES_VALIDATION === "1";
const localPostgres = enabled ? describe : describe.skip;

localPostgres("canonical student state after phase 1-5 archive", () => {
  it("preserves archived data and keeps canonical saves, imports, auditing and rollback independent of old tables", async () => {
    const host = process.env.PGHOST;
    const allowed = [
      "127.0.0.1",
      "localhost",
      "::1",
      ...(process.env.LOCAL_DB_ALLOWED_HOSTS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ];
    expect(host).toBeTruthy();
    expect(allowed).toContain(host);
    expect(process.env.PGSSLMODE).toBe("disable");
    const schema = `student_state_cleanup_${process.pid}_${randomBytes(4).toString("hex")}`;
    const client = new Client({ connectionTimeoutMillis: 10_000, statement_timeout: 15_000 });
    const connection = new URL(`postgresql://${host}`);
    connection.port = process.env.PGPORT ?? "5432";
    connection.username = process.env.PGUSER ?? "";
    connection.password = process.env.PGPASSWORD ?? "";
    connection.pathname = `/${process.env.PGDATABASE}`;
    connection.searchParams.set("options", `-c search_path=${schema}`);
    const env = { HYPERDRIVE: { connectionString: connection.toString() } } as unknown as Env;
    const archive = await readFile(
      "db/postgres/migrations/20261011000100_archive_student_state_legacy_tables.sql",
      "utf8",
    );
    const oldNames = [
      "recruited_students",
      "student_growth",
      "user_relationship_levels",
      "student_state_migration_control",
    ];
    const snapshot = async (archived = false) => {
      const result = [];
      for (const name of oldNames) {
        const { rows } = await client.query(
          `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS data FROM ${archived ? "zzz_" : ""}${name} t`,
        );
        result.push(rows[0].data);
      }
      return result;
    };
    const names = async () =>
      (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema=$1", [schema])).rows.map(
        (row) => row.table_name,
      );
    let created = false;
    try {
      await client.connect();
      await client.query(`CREATE SCHEMA "${schema}"`);
      created = true;
      await client.query(`SET search_path TO "${schema}"`);
      for (const filename of [
        "20260807000100_create_student_state.sql",
        "20260901000200_add_recruited_student_equipment_levels.sql",
        "20261010000100_create_student_state_projection.sql",
      ]) {
        await client.query(await readFile(`db/postgres/migrations/${filename}`, "utf8"));
      }
      await client.query(`
        INSERT INTO recruited_students(uid,user_id,student_uid,tier,level,created_at) VALUES ('r1',1,'same-student',7,80,'2026-10-10 00:00:00.123456+00');
        INSERT INTO student_growth(uid,user_id,student_uid,level,target_level) VALUES ('g1',1,'same-student',66,60);
        INSERT INTO user_relationship_levels(uid,user_id,student_id,current_level,target_level,items) VALUES ('rel1',1,'same-student',20,10,'{"gift":2}');
        INSERT INTO student_states(uid,user_id,student_uid,recruited_student_uid,tier,level,recruited_at) VALUES ('s1',1,'same-student','r1',7,80,'2026-10-10 00:00:00.123456+00'),('s2',2,'same-student','r2',3,40,now());
        INSERT INTO student_targets(uid,user_id,student_uid,student_growth_uid,target_level,planner_added_at) VALUES ('t1',1,'same-student','g1',60,'2026-10-10 00:00:00.234567+00');
      `);
      const before = await snapshot();
      await expect(client.query(archive)).rejects.toThrow(/must be activated/);
      await client.query("ROLLBACK");
      expect(await snapshot()).toEqual(before);
      await client.query(
        "UPDATE student_state_migration_control SET nullable_semantics_enabled=true WHERE key='default'",
      );
      await client.query("CREATE TABLE zzz_student_growth(marker text)");
      await expect(client.query(archive)).rejects.toThrow(/already exists/);
      await client.query("ROLLBACK");
      expect(await names()).toEqual(expect.arrayContaining(oldNames));
      await client.query("DROP TABLE zzz_student_growth");
      const preserved = await snapshot();
      const oids = (
        await client.query(
          "SELECT oid,relname FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2::text[]) ORDER BY oid",
          [schema, oldNames],
        )
      ).rows;
      await client.query(archive);
      const afterNames = await names();
      for (const name of oldNames) {
        expect(afterNames).not.toContain(name);
        expect(afterNames).toContain(`zzz_${name}`);
      }
      expect(await snapshot(true)).toEqual(preserved);
      const afterOids = (
        await client.query("SELECT oid,relname FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid", [
          oids.map((row) => row.oid),
        ])
      ).rows;
      expect(afterOids).toEqual(oids.map((row) => ({ ...row, relname: `zzz_${row.relname}` })));

      expect((await getRecruitedStudents(env, 1))[0]).toMatchObject({ uid: "r1", level: 80, tier: 7 });
      expect(
        (
          await client.query(
            "SELECT to_char(recruited_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS.US') AS exact FROM student_states WHERE uid='s1'",
          )
        ).rows[0].exact,
      ).toBe("2026-10-10 00:00:00.123456");
      expect(await getStudentGrowth(env, 1, "same-student")).toMatchObject({ uid: "g1", targetLevel: 60 });
      await saveStudentGrowthAndCurrentState(
        env,
        1,
        "same-student",
        { level: null },
        { targetLevel: 30 },
        7,
        "nullable",
      );
      expect((await getRecruitedStudents(env, 1))[0].level).toBeNull();
      expect((await getRecruitedStudents(env, 2))[0].level).toBe(40);
      await upsertRelationshipLevel(env, 1, "same-student", 20, 42, 10, { gift: 2 }, "nullable");
      await updateRelationshipLevel(env, 1, "same-student", { currentLevel: 21 }, "nullable");
      expect(await getRelationshipLevel(env, 1, "same-student")).toMatchObject({
        currentLevel: 21,
        currentExp: null,
        targetLevel: 10,
        items: { gift: 2 },
      });
      await saveStudentBasicInfo(
        env,
        1,
        "same-student",
        { currentState: { level: 85 }, relationshipBonds: { "same-student": null, outfit: 30 } },
        { requestMode: "nullable" },
      );
      expect(await getRelationshipLevel(env, 1, "same-student")).toMatchObject({
        currentLevel: null,
        targetLevel: 10,
        items: { gift: 2 },
      });
      await removeStudentGrowth(env, 1, "same-student");
      expect(await getStudentGrowth(env, 1, "same-student")).toBeNull();
      expect(await getRelationshipLevel(env, 1, "same-student")).toMatchObject({ targetLevel: 10, items: { gift: 2 } });
      await upsertRecruitedStudent(env, 1, "same-student", 8);
      await Promise.all([
        saveStudentGrowthAndCurrentState(env, 1, "same-student", { skillEx: 4 }, {}, 8, "nullable"),
        saveStudentGrowthAndCurrentState(env, 1, "same-student", { level: 86 }, {}, 8, "nullable"),
      ]);
      expect((await getRecruitedStudents(env, 1))[0]).toMatchObject({ level: 86, skillEx: 4, tier: 8 });
      await expect(saveStudentGrowthAndCurrentState(env, 1, "same-student", { level: 1 }, {}, 8)).rejects.toThrow(
        /stale|refresh|새로고침/i,
      );
      expect((await getRecruitedStudents(env, 1))[0].level).toBe(86);

      const draftUid = await createSyncDraft(env, 1, {
        source: "web",
        type: "student_state",
        entries: [
          {
            entryKey: "same-student",
            value: 8,
            valueJson: JSON.stringify({ current: { tier: 8, level: 87 }, target: { targetTier: 8, targetLevel: 50 } }),
          },
        ],
      });
      await applySyncDraft(env, 1, draftUid, {
        studentStateRequestMode: "nullable",
        studentStateMetadataByKey: { "same-student": { initialTier: 3, hasGear: true } },
      });
      expect((await getRecruitedStudents(env, 1))[0]).toMatchObject({ level: 87, skillEx: 4 });
      expect(await getStudentGrowth(env, 1, "same-student")).toMatchObject({ targetLevel: 50 });
      const auditsBefore = (await client.query("SELECT count(*)::int AS count FROM student_state_audits")).rows[0]
        .count;
      await client.query(
        `CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END; $$; CREATE TRIGGER reject_audit BEFORE INSERT ON student_state_audits FOR EACH ROW EXECUTE FUNCTION reject_audit();`,
      );
      await expect(
        saveStudentBasicInfo(
          env,
          1,
          "same-student",
          { currentState: { level: 88 }, relationshipBonds: { outfit: 31 } },
          { requestMode: "nullable" },
        ),
      ).rejects.toMatchObject({ cause: { message: "injected audit failure" } });
      expect((await getRecruitedStudents(env, 1))[0]).toMatchObject({ tier: 8, level: 87 });
      expect(await getRelationshipLevel(env, 1, "outfit")).toMatchObject({ currentLevel: 30 });
      expect((await client.query("SELECT count(*)::int AS count FROM student_state_audits")).rows[0].count).toBe(
        auditsBefore,
      );
      await client.query("DROP TRIGGER reject_audit ON student_state_audits");
      await removeRecruitedStudent(env, 1, "same-student");
      expect(await getRecruitedStudents(env, 1)).toEqual([]);
      expect(await getStudentGrowth(env, 1, "same-student")).toMatchObject({ targetLevel: 50 });
      expect(await snapshot(true)).toEqual(preserved);
      expect(
        (
          await client.query(
            "SELECT to_char(recruited_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS.US') AS exact FROM student_states WHERE uid='s1'",
          )
        ).rows[0].exact,
      ).toBeNull();
    } finally {
      if (created) {
        await client.query("ROLLBACK");
        await client.query(`DROP SCHEMA "${schema}" CASCADE`);
        expect(
          (await client.query("SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=$1) AS exists", [schema])).rows[0]
            .exists,
        ).toBe(false);
      }
      await client.end();
    }
  }, 120_000);
});
