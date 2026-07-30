import { describe, expect, it } from "@jest/globals";
import { calculateBonusSummary } from "../../../../../../../app/components/features/events/shop/hooks/useBonusCalculation";
import type { EventRewardBonus } from "../../../../../../../app/domain/event-shop";

const eventRewardBonus: EventRewardBonus[] = [
  {
    uid: "item-a",
    name: "재화 A",
    rewardBonuses: [
      { student: { uid: "student-1", name: "학생 1", role: "striker" }, ratio: "0.5" },
      { student: { uid: "student-2", name: "학생 2", role: "striker" }, ratio: "0.2" },
    ],
  },
  {
    uid: "item-b",
    name: "재화 B",
    rewardBonuses: [
      { student: { uid: "student-1", name: "학생 1", role: "striker" }, ratio: "0.1" },
      { student: { uid: "student-2", name: "학생 2", role: "striker" }, ratio: "0.4" },
    ],
  },
];

describe("calculateBonusSummary", () => {
  it("uses the shared selection by default", () => {
    const result = calculateBonusSummary({
      eventRewardBonus,
      selectedStudentUids: ["student-1"],
    });

    expect(result.map(({ uid, appliedStrikerRatio }) => [uid, appliedStrikerRatio.toString()])).toEqual([
      ["item-a", "0.5"],
      ["item-b", "0.1"],
    ]);
  });

  it("uses an independent student selection for each item", () => {
    const result = calculateBonusSummary({
      eventRewardBonus,
      selectedStudentUids: ["student-1"],
      selectedStudentUidsByItem: {
        "item-a": ["student-1"],
        "item-b": ["student-2"],
      },
    });

    expect(result.map(({ uid, appliedStrikerRatio }) => [uid, appliedStrikerRatio.toString()])).toEqual([
      ["item-a", "0.5"],
      ["item-b", "0.4"],
    ]);
  });

  it("falls back to the shared selection when an item has no separate selection", () => {
    const result = calculateBonusSummary({
      eventRewardBonus,
      selectedStudentUids: ["student-1"],
      selectedStudentUidsByItem: {
        "item-a": ["student-2"],
      },
    });

    expect(result.map(({ uid, appliedStrikerRatio }) => [uid, appliedStrikerRatio.toString()])).toEqual([
      ["item-a", "0.2"],
      ["item-b", "0.1"],
    ]);
  });
});
