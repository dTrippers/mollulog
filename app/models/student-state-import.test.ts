import { describe, expect, it } from "@jest/globals";
import { parseStudentStateImport } from "./student-state-import";

const justin163OwnedWithTarget =
  '{"exportVersion":2,"characters":[{"id":"20048","name":"Nagisa (Swimsuit)","current":{"level":"1","ue_level":"0","bond":"1","ex":"1","basic":"2","passive":"3","sub":"4","gear1":"1","gear2":"2","gear3":"3","bond_gear":"0","book_hp":"0","book_atk":"0","book_heal":"0","star":5,"ue":1},"target":{"level":"90","ue_level":"50","bond":"100","ex":"5","basic":"6","passive":"7","sub":"8","gear1":"9","gear2":"10","gear3":"8","bond_gear":"2","book_hp":"25","book_atk":"26","book_heal":"27","star":5,"ue":3},"enabled":true}],"language":"Kr","level_cap":90,"server":"Global","site_version":"1.4.21"}';

describe("student-state-import", () => {
  it("maps Justin163 owned current state and target plan into nested entries", () => {
    expect(parseStudentStateImport(justin163OwnedWithTarget)).toEqual({
      format: "justin163",
      entries: [
        {
          studentId: "20048",
          current: {
            level: 1,
            tier: 6,
            weaponLevel: null,
            skillEx: 1,
            skillNormal: 2,
            skillEnhanced: 3,
            skillSub: 4,
            equip1: 1,
            equip2: 2,
            equip3: 3,
            equipSpecial: null,
            abilityHp: null,
            abilityAtk: null,
            abilityHeal: null,
            bond: 1,
          },
          target: {
            targetBond: 100,
            targetLevel: 90,
            targetTier: 8,
            targetSkillEx: 5,
            targetSkillNormal: 6,
            targetSkillEnhanced: 7,
            targetSkillSub: 8,
            targetEquip1: 9,
            targetEquip2: 10,
            targetEquip3: 8,
            targetEquipSpecial: 2,
          },
        },
      ],
    });
  });

  it("drops a Justin163 target that mirrors the current state", () => {
    // Justin163 requires a target block on every character, so an owned student
    // with no goal carries a target identical to current. That is not a plan.
    const payload = JSON.stringify({
      characters: [
        {
          id: "20048",
          current: {
            level: "90",
            ue_level: "0",
            bond: "100",
            ex: "5",
            basic: "10",
            passive: "10",
            sub: "10",
            gear1: "9",
            gear2: "9",
            gear3: "9",
            bond_gear: "2",
            book_hp: "0",
            book_atk: "0",
            book_heal: "0",
            star: 5,
            ue: 0,
          },
          target: {
            level: "90",
            ue_level: "0",
            bond: "100",
            ex: "5",
            basic: "10",
            passive: "10",
            sub: "10",
            gear1: "9",
            gear2: "9",
            gear3: "9",
            bond_gear: "2",
            book_hp: "0",
            book_atk: "0",
            book_heal: "0",
            star: 5,
            ue: 0,
          },
          enabled: true,
        },
      ],
    });

    expect(parseStudentStateImport(payload)).toEqual({
      format: "justin163",
      entries: [
        {
          studentId: "20048",
          current: {
            level: 90,
            tier: 5,
            weaponLevel: null,
            skillEx: 5,
            skillNormal: 10,
            skillEnhanced: 10,
            skillSub: 10,
            equip1: 9,
            equip2: 9,
            equip3: 9,
            equipSpecial: 2,
            abilityHp: null,
            abilityAtk: null,
            abilityHeal: null,
            bond: 100,
          },
          target: null,
        },
      ],
    });
  });

  it("keeps an unowned Justin163 student as a target-only plan", () => {
    const payload = JSON.stringify({
      characters: [
        {
          id: "10001",
          current: {
            level: "1",
            ue_level: "0",
            bond: "1",
            ex: "1",
            basic: "1",
            passive: "1",
            sub: "1",
            gear1: "1",
            gear2: "1",
            gear3: "1",
            bond_gear: "0",
            book_hp: "0",
            book_atk: "0",
            book_heal: "0",
            star: 1,
            ue: 0,
          },
          target: {
            level: "90",
            ex: "5",
            basic: "10",
            passive: "10",
            sub: "10",
            gear1: "10",
            gear2: "10",
            gear3: "10",
            bond_gear: "2",
            star: 5,
            ue: 2,
          },
        },
      ],
    });

    expect(parseStudentStateImport(payload)).toEqual({
      format: "justin163",
      entries: [
        {
          studentId: "10001",
          current: null,
          target: {
            targetBond: null,
            targetLevel: 90,
            targetTier: 7,
            targetSkillEx: 5,
            targetSkillNormal: 10,
            targetSkillEnhanced: 10,
            targetSkillSub: 10,
            targetEquip1: 10,
            targetEquip2: 10,
            targetEquip3: 10,
            targetEquipSpecial: 2,
          },
        },
      ],
    });
  });

  it("maps raw SchaleDB owned JSON with a null target", () => {
    const raw = JSON.stringify({
      "20048": {
        l: 1,
        s: 5,
        ws: 1,
        wl: 0,
        s1: 1,
        s2: 2,
        s3: 3,
        s4: 4,
        e1: 1,
        e2: 2,
        e3: 3,
        e4: 0,
        pm: 0,
        pa: 0,
        ph: 0,
        b: 1,
      },
    });

    expect(parseStudentStateImport(raw)).toEqual({
      format: "schaledb",
      entries: [
        expect.objectContaining({
          studentId: "20048",
          current: expect.objectContaining({ tier: 6, weaponLevel: null, abilityHp: null }),
          target: null,
        }),
      ],
    });
  });

  it("skips SchaleDB placeholder rows with no target data", () => {
    const raw = JSON.stringify({
      "10001": { l: 1, s: 1, ws: 0, wl: 0, s1: 1, s2: 1, s3: 1, s4: 1, e1: 1, e2: 1, e3: 1, e4: 0, b: 1 },
      "20048": { l: 2, s: 1, ws: 0, s1: 1, s2: 1, s3: 1, s4: 1, e1: 1, e2: 1, e3: 1, b: 1 },
    });

    expect(parseStudentStateImport(raw)).toEqual({
      format: "schaledb",
      entries: [
        expect.objectContaining({
          studentId: "20048",
          current: expect.objectContaining({ level: 2, tier: 1 }),
          target: null,
        }),
      ],
    });
  });

  it("treats every current field at or below base default as unowned", () => {
    const payload = JSON.stringify({
      characters: [
        {
          id: "10001",
          current: {
            level: null,
            ue_level: null,
            bond: "1",
            ex: "1",
            basic: "1",
            passive: "1",
            sub: "1",
            gear1: "1",
            gear2: "1",
            gear3: "1",
            bond_gear: null,
            book_hp: null,
            book_atk: null,
            book_heal: null,
            star: 1,
            ue: 0,
          },
          target: { level: "2", star: 1, ue: 0 },
        },
      ],
    });

    expect(parseStudentStateImport(payload)).toEqual({
      format: "justin163",
      entries: [
        expect.objectContaining({
          studentId: "10001",
          current: null,
          target: expect.objectContaining({ targetBond: null, targetLevel: 2, targetTier: 1 }),
        }),
      ],
    });
  });

  it("detects Base64-encoded SchaleDB JSON before raw JSON", () => {
    const raw = JSON.stringify({ "20048": { l: 90, s: 5, ws: 0, wl: 50, b: 100 } });
    const encoded = Buffer.from(raw, "utf8").toString("base64");

    expect(parseStudentStateImport(encoded)).toEqual({
      format: "schaledb",
      entries: [
        expect.objectContaining({
          studentId: "20048",
          current: expect.objectContaining({
            level: 90,
            tier: 5,
            weaponLevel: 50,
            bond: 100,
          }),
          target: null,
        }),
      ],
    });
  });

  it("rejects unknown or empty input with a user-facing error", () => {
    expect(() => parseStudentStateImport("")).toThrow("가져올 데이터를 입력해주세요.");
    expect(() => parseStudentStateImport('{"items":[]}')).toThrow(
      "SchaleDB 또는 Justin163 학생 데이터 JSON을 인식하지 못했어요.",
    );
  });

  it("rejects out-of-range composed tiers only for meaningful current or target blocks", () => {
    expect(() => parseStudentStateImport(JSON.stringify({ "20048": { s: 5, ws: 5 } }))).toThrow(
      "학생 등급은 1부터 9까지의 값만 가져올 수 있어요.",
    );
    expect(() =>
      parseStudentStateImport(
        JSON.stringify({
          characters: [
            {
              id: "10001",
              current: { star: 1, ue: 0 },
              target: { star: 5, ue: 5, level: 90 },
            },
          ],
        }),
      ),
    ).toThrow("학생 등급은 1부터 9까지의 값만 가져올 수 있어요.");
  });
});
