import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { Client } from "pg";
import {
  applyPostgresRaidRecordChartScore,
  createPostgresRaidRecord,
  getPostgresRaidRecordBySeason,
  RaidRecordBatchStaleError,
  RaidRecordSeasonConflictError,
  type RaidRecordSeasonKey,
  savePostgresRaidRecordsBatch,
} from "~/db/postgres/raid-records";
import type { RaidRecordScore } from "~/domain/raid-record";

// Runs against a real PostgreSQL (the PG* environment), in a schema of its own that is dropped afterwards.
const describeDatabase = process.env.MOLLULOG_RAID_RECORDS_POSTGRES === "1" ? describe : describe.skip;
const schema = `raid_records_test_${randomUUID().replaceAll("-", "")}`;
const migration = readFileSync(resolve("db/postgres/migrations/20261120120000_create_raid_records.sql"), "utf8");
const env = {} as Env;
const options = {
  createClient: () => new Client({ options: `-c search_path=${schema}`, connectionTimeoutMillis: 5000 }),
};
const USER_ID = 7;
const elimination: RaidRecordSeasonKey = { server: "kr", raidType: "elimination", seasonIndex: 35 };
let admin: Client;

function score(defenseType: RaidRecordScore["defenseType"], value: number): RaidRecordScore {
  return { defenseType, score: value, difficulty: "torment", clearTimeMs: 145_000 };
}

async function createRecord(
  key: RaidRecordSeasonKey,
  values: Partial<Parameters<typeof createPostgresRaidRecord>[3]> = {},
) {
  return createPostgresRaidRecord(
    env,
    USER_ID,
    key,
    {
      scores: [score("heavy", 40_000_000)],
      rank: 1200,
      rankRecordedAt: "2026-11-20T00:00:00.000Z",
      memo: "",
      parties: [],
      ...values,
    },
    options,
  );
}

