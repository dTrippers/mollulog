import { describe, expect, it } from "@jest/globals";
import { parseStudentStateDraftValue } from "~/domain/student-state";

function parseDraft(value: unknown, tierValue: number) {
  return parseStudentStateDraftValue({
    value: tierValue,
    valueJson: JSON.stringify(value),
  });
}

describe("student state draft value validation", () => {
  it("allows zero ability release values before the unique weapon is equipped", () => {
    expect(() =>
      parseDraft(
        {
          current: {
            tier: 5,
            weaponLevel: 0,
            abilityHp: 0,
            abilityAtk: 0,
            abilityHeal: 0,
          },
        },
        5,
      ),
    ).not.toThrow();
  });

  it("rejects current ability release levels before the unique weapon is equipped", () => {
    expect(() =>
      parseDraft(
        {
          current: {
            tier: 5,
            weaponLevel: 0,
            abilityHp: 1,
          },
        },
        5,
      ),
    ).toThrow("능력 해방은(는) 고유무기 장착 후 입력할 수 있어요");
  });

  it("rejects target ability release levels before the unique weapon is equipped", () => {
    expect(() =>
      parseDraft(
        {
          target: {
            targetTier: 5,
            targetWeaponLevel: 0,
            targetAbilityHp: 1,
          },
        },
        5,
      ),
    ).toThrow("목표 능력 해방은(는) 고유무기 장착 후 입력할 수 있어요");
  });
});
