import Decimal from "decimal.js";
import { useMemo } from "react";
import type { EventRewardBonus } from "~/domain/event-shop";

export type BonusSummary = {
  uid: string;
  appliedStrikerRatio: Decimal;
  appliedSpecialRatio: Decimal;
  maxStrikerRatio: Decimal;
  maxSpecialRatio: Decimal;
};

export type BonusCalculationResult = {
  appliedBonusRatios: Record<string, Decimal>;
  bonusSummary: BonusSummary[];
};

type UseBonusCalculationParams = {
  eventRewardBonus: EventRewardBonus[];
  selectedStudentUids: string[];
  selectedStudentUidsByItem?: Record<string, string[]>;
};

export function calculateBonusSummary({
  eventRewardBonus,
  selectedStudentUids,
  selectedStudentUidsByItem,
}: UseBonusCalculationParams): BonusSummary[] {
  return eventRewardBonus
    .map(({ uid, rewardBonuses }) => {
      let appliedStrikerRatio = new Decimal(0);
      let appliedStrikerCount = 0;
      let maxStrikerRatio = new Decimal(0);
      let maxStrikerCount = 0;
      let appliedSpecialRatio = new Decimal(0);
      let appliedSpecialCount = 0;
      let maxSpecialRatio = new Decimal(0);
      let maxSpecialCount = 0;

      const sortedRewardBonuses = [...rewardBonuses].sort((a, b) => Number(b.ratio) - Number(a.ratio));

      if (sortedRewardBonuses.length === 0 || Number(sortedRewardBonuses[0].ratio) === 0) {
        return null;
      }

      const selectedUids = selectedStudentUidsByItem?.[uid] ?? selectedStudentUids;
      for (const { student, ratio } of sortedRewardBonuses) {
        const selected = selectedUids.includes(student.uid);

        if (student.role === "striker") {
          if (maxStrikerCount < 4) {
            maxStrikerRatio = maxStrikerRatio.plus(ratio);
            maxStrikerCount += 1;
          }
          if (selected && appliedStrikerCount < 4) {
            appliedStrikerRatio = appliedStrikerRatio.plus(ratio);
            appliedStrikerCount += 1;
          }
        } else if (student.role === "special") {
          if (maxSpecialCount < 2) {
            maxSpecialRatio = maxSpecialRatio.plus(ratio);
            maxSpecialCount += 1;
          }
          if (selected && appliedSpecialCount < 2) {
            appliedSpecialRatio = appliedSpecialRatio.plus(ratio);
            appliedSpecialCount += 1;
          }
        }

        if (appliedStrikerCount === 4 && appliedSpecialCount === 2) {
          break;
        }
      }

      return {
        uid,
        appliedStrikerRatio,
        appliedSpecialRatio,
        maxStrikerRatio,
        maxSpecialRatio,
      };
    })
    .filter((bonus): bonus is BonusSummary => bonus !== null);
}

/**
 * Shared hook for calculating event reward bonuses.
 * Unifies logic from EventDetailStagePage and StudentBonusSelector.
 */
export function useBonusCalculation({
  eventRewardBonus,
  selectedStudentUids,
  selectedStudentUidsByItem,
}: UseBonusCalculationParams): BonusCalculationResult {
  const bonusSummary = useMemo(
    () => calculateBonusSummary({ eventRewardBonus, selectedStudentUids, selectedStudentUidsByItem }),
    [eventRewardBonus, selectedStudentUids, selectedStudentUidsByItem],
  );

  const appliedBonusRatios = useMemo(() => {
    const ratios: Record<string, Decimal> = {};
    for (const bonus of bonusSummary) {
      ratios[bonus.uid] = bonus.appliedStrikerRatio.plus(bonus.appliedSpecialRatio);
    }
    return ratios;
  }, [bonusSummary]);

  return { appliedBonusRatios, bonusSummary };
}