describeDatabase("raid records on PostgreSQL", () => {
  beforeAll(async () => {
    admin = new Client({ connectionTimeoutMillis: 5000 });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`SET search_path TO ${schema}`);
    await admin.query(migration);
  });

  beforeEach(async () => {
    await admin.query("DELETE FROM raid_records");
  });

  afterAll(async () => {
    if (admin) {
      try {
        await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await admin.end();
      }
    }
  });

  it("keeps one record per user, server, raid type, and season", async () => {
    await createRecord(elimination);
    await expect(createRecord(elimination)).rejects.toBeInstanceOf(RaidRecordSeasonConflictError);
    // The other server's season of the same number is a different record.
    await expect(createRecord({ ...elimination, server: "jp" })).resolves.toMatchObject({ server: "jp" });
  });

  describe("table batch save", () => {
    it("creates and updates every row in one transaction", async () => {
      const existing = await createRecord(elimination);
      await savePostgresRaidRecordsBatch(
        env,
        USER_ID,
        [
          {
            key: elimination,
            uid: existing.uid,
            values: { scores: [score("heavy", 41_000_000)], rank: 1100, rankRecordedAt: existing.rankRecordedAt },
          },
          {
            key: { ...elimination, seasonIndex: 34 },
            uid: null,
            values: { scores: [score("light", 30_000_000)], rank: 900, rankRecordedAt: "2026-11-21T00:00:00.000Z" },
          },
        ],
        options,
      );

      const updated = await getPostgresRaidRecordBySeason(env, USER_ID, elimination, options);
      expect(updated).toMatchObject({ uid: existing.uid, rank: 1100, scores: [score("heavy", 41_000_000)] });
      const created = await getPostgresRaidRecordBySeason(env, USER_ID, { ...elimination, seasonIndex: 34 }, options);
      expect(created).toMatchObject({ rank: 900, memo: "", parties: [] });
    });

    it("saves nothing when a row's record changed since the table read it", async () => {
      const existing = await createRecord(elimination);
      await createRecord({ ...elimination, seasonIndex: 34 });

      // Season 33 is new, but season 34 gained a record the table did not see.
      await expect(
        savePostgresRaidRecordsBatch(
          env,
          USER_ID,
          [
            {
              key: { ...elimination, seasonIndex: 33 },
              uid: null,
              values: { scores: [], rank: 1, rankRecordedAt: null },
            },
            {
              key: { ...elimination, seasonIndex: 34 },
              uid: null,
              values: { scores: [], rank: 1, rankRecordedAt: null },
            },
          ],
          options,
        ),
      ).rejects.toBeInstanceOf(RaidRecordBatchStaleError);
      expect(
        await getPostgresRaidRecordBySeason(env, USER_ID, { ...elimination, seasonIndex: 33 }, options),
      ).toBeNull();

      // A uid that does not belong to the season is stale too.
      await expect(
        savePostgresRaidRecordsBatch(
          env,
          USER_ID,
          [
            {
              key: { ...elimination, seasonIndex: 34 },
              uid: existing.uid,
              values: { scores: [], rank: 1, rankRecordedAt: null },
            },
          ],
          options,
        ),
      ).rejects.toBeInstanceOf(RaidRecordBatchStaleError);
    });
  });

  describe("season chart score", () => {
    it("creates a score-only record and replaces one defense type's score", async () => {
      const created = await applyPostgresRaidRecordChartScore(
        env,
        USER_ID,
        elimination,
        score("heavy", 40_000_000),
        options,
      );
      expect(created).toMatchObject({
        kind: "saved",
        record: { rank: null, rankRecordedAt: null, memo: "", parties: [] },
      });

      await applyPostgresRaidRecordChartScore(env, USER_ID, elimination, score("elastic", 39_000_000), options);
      const replaced = await applyPostgresRaidRecordChartScore(
        env,
        USER_ID,
        elimination,
        score("heavy", 38_000_000),
        options,
      );
      expect(replaced.kind === "saved" && replaced.record.scores).toEqual([
        score("elastic", 39_000_000),
        score("heavy", 38_000_000),
      ]);
    });

    it("removes a cleared score from a score-only record and the record once no score is left", async () => {
      await applyPostgresRaidRecordChartScore(env, USER_ID, elimination, score("heavy", 40_000_000), options);
      await applyPostgresRaidRecordChartScore(env, USER_ID, elimination, score("elastic", 39_000_000), options);

      const cleared = await applyPostgresRaidRecordChartScore(
        env,
        USER_ID,
        elimination,
        { defenseType: "heavy", score: null },
        options,
      );
      expect(cleared.kind === "saved" && cleared.record.scores).toEqual([score("elastic", 39_000_000)]);
      await expect(
        applyPostgresRaidRecordChartScore(env, USER_ID, elimination, { defenseType: "elastic", score: null }, options),
      ).resolves.toEqual({ kind: "deleted" });
      expect(await getPostgresRaidRecordBySeason(env, USER_ID, elimination, options)).toBeNull();
    });

    it("keeps a record that holds more than scores when its score is cleared", async () => {
      const existing = await createRecord(elimination, { rank: null, rankRecordedAt: null, memo: "메모" });

      const result = await applyPostgresRaidRecordChartScore(
        env,
        USER_ID,
        elimination,
        { defenseType: "heavy", score: null },
        options,
      );
      expect(result).toMatchObject({ kind: "kept", record: { uid: existing.uid, scores: existing.scores } });
      await expect(
        applyPostgresRaidRecordChartScore(
          env,
          USER_ID,
          { ...elimination, seasonIndex: 1 },
          { defenseType: "heavy", score: null },
          options,
        ),
      ).resolves.toEqual({ kind: "kept", record: null });
    });

    it("updates the record another save created first instead of failing", async () => {
      const results = await Promise.all([
        applyPostgresRaidRecordChartScore(env, USER_ID, elimination, score("heavy", 40_000_000), options),
        applyPostgresRaidRecordChartScore(env, USER_ID, elimination, score("elastic", 39_000_000), options),
      ]);
      expect(results.map((result) => result.kind)).toEqual(["saved", "saved"]);

      const record = await getPostgresRaidRecordBySeason(env, USER_ID, elimination, options);
      expect(record?.scores.map((entry) => entry.defenseType).sort()).toEqual(["elastic", "heavy"]);
    });
  });
});
