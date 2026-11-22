import { describe, expect, it } from "@jest/globals";
import {
  emptyStudentGrowthEditValues,
  isStudentGrowthFieldApplicable,
  type StudentGrowthEditStudent,
  type StudentGrowthEditValues,
  validateStudentGrowthEdit,
} from "~/domain/student-growth-edit";

const student: StudentGrowthEditStudent = {
  initialTier: 3,
  equipments: ["Hat", "Gloves", "Shoes"],
  gearAvailable: true,
};
const limits = [
  { category: "Hat", tier: 1, maxLevel: 10 },
  { category: "Hat", tier: 7, maxLevel: 60 },
  { category: "Gloves", tier: 1, maxLevel: 10 },
  { category: "Shoes", tier: 1, maxLevel: 10 },
];

function values(overrides: Partial<StudentGrowthEditValues>): StudentGrowthEditValues {
  return { ...emptyStudentGrowthEditValues(), ...overrides };
}

function fieldsOf(overrides: Partial<StudentGrowthEditValues>, target: StudentGrowthEditStudent = student) {
  return validateStudentGrowthEdit(values(overrides), target, limits).map(({ field }) => field);
}

describe("validateStudentGrowthEdit", () => {
  it("accepts an empty set and the boundary values", () => {
    expect(fieldsOf({})).toEqual([]);
    expect(
      fieldsOf({
        tier: 9,
        level: 90,
        bond: 100,
        weaponLevel: 60,
        skillEx: 5,
        skillNormal: 10,
        equip1: 7,
        equip1Level: 60,
        equipSpecial: 2,
        abilityHp: 25,
      }),
    ).toEqual([]);
  });

  it("rejects values outside each range", () => {
    expect(fieldsOf({ level: 91, bond: 101, skillEx: 6, skillNormal: 0, equipSpecial: 3 })).toEqual([
      "level",
      "bond",
      "skillEx",
      "skillNormal",
      "equipSpecial",
    ]);
  });

  it("rejects a tier below the student's initial tier", () => {
    const [error] = validateStudentGrowthEdit(values({ tier: 2 }), student, limits);
    expect(error).toMatchObject({ field: "tier" });
    expect(error?.message).toContain("★3");
  });

  it("rejects values that are not whole numbers", () => {
    expect(fieldsOf({ level: 80.5 })).toEqual(["level"]);
  });

  it("caps the weapon level by the tier being entered", () => {
    expect(fieldsOf({ tier: 6, weaponLevel: 30 })).toEqual([]);
    const [error] = validateStudentGrowthEdit(values({ tier: 6, weaponLevel: 31 }), student, limits);
    expect(error).toMatchObject({ field: "weaponLevel", max: 30 });
    expect(fieldsOf({ tier: 5, weaponLevel: 1 })).toEqual(["weaponLevel"]);
  });

  it("allows ability release only from ★6, but accepts a stored zero", () => {
    expect(fieldsOf({ tier: 5, abilityHp: 3 })).toEqual(["abilityHp"]);
    expect(fieldsOf({ tier: 5, abilityHp: 0 })).toEqual([]);
    expect(fieldsOf({ tier: 6, abilityAtk: 25 })).toEqual([]);
    expect(fieldsOf({ tier: 6, abilityAtk: 26 })).toEqual(["abilityAtk"]);
  });

  it("caps the equipment level by the equipment's tier", () => {
    expect(fieldsOf({ equip1: 7, equip1Level: 60 })).toEqual([]);
    const [error] = validateStudentGrowthEdit(values({ equip1: 7, equip1Level: 61 }), student, limits);
    expect(error).toMatchObject({ field: "equip1Level", max: 60 });
    // No tier entered: the slot is read at tier 1.
    expect(fieldsOf({ equip2Level: 11 })).toEqual(["equip2Level"]);
  });

  it("reports an equipment level it cannot check instead of passing it", () => {
    expect(fieldsOf({ equip1: 4, equip1Level: 5 })).toEqual(["equip1Level"]);
  });

  it("rejects equipment and the favorite item the student does not have", () => {
    const limited = { initialTier: 3, equipments: ["Hat"], gearAvailable: false };
    expect(fieldsOf({ equip2: 1, equip3Level: 1, equipSpecial: 1 }, limited)).toEqual([
      "equip2",
      "equip3Level",
      "equipSpecial",
    ]);
    expect(isStudentGrowthFieldApplicable("equip3", limited, 5)).toBe(false);
    expect(isStudentGrowthFieldApplicable("equip1", limited, 5)).toBe(true);
  });

  it("writes the topic particle by the label's last syllable", () => {
    const [bond] = validateStudentGrowthEdit(values({ bond: 101 }), student, limits);
    const [level] = validateStudentGrowthEdit(values({ level: 91 }), student, limits);
    expect(bond?.message.startsWith("인연 랭크는")).toBe(true);
    expect(level?.message.startsWith("학생 Lv는")).toBe(true);
  });
});
