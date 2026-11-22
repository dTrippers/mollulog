import { describe, expect, it } from "@jest/globals";
import { simulateCallChargeTenPull } from "~/domain/recruitment-call-charge-simulation";
import type { RecruitmentPoolSnapshot, SimulationStudent } from "~/domain/recruitment-simulator";

function student(uid: string, initialTier: SimulationStudent["initialTier"] = 3): SimulationStudent {
  return {
    uid,
    name: uid,
    initialTier,
    attackType: "explosive" as SimulationStudent["attackType"],
    defenseType: "heavy_armor" as SimulationStudent["defenseType"],
    role: "striker" as SimulationStudent["role"],
  };
}

const pickup = { ...student("pickup"), recruitmentType: "usual" as RecruitmentPoolSnapshot["recruitmentType"] };
const nonPickup = student("non-pickup");
const snapshot: RecruitmentPoolSnapshot = {
  recruitmentGroupUid: "group",
  recruitmentType: "usual" as RecruitmentPoolSnapshot["recruitmentType"],
  startAt: "2026-01-01T00:00:00.000Z",
  pickupStudents: [pickup],
  nonPickupStudentsByTier: { tier1: [], tier2: [], tier3: [nonPickup] },
};

function seededRandom(values: number[]) {
  let index = 0;
  return () => values[index++] ?? 0.999;
}

function seededValues(overrides: Record<number, number> = {}) {
  return Array.from({ length: 31 }, (_, index) => overrides[index] ?? 0.999);
}

describe("simulateCallChargeTenPull", () => {
  it("guarantees the 100th charged pull as pickup with 50% odds and retains charge on non-pickup", () => {
    const { results, charge } = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 90,
      random: seededRandom(seededValues()),
    });

    expect(results[9]).toMatchObject({ rarity: 3, pickup: false, student: nonPickup });
    expect(charge).toBe(100);

    const pickupAt100 = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 90,
      random: seededRandom(seededValues({ 27: 0.1 })),
    });
    expect(pickupAt100.results[9]).toMatchObject({ rarity: 3, pickup: true, student: pickup });
    expect(pickupAt100.charge).toBe(0);
  });

  it("guarantees the 200th charged pull as the active pickup", () => {
    const { results, charge } = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 190,
      random: seededRandom(seededValues()),
    });

    expect(results[9]).toMatchObject({ rarity: 3, pickup: true, student: pickup });
    expect(charge).toBe(0);
  });

  it("applies charge resets slot by slot and continues charging in the same ten-pull", () => {
    const { results, charge } = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 99,
      random: seededRandom(seededValues({ 0: 0.1 })),
    });

    expect(results[0]).toMatchObject({ rarity: 3, pickup: true, student: pickup });
    expect(charge).toBe(9);
  });

  it("draws the active pickup at charge 100 only below the 50% threshold", () => {
    const below = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 90,
      random: seededRandom(seededValues({ 27: 0.49 })),
    });
    expect(below.results[9]).toMatchObject({ rarity: 3, pickup: true, student: pickup });

    const atThreshold = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 90,
      random: seededRandom(seededValues({ 27: 0.5 })),
    });
    expect(atThreshold.results[9]).toMatchObject({ rarity: 3, pickup: false, student: nonPickup });
  });

  it("keeps the two-star-or-better guarantee on the tenth slot between charge guarantees", () => {
    const mixedSnapshot: RecruitmentPoolSnapshot = {
      ...snapshot,
      nonPickupStudentsByTier: {
        tier1: [student("one-star", 1)],
        tier2: [student("two-star", 2)],
        tier3: [nonPickup],
      },
    };
    const { results, charge } = simulateCallChargeTenPull({
      snapshot: mixedSnapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 0,
      random: () => 0.999,
    });

    expect(results.slice(0, 9).every((result) => result.rarity === 1)).toBe(true);
    expect(results[9]?.rarity).toBe(2);
    expect(charge).toBe(10);
  });

  it("marks the slots decided by a charge adjustment and the slots that reset the charge", () => {
    const missAt100 = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 90,
      random: seededRandom(seededValues()),
    });
    expect(missAt100.results[9]).toMatchObject({ adjustment: 100, resetCharge: false });
    expect(missAt100.results.slice(0, 9).every((result) => result.adjustment === null && !result.resetCharge)).toBe(
      true,
    );

    const hitAt200 = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 190,
      random: seededRandom(seededValues()),
    });
    expect(hitAt200.results[9]).toMatchObject({ adjustment: 200, resetCharge: true });

    const normalHit = simulateCallChargeTenPull({
      snapshot,
      activePickupStudentUid: pickup.uid,
      startingCharge: 0,
      random: seededRandom(seededValues({ 0: 0.001, 1: 0.001 })),
    });
    expect(normalHit.results[0]).toMatchObject({ pickup: true, adjustment: null, resetCharge: true });
  });

  it("applies the same adjustments to a two-star pickup", () => {
    const twoStarPickup = {
      ...student("two-star-pickup", 2),
      recruitmentType: "usual" as typeof pickup.recruitmentType,
    };
    const twoStarSnapshot: RecruitmentPoolSnapshot = {
      ...snapshot,
      pickupStudents: [twoStarPickup],
      nonPickupStudentsByTier: { tier1: [], tier2: [student("two-star", 2)], tier3: [nonPickup] },
    };

    const at100 = simulateCallChargeTenPull({
      snapshot: twoStarSnapshot,
      activePickupStudentUid: twoStarPickup.uid,
      startingCharge: 90,
      random: seededRandom(seededValues({ 27: 0.1 })),
    });
    expect(at100.results[9]).toMatchObject({ rarity: 2, pickup: true, student: twoStarPickup, adjustment: 100 });
    expect(at100.charge).toBe(0);

    const missAt100 = simulateCallChargeTenPull({
      snapshot: twoStarSnapshot,
      activePickupStudentUid: twoStarPickup.uid,
      startingCharge: 90,
      random: seededRandom(seededValues()),
    });
    expect(missAt100.results[9]).toMatchObject({ rarity: 3, pickup: false, student: nonPickup, adjustment: 100 });

    const at200 = simulateCallChargeTenPull({
      snapshot: twoStarSnapshot,
      activePickupStudentUid: twoStarPickup.uid,
      startingCharge: 190,
      random: seededRandom(seededValues()),
    });
    expect(at200.results[9]).toMatchObject({ rarity: 2, pickup: true, student: twoStarPickup, adjustment: 200 });
    expect(at200.charge).toBe(0);
  });
});
