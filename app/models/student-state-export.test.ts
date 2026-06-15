import { describe, expect, it } from "@jest/globals";
import type { RecruitedStudent } from "./recruited-student";
import type { RelationshipLevel } from "./relationship-level";
import type { StudentGrowth } from "./student-growth";
import { parseStudentStateImport } from "./student-state-import";
import {
  type StudentStateExportInput,
  serializeJustin163Export,
  serializeSchaleDbExport,
} from "./student-state-export";

describe("student-state-export", () => {
  it("serializes current state to Base64-encoded SchaleDB JSON with defaults", () => {
    const output = serializeSchaleDbExport({
      recruitedStudents: [
        createRecruitedStudent({
          studentUid: "20048",
          tier: 6,
          level: 90,
          skillEx: 5,
          skillNormal: 7,
          skillEnhanced: null,
          skillSub: 10,
          equip1: 9,
          equip2: null,
          equip3: 8,
          equipSpecial: null,
          weaponLevel: 30,
          abilityHp: 10,
          abilityAtk: 15,
          abilityHeal: 20,
        }),
      ],
      studentGrowths: [],
      relationshipLevels: [createRelationshipLevel({ studentId: "20048", currentLevel: 35, targetLevel: 80 })],
      studentCatalog: { "20048": { name: "나기사(수영복)", order: 1 } },
    });

    const decoded = JSON.parse(Buffer.from(output, "base64").toString("utf8"));

    expect(decoded).toEqual({
      "20048": {
        s: 5,
        ws: 1,
        l: 90,
        wl: 30,
        s1: 5,
        s2: 7,
        s3: 1,
        s4: 10,
        e1: 9,
        e2: 1,
        e3: 8,
        e4: 0,
        pm: 10,
        pa: 15,
        ph: 20,
        b: 35,
      },
    });
  });

  it("serializes Justin163 wrapper, current strings, numeric star and ue, and target fallback values", () => {
    const output = serializeJustin163Export({
      recruitedStudents: [
        createRecruitedStudent({
          studentUid: "20048",
          tier: 8,
          level: 87,
          skillEx: 5,
          skillNormal: 7,
          skillEnhanced: 8,
          skillSub: 9,
          equip1: 9,
          equip2: 8,
          equip3: 7,
          equipSpecial: 2,
          weaponLevel: 50,
          abilityHp: 10,
          abilityAtk: 15,
          abilityHeal: 20,
        }),
        createRecruitedStudent({ studentUid: "10001", tier: 5, level: 70 }),
      ],
      studentGrowths: [
        createStudentGrowth({
          studentUid: "20048",
          targetTier: 9,
          targetLevel: 90,
          targetSkillEx: null,
          targetSkillNormal: 10,
          targetEquip2: 10,
          targetWeaponLevel: 60,
          targetAbilityHp: 25,
          targetAbilityAtk: 24,
          targetAbilityHeal: 23,
        }),
      ],
      relationshipLevels: [createRelationshipLevel({ studentId: "20048", currentLevel: 20, targetLevel: 50 })],
      studentCatalog: {
        "10001": { name: "아루", order: 1 },
        "20048": { name: "나기사(수영복)", order: 2 },
      },
    });

    const payload = JSON.parse(output);

    expect(payload).toEqual({
      exportVersion: 2,
      characters: [
        {
          id: "10001",
          name: "아루",
          current: expect.objectContaining({
            level: "70",
            ue_level: "0",
            bond: "1",
            ex: "1",
            star: 5,
            ue: 0,
          }),
          // No growth or bond goal, so the target mirrors the current state.
          target: expect.objectContaining({
            level: "70",
            ue_level: "0",
            bond: "1",
            ex: "1",
            star: 5,
            ue: 0,
          }),
          enabled: true,
        },
        {
          id: "20048",
          name: "나기사(수영복)",
          current: {
            level: "87",
            ue_level: "50",
            bond: "20",
            ex: "5",
            basic: "7",
            passive: "8",
            sub: "9",
            gear1: "9",
            gear2: "8",
            gear3: "7",
            bond_gear: "2",
            book_hp: "10",
            book_atk: "15",
            book_heal: "20",
            star: 5,
            ue: 3,
          },
          target: {
            level: "90",
            ue_level: "60",
            bond: "50",
            ex: "5",
            basic: "10",
            passive: "8",
            sub: "9",
            gear1: "9",
            gear2: "10",
            gear3: "7",
            bond_gear: "2",
            book_hp: "25",
            book_atk: "24",
            book_heal: "23",
            star: 5,
            ue: 4,
          },
          enabled: true,
        },
      ],
      language: "Kr",
      level_cap: 90,
      server: "Global",
      site_version: "1.4.21",
    });
  });

  it("round-trips SchaleDB current state through the import parser", () => {
    const input: StudentStateExportInput = {
      recruitedStudents: [
        createRecruitedStudent({
          studentUid: "20048",
          tier: 6,
          level: 90,
          skillEx: 5,
          skillNormal: 7,
          skillEnhanced: 8,
          skillSub: 9,
          equip1: 9,
          equip2: 8,
          equip3: 7,
          equipSpecial: 2,
        }),
      ],
      studentGrowths: [],
      relationshipLevels: [createRelationshipLevel({ studentId: "20048", currentLevel: 20, targetLevel: 50 })],
      studentCatalog: { "20048": { name: "나기사(수영복)", order: 1 } },
    };

    expect(parseStudentStateImport(serializeSchaleDbExport(input))).toEqual({
      format: "schaledb",
      entries: [
        {
          studentId: "20048",
          current: {
            tier: 6,
            level: 90,
            skillEx: 5,
            skillNormal: 7,
            skillEnhanced: 8,
          skillSub: 9,
          equip1: 9,
          equip2: 8,
          equip3: 7,
          equipSpecial: 2,
          weaponLevel: 0,
          abilityHp: 0,
          abilityAtk: 0,
          abilityHeal: 0,
          bond: 20,
          },
          target: null,
        },
      ],
    });
  });

  it("round-trips Justin163 current and target state through the import parser", () => {
    const output = serializeJustin163Export({
      recruitedStudents: [createRecruitedStudent({ studentUid: "20048", tier: 6, level: 90, skillNormal: 7 })],
      studentGrowths: [
        createStudentGrowth({
          studentUid: "20048",
          targetTier: 8,
          targetLevel: 90,
          targetSkillEx: 5,
          targetSkillNormal: 10,
          targetSkillEnhanced: 10,
          targetSkillSub: 10,
          targetEquip1: 9,
          targetEquip2: 9,
          targetEquip3: 9,
          targetEquipSpecial: 2,
        }),
      ],
      relationshipLevels: [createRelationshipLevel({ studentId: "20048", currentLevel: 30, targetLevel: 80 })],
      studentCatalog: { "20048": { name: "나기사(수영복)", order: 1 } },
    });

    expect(parseStudentStateImport(output)).toEqual({
      format: "justin163",
      entries: [
        {
          studentId: "20048",
          current: {
            tier: 6,
            weaponLevel: 0,
            level: 90,
            abilityHp: 0,
            abilityAtk: 0,
            abilityHeal: 0,
            skillEx: 1,
            skillNormal: 7,
            skillEnhanced: 1,
            skillSub: 1,
            equip1: 1,
            equip2: 1,
            equip3: 1,
            equipSpecial: null,
            bond: 30,
          },
          target: {
            targetBond: 80,
            targetTier: 8,
            targetWeaponLevel: 0,
            targetLevel: 90,
            targetAbilityHp: 0,
            targetAbilityAtk: 0,
            targetAbilityHeal: 0,
            targetSkillEx: 5,
            targetSkillNormal: 10,
            targetSkillEnhanced: 10,
            targetSkillSub: 10,
            targetEquip1: 9,
            targetEquip2: 9,
            targetEquip3: 9,
            targetEquipSpecial: 2,
          },
        },
      ],
    });
  });

  it("skips target-only students in SchaleDB but includes them in Justin163", () => {
    const input: StudentStateExportInput = {
      recruitedStudents: [createRecruitedStudent({ studentUid: "20048", tier: 6, level: 90 })],
      studentGrowths: [createStudentGrowth({ studentUid: "10001", targetTier: 5, targetLevel: 80 })],
      relationshipLevels: [],
      studentCatalog: {
        "10001": { name: "아루", order: 1 },
        "20048": { name: "나기사(수영복)", order: 2 },
      },
    };

    const schaleDbPayload = JSON.parse(Buffer.from(serializeSchaleDbExport(input), "base64").toString("utf8"));
    const justin163Payload = JSON.parse(serializeJustin163Export(input));

    expect(Object.keys(schaleDbPayload)).toEqual(["20048"]);
    expect(justin163Payload.characters).toEqual([
      expect.objectContaining({
        id: "10001",
        current: expect.objectContaining({ level: "1", star: 1, ue: 0 }),
        target: expect.objectContaining({ level: "80", star: 5, ue: 0 }),
      }),
      expect.objectContaining({ id: "20048" }),
    ]);
  });

  it("always emits a Justin163 target mirroring current when there is no growth or bond goal", () => {
    const input: StudentStateExportInput = {
      recruitedStudents: [
        createRecruitedStudent({ studentUid: "20048", tier: 6, level: 90 }),
        createRecruitedStudent({ studentUid: "10001", tier: 5, level: 70 }),
      ],
      // An existing growth record with no target values must not change the target.
      studentGrowths: [createStudentGrowth({ studentUid: "10001" })],
      // targetLevel === currentLevel means the bond has no growth target.
      relationshipLevels: [createRelationshipLevel({ studentId: "20048", currentLevel: 30, targetLevel: 30 })],
      studentCatalog: {
        "10001": { name: "아루", order: 1 },
        "20048": { name: "나기사(수영복)", order: 2 },
      },
    };

    const payload = JSON.parse(serializeJustin163Export(input));

    // Justin163 requires a target block on every character (its renderer reads
    // `target.book_*` unconditionally), so the target must always exist and,
    // absent any goal, mirror the current state exactly.
    expect(payload.characters).toHaveLength(2);
    for (const character of payload.characters) {
      expect(character.target).toEqual(character.current);
    }

    // The round-trip stays symmetric: a target equal to current is dropped on re-import.
    const reimported = parseStudentStateImport(serializeJustin163Export(input));
    expect(reimported.entries.every((entry) => entry.target === null)).toBe(true);
  });
});

function createRecruitedStudent(input: Partial<RecruitedStudent> & Pick<RecruitedStudent, "studentUid" | "tier">): RecruitedStudent {
  return {
    uid: `recruited-${input.studentUid}`,
    level: null,
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
    ...input,
  };
}

function createStudentGrowth(input: Partial<StudentGrowth> & Pick<StudentGrowth, "studentUid">): StudentGrowth {
  return {
    uid: `growth-${input.studentUid}`,
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
    ...input,
  };
}

function createRelationshipLevel(
  input: Partial<RelationshipLevel> & Pick<RelationshipLevel, "studentId" | "currentLevel" | "targetLevel">,
): RelationshipLevel {
  return {
    uid: `relationship-${input.studentId}`,
    currentExp: null,
    items: {},
    ...input,
  };
}
