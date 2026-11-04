import { describe, expect, it } from "@jest/globals";
import { calculateResourceLedger } from "~/domain/event-shop/calculations/ledger";
import {
  evaluateJankenPlan,
  getJankenResourceRoles,
  getJankenStudentGrowthRequired,
  getJankenStudentGrowthUid,
  planJanken,
} from "~/domain/event-shop/janken";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { janken860Fixture } from "./fixtures/janken-860";

const clearedThroughNormal3 = [
  "100860101",
  "100860102",
  "100860103",
  "100860104",
  "100860105",
  "100860201",
  "100860202",
  "100860203",
];
const progress = {
  currentTier: 3,
  heldEleph: 45,
  cumulativeScore: 100_000,
  equipmentTier: 2,
  heldEquipmentCurrency: 40,
  clearedStageUids: clearedThroughNormal3,
};
const goals = {
  targetTier: null,
  shopCurrencyMode: "linked" as const,
  manualShopCurrency: 0,
  targetScore: null,
  averageScore: null,
  targetEquipmentTier: null,
};

describe("event 860 janken planning", () => {
  it("uses expected default rewards and adds an uncleared stage first-clear once", () => {
    const result = evaluateJankenPlan(janken860Fixture, {
      stagePlays: { "100860204": 2 },
      clearedStageUids: clearedThroughNormal3,
    });

    expect(result.entryCost).toBe(800);
    expect(result.rewards["80863"]).toBe(6);
    expect(result.rewards["26016"]).toBeCloseTo(4.6);
    expect(result.rewards["80864"]).toBe(100);
    expect(result.rewards["3"]).toBeUndefined();
  });

  it("adds the full uncleared prerequisite chain once", () => {
    const result = evaluateJankenPlan(janken860Fixture, { stagePlays: { "100860204": 1 } });

    expect(result.entryCost).toBe(1_950);
    expect(result.rewards["26016"]).toBeCloseTo(17.6);
    expect(result.rewards["80863"]).toBeCloseTo(19.2);
  });

  it("adds each missing prerequisite once for direct N4 play counts", () => {
    const result = evaluateJankenPlan(janken860Fixture, { stagePlays: { "100860204": 10 } });

    expect(result.stagePlays).toEqual({
      "100860204": 10,
      "100860101": 1,
      "100860102": 1,
      "100860103": 1,
      "100860104": 1,
      "100860105": 1,
      "100860201": 1,
      "100860202": 1,
      "100860203": 1,
    });
    expect(result.entryCost).toBe(5_550);
  });

  it("does not add already-cleared prerequisites for direct N4 play counts", () => {
    const result = evaluateJankenPlan(janken860Fixture, {
      stagePlays: { "100860204": 10 },
      clearedStageUids: clearedThroughNormal3,
    });

    expect(result.stagePlays).toEqual({ "100860204": 10 });
    expect(result.entryCost).toBe(4_000);
  });

  it("does not re-award cleared first clears or three-star rewards", () => {
    const result = evaluateJankenPlan(janken860Fixture, {
      stagePlays: { "100860201": 1 },
      clearedStageUids: [...clearedThroughNormal3, "100860204", "100860301"],
    });

    expect(result.rewards["26016"]).toBe(1);
    expect(result.rewards["80863"]).toBeCloseTo(1.1);
    expect(result.rewards["80864"]).toBe(30);
    expect(result.rewards["3"]).toBeUndefined();
  });

  it("awards score tiers only when a challenge crosses their score boundary", () => {
    const before = evaluateJankenPlan(janken860Fixture, {
      stagePlays: { "100860301": 1 },
      clearedStageUids: [...clearedThroughNormal3, "100860204", "100860301"],
      currentScore: 499_999,
      averageScore: 1,
      targetScore: 500_000,
    });
    const atCurrent = evaluateJankenPlan(janken860Fixture, {
      stagePlays: { "100860301": 1 },
      clearedStageUids: [...clearedThroughNormal3, "100860204", "100860301"],
      currentScore: 500_000,
      averageScore: 1,
      targetScore: 500_001,
    });
    const after = evaluateJankenPlan(janken860Fixture, {
      stagePlays: { "100860301": 1 },
      clearedStageUids: [...clearedThroughNormal3, "100860204", "100860301"],
      currentScore: 499_999,
      averageScore: 2,
      targetScore: 500_001,
    });

    expect(before.rewards["26016"]).toBeCloseTo(11.3);
    expect(atCurrent.rewards["26016"]).toBeCloseTo(1.3);
    expect(after.rewards["26016"]).toBeCloseTo(11.3);
  });

  it("rounds challenge plays up and reports when the average score is missing", () => {
    const result = planJanken(janken860Fixture, {
      progress: { ...progress, cumulativeScore: 1_000_000, clearedStageUids: [...clearedThroughNormal3, "100860204"] },
      goals: { ...goals, targetScore: 1_350_000, averageScore: 200_000 },
      shopCurrencyRequired: 0,
      studentGrowthTotalRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });
    const missing = planJanken(janken860Fixture, {
      progress,
      goals: { ...goals, targetScore: 400_000 },
      shopCurrencyRequired: 0,
      studentGrowthTotalRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });

    expect(result.stagePlays["100860301"]).toBe(2);
    expect(result.planSteps.at(-1)).toMatchObject({ kind: "score", stageUid: "100860301", plays: 2 });
    expect(missing.status).toBe("score-input-required");
  });

  it("chooses normal 4 for combined goals and rejects candidates with zero expected yield", () => {
    const result = planJanken(janken860Fixture, {
      progress,
      goals: { ...goals, targetEquipmentTier: 3 },
      shopCurrencyRequired: 50,
      studentGrowthTotalRequired: 10,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });
    const noEquipmentYield = {
      ...janken860Fixture,
      stages: janken860Fixture.stages.map((stage) =>
        stage.stageType === "normal"
          ? { ...stage, rewards: stage.rewards.filter(({ resourceUid }) => resourceUid !== "80864") }
          : stage,
      ),
    };
    const impossible = planJanken(noEquipmentYield, {
      progress,
      goals: { ...goals, targetEquipmentTier: 3 },
      shopCurrencyRequired: 0,
      studentGrowthTotalRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });

    expect(result.stagePlays["100860204"]).toBeGreaterThan(0);
    expect(result.stagePlays["100860201"]).toBeUndefined();
    expect(result.planSteps.some(({ kind }) => kind === "equipment")).toBe(true);
    expect(impossible.status).toBe("invalid");
  });

  it("calculates batch equipment and student growth requirements", () => {
    const result = planJanken(janken860Fixture, {
      progress,
      goals: { ...goals, targetEquipmentTier: 5 },
      shopCurrencyRequired: 0,
      studentGrowthTotalRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });

    expect(result.rewards["80864"]).toBeGreaterThanOrEqual(560);
    expect(progress.heldEquipmentCurrency + result.rewards["80864"]).toBeGreaterThanOrEqual(600);
    expect(getJankenStudentGrowthRequired(3, 4, 45)).toBeGreaterThan(0);
    expect(getJankenStudentGrowthRequired(10, 4, 0)).toBeNull();
  });

  it("subtracts held student growth once and reaches the cumulative tier need", () => {
    const totalRequired = 220;
    const planned = planJanken(janken860Fixture, {
      progress: { ...progress, clearedStageUids: clearedThroughNormal3 },
      goals: { ...goals, targetTier: 6 },
      shopCurrencyRequired: 0,
      studentGrowthTotalRequired: totalRequired,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });
    const expectedStudentGrowth = planned.rewards["26016"] ?? 0;

    expect(totalRequired - progress.heldEleph).toBe(175);
    expect(getJankenStudentGrowthRequired(3, 6, 45)).toBe(175);
    expect(expectedStudentGrowth).toBeGreaterThanOrEqual(175);
    expect(progress.heldEleph + expectedStudentGrowth).toBeGreaterThanOrEqual(totalRequired);
  });

  it("derives generic resource roles from the janken config", () => {
    expect(getJankenStudentGrowthUid(janken860Fixture, ["26016", "student-unrelated"])).toBe("26016");
    expect(getJankenResourceRoles(janken860Fixture, ["80863"], "26016")).toEqual({
      entryUid: "80860",
      shopUid: "80863",
      studentUid: "26016",
      equipmentUid: "80864",
    });
  });

  it("keeps planner and evaluator costs and rewards identical", () => {
    const input = {
      progress,
      goals: { ...goals, shopCurrencyMode: "manual" as const, manualShopCurrency: 20 },
      shopCurrencyRequired: 0,
      studentGrowthTotalRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    };
    const planned = planJanken(janken860Fixture, input);
    const evaluated = evaluateJankenPlan(janken860Fixture, {
      stagePlays: planned.stagePlays,
      clearedStageUids: progress.clearedStageUids,
      currentScore: progress.cumulativeScore,
      averageScore: goals.averageScore,
      targetScore: goals.targetScore,
    });

    expect({ entryCost: planned.entryCost, rewards: planned.rewards }).toEqual({
      entryCost: evaluated.entryCost,
      rewards: evaluated.rewards,
    });
    expect(evaluated.stagePlays).toEqual(planned.stagePlays);
    expect(planned.stagePlays["100860201"]).toBeUndefined();
  });

  it("round-trips an unapplied score plan with its full uncleared prerequisite chain", () => {
    const plan = planJanken(janken860Fixture, {
      progress: { ...progress, clearedStageUids: [] },
      goals: { ...goals, targetScore: 500_000, averageScore: 200_000 },
      shopCurrencyRequired: 0,
      studentGrowthTotalRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });
    const evaluated = evaluateJankenPlan(janken860Fixture, {
      stagePlays: plan.stagePlays,
      clearedStageUids: [],
      currentScore: progress.cumulativeScore,
      averageScore: 200_000,
      targetScore: 500_000,
    });

    for (const uid of [
      "100860101",
      "100860102",
      "100860103",
      "100860104",
      "100860105",
      "100860201",
      "100860202",
      "100860203",
      "100860204",
    ])
      expect(plan.stagePlays[uid]).toBeGreaterThanOrEqual(1);
    expect({ stagePlays: evaluated.stagePlays, entryCost: evaluated.entryCost, rewards: evaluated.rewards }).toEqual({
      stagePlays: plan.stagePlays,
      entryCost: plan.entryCost,
      rewards: plan.rewards,
    });
  });

  it("lists the selected uncleared normal stage before a dependent challenge", () => {
    const plan = planJanken(janken860Fixture, {
      progress: { ...progress, clearedStageUids: [], cumulativeScore: 0 },
      goals: { ...goals, targetScore: 100_000, averageScore: 100_000 },
      shopCurrencyRequired: 100,
      studentGrowthTotalRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });
    const normalClearIndex = plan.planSteps.findIndex(
      ({ kind, stageUid }) => kind === "prerequisite" && stageUid === "100860204",
    );
    const challengeIndex = plan.planSteps.findIndex(({ kind }) => kind === "score");

    expect(normalClearIndex).toBeGreaterThanOrEqual(0);
    expect(normalClearIndex).toBeLessThan(challengeIndex);
  });

  it("funds equipment only from clear rows that precede the equipment step", () => {
    const plan = planJanken(janken860Fixture, {
      progress: { ...progress, clearedStageUids: [], cumulativeScore: 0 },
      goals: { ...goals, targetScore: 100_000, averageScore: 100_000, targetEquipmentTier: 5 },
      shopCurrencyRequired: 100,
      studentGrowthTotalRequired: 0,
      shopCurrencyResourceUid: "80863",
      studentGrowthResourceUid: "26016",
    });
    const equipmentIndex = plan.planSteps.findIndex(({ kind }) => kind === "equipment");
    const precedingPlays = Object.fromEntries(
      plan.planSteps.slice(0, equipmentIndex).map(({ stageUid, plays }) => [stageUid, plays]),
    );
    const precedingRewards = evaluateJankenPlan(janken860Fixture, {
      stagePlays: precedingPlays,
      clearedStageUids: [],
    }).rewards;
    const equipmentStep = plan.planSteps[equipmentIndex];
    const normal4Yield = janken860Fixture.stages
      .find(({ uid }) => uid === "100860204")
      ?.rewards.filter(({ tag, resourceUid }) => tag === "default" && resourceUid === "80864")
      .reduce((sum, { quantity, probability }) => sum + quantity * probability, 0);

    expect(equipmentIndex).toBeGreaterThanOrEqual(0);
    expect(precedingPlays["100860204"]).toBe(1);
    expect(equipmentStep).toMatchObject({ kind: "equipment", stageUid: "100860204" });
    expect(normal4Yield).toBeGreaterThan(0);
    expect(equipmentStep?.plays).toBe(
      Math.ceil(
        Math.max(0, 600 - progress.heldEquipmentCurrency - (precedingRewards["80864"] ?? 0)) / (normal4Yield ?? 1),
      ),
    );

    const evaluated = evaluateJankenPlan(janken860Fixture, {
      stagePlays: plan.stagePlays,
      clearedStageUids: [],
      currentScore: 0,
      averageScore: 100_000,
      targetScore: 100_000,
    });
    expect({ stagePlays: evaluated.stagePlays, entryCost: evaluated.entryCost, rewards: evaluated.rewards }).toEqual({
      stagePlays: plan.stagePlays,
      entryCost: plan.entryCost,
      rewards: plan.rewards,
    });
  });

  it("uses stage-specific costs and expected rewards in the shop ledger", () => {
    const config = {
      minigameType: "janken" as const,
      payment: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: 400 },
      payments: [],
      rewardGroups: [],
      janken: janken860Fixture,
    };
    const ledger = calculateResourceLedger({
      shopResources: [],
      itemQuantities: {},
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages: [],
      includeFirstClear: false,
      minigamePlayCount: 0,
      jankenStagePlays: { "100860204": 2 },
      minigameConfig: config,
    });

    expect(ledger.requiredForMinigame).toEqual({ "80860": 2_350 });
    expect(ledger.fromMinigame["80864"]).toBe(208);
    expect(ledger.fromMinigame["80863"]).toBeCloseTo(21.2);

    const clearedLedger = calculateResourceLedger({
      shopResources: [],
      itemQuantities: {},
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages: [],
      includeFirstClear: false,
      minigamePlayCount: 0,
      jankenStagePlays: { "100860204": 2 },
      jankenClearedStageUids: clearedThroughNormal3,
      minigameConfig: config,
    });
    expect(clearedLedger.requiredForMinigame).toEqual({ "80860": 800 });
    expect(clearedLedger.fromMinigame["80863"]).toBe(6);
  });
});
