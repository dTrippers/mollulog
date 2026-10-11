import { describe, expect, it, jest } from "@jest/globals";
import type { Client } from "pg";
import { type StudentCalculatorCatalog, validateStudentEquipmentLevels } from "~/domain/student-calculator";
import { mergeStudentBasicInfoEquipmentState, saveStudentBasicInfo } from "~/models/student-basic-info";

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
function createClient() {
  const client = {
    connect: jest.fn(async () => undefined),
    end: jest.fn(async () => undefined),
    query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  } as unknown as Client;
  return { client };
}

describe("student basic info operation", () => {
  it("merges a nullable equipment-level patch with the saved equipment tier", () => {
    const merged = mergeStudentBasicInfoEquipmentState(
      { equip1: 3, equip2: 2, equip3: 1, equip1Level: 10, equip2Level: 8, equip3Level: 6 },
      { equip1Level: 20 },
    );
    expect(merged).toEqual({ equip1: 3, equip2: 2, equip3: 1, equip1Level: 20, equip2Level: 8, equip3Level: 6 });
    expect(() =>
      validateStudentEquipmentLevels(
        { equipments: ["hat", "bag", "shoes"] } as never,
        {
          equipment: [
            { category: "hat", tier: 1, maxLevel: 10 },
            { category: "hat", tier: 3, maxLevel: 30 },
            { category: "bag", tier: 2, maxLevel: 20 },
            { category: "shoes", tier: 1, maxLevel: 15 },
          ],
        } as unknown as StudentCalculatorCatalog,
        merged,
      ),
    ).not.toThrow();
  });

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
});
