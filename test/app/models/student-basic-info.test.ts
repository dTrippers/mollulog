import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { saveStudentBasicInfo } from "~/models/student-basic-info";

const env = { HYPERDRIVE: { connectionString: "postgres://unused" } as Hyperdrive } as Env;
const currentState = {
  level: 80,
  skillEx: null,
  skillNormal: null,
  skillEnhanced: null,
  skillSub: null,
  equip1: null,
  equip2: null,
  equip3: null,
  equipSpecial: null,
  weaponLevel: null,
  abilityHp: null,
  abilityAtk: null,
  abilityHeal: null,
};

function createClient(options: { failRelationshipWriteAt?: number; failOnlyOnce?: boolean } = {}) {
  let relationshipWriteCount = 0;
  let injectedFailure = false;
  const query = jest.fn(async (config: { text: string } | string) => {
    const text = typeof config === "string" ? config : config.text;
    if (text.includes('insert into "user_relationship_levels"')) {
      relationshipWriteCount += 1;
      if (options.failRelationshipWriteAt === relationshipWriteCount && (!options.failOnlyOnce || !injectedFailure)) {
        injectedFailure = true;
        throw new Error("relationship write failed");
      }
    }
    if (text.includes('from "user_relationship_levels"')) {
      return {
        rows: [
          [
            1,
            "relationship-1",
            7,
            "student-a",
            5,
            42,
            8,
            { gift: 3 },
            new Date("2026-09-01T00:00:00Z"),
            new Date("2026-09-01T00:00:00Z"),
          ],
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 1 };
  });
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query,
  } as unknown as Client;
  return { client, query };
}

describe("student basic info operation", () => {
  it("validates all inputs before opening the database", async () => {
    const { client } = createClient();

    await expect(
      saveStudentBasicInfo(
        env,
        7,
        "student-a",
        { tier: 3, currentState, relationshipBonds: { "student-a": 101 } },
        { createClient: () => client },
      ),
    ).rejects.toThrow("1부터 100");
    expect(client.connect).not.toHaveBeenCalled();
  });

  it("commits state and every relationship bond through one transaction", async () => {
    const { client, query } = createClient();

    await expect(
      saveStudentBasicInfo(
        env,
        7,
        "student-a",
        { tier: 3, currentState, relationshipBonds: { "student-a": 6, "student-b": 4 } },
        { createClient: () => client },
      ),
    ).resolves.toBeUndefined();

    const sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts.filter((sql) => sql === "begin")).toHaveLength(1);
    expect(sqlTexts.some((sql) => sql.includes('insert into "recruited_students"'))).toBe(true);
    expect(sqlTexts.filter((sql) => sql.includes('insert into "user_relationship_levels"'))).toHaveLength(2);
    expect(sqlTexts.some((sql) => sql.includes("for update"))).toBe(true);
    expect(sqlTexts.some((sql) => sql.includes("greatest"))).toBe(true);
    expect(sqlTexts).toContain("commit");
  });

  it("rolls back after a mid-bond failure and succeeds on retry", async () => {
    const { client, query } = createClient({ failRelationshipWriteAt: 2, failOnlyOnce: true });

    const save = () =>
      saveStudentBasicInfo(
        env,
        7,
        "student-a",
        { tier: 3, currentState, relationshipBonds: { "student-a": 6, "student-b": 4 } },
        { createClient: () => client },
      );

    await expect(save()).rejects.toThrow('insert into "user_relationship_levels"');

    let sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts).toContain("rollback");
    expect(sqlTexts).not.toContain("commit");

    await expect(save()).resolves.toBeUndefined();

    sqlTexts = query.mock.calls.map(([config]) => (typeof config === "string" ? config : config.text));
    expect(sqlTexts.filter((sql) => sql === "begin")).toHaveLength(2);
    expect(sqlTexts.filter((sql) => sql === "rollback")).toHaveLength(1);
    expect(sqlTexts.filter((sql) => sql === "commit")).toHaveLength(1);
    expect(sqlTexts.filter((sql) => sql.includes('insert into "user_relationship_levels"'))).toHaveLength(4);
  });
});
