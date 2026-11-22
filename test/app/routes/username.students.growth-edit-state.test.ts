import { describe, expect, it } from "@jest/globals";
import { Attack, Defense, Position, RoleEnum, TacticRole } from "~/graphql/graphql";
import {
  buildGrowthSavePayload,
  countGrowthChanges,
  type GrowthRow,
  getEffectiveValues,
  setDraftValue,
  toGrowthRow,
  validateGrowthDraft,
} from "~/routes/$username.students._components/growth-edit-state";
import type { UserStudent } from "~/views/user-students.server";

const unavailable = { available: false, category: null, tier: null, level: null, maxLevel: null, uid: null };
const base: UserStudent = {
  uid: "arisu",
  name: "아리스",
  attackType: Attack.Mystic,
  defenseType: Defense.Light,
  role: RoleEnum.Striker,
  position: Position.Back,
  tacticRole: TacticRole.Attacker,
  order: 1,
  initialTier: 3,
  tier: 4,
  growth: {
    bond: 10,
    level: 70,
    weaponLevel: null,
    skillEx: 3,
    skillNormal: null,
    skillEnhanced: null,
    skillSub: null,
    equipment: [
      { available: true, category: "Hat", tier: 2, level: 10, maxLevel: 20, uid: "hat-2" },
      unavailable,
      unavailable,
    ],
    equipSpecial: null,
    equipSpecialAvailable: false,
    abilityHp: null,
    abilityAtk: null,
    abilityHeal: null,
    weaponAvailable: false,
  },
};

function row(): GrowthRow {
  const result = toGrowthRow(base);
  if (!result) throw new Error("fixture has no growth");
  return result;
}

describe("growth edit state", () => {
  it("builds a row from the loaded growth and skips unrecruited students", () => {
    expect(toGrowthRow({ ...base, tier: null, growth: undefined })).toBeNull();
    const result = row();
    expect(result.loaded).toMatchObject({ tier: 4, bond: 10, level: 70, equip1: 2, equip1Level: 10, equip2: null });
    expect(result.student).toEqual({ initialTier: 3, equipments: ["Hat"], gearAvailable: false });
  });

  it("drops a cell typed back to the loaded value and prunes empty rows", () => {
    const target = row();
    let draft = setDraftValue({}, target, {}, "level", 80);
    expect(countGrowthChanges(draft)).toEqual({ students: 1, values: 1 });
    draft = setDraftValue(draft, target, {}, "level", 70);
    expect(draft).toEqual({});
    expect(countGrowthChanges(draft)).toEqual({ students: 0, values: 0 });
  });

  it("compares against the baseline when another screen changed the value", () => {
    const target = row();
    const baseline = { arisu: { level: 85 } };
    expect(getEffectiveValues(target, {}, baseline).level).toBe(85);
    expect(setDraftValue({}, target, baseline, "level", 85)).toEqual({});
    expect(setDraftValue({}, target, baseline, "level", 70)).toEqual({ arisu: { level: 70 } });
  });

  it("clears a value by writing null", () => {
    const draft = setDraftValue({}, row(), {}, "level", null);
    expect(draft).toEqual({ arisu: { level: null } });
  });

  it("validates only the changed rows against the values the row would have", () => {
    const target = row();
    const limits = [{ category: "Hat", tier: 2, maxLevel: 20 }];
    expect(validateGrowthDraft([target], {}, {}, limits)).toEqual({});
    const draft = setDraftValue(setDraftValue({}, target, {}, "level", 95), target, {}, "equip1Level", 21);
    const errors = validateGrowthDraft([target], draft, {}, limits);
    expect(Object.keys(errors.arisu ?? {}).sort()).toEqual(["equip1Level", "level"]);
  });

  it("sends the changed cells with the value each was compared with", () => {
    const target = row();
    const baseline = { arisu: { level: 85 } };
    const draft = setDraftValue(setDraftValue({}, target, baseline, "level", 90), target, baseline, "skillEx", 4);
    expect(buildGrowthSavePayload(draft, [target], baseline)).toEqual([
      { studentUid: "arisu", changes: { level: 90, skillEx: 4 }, expected: { level: 85, skillEx: 3 } },
    ]);
  });
});
