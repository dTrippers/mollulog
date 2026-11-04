import type { JankenConfig, JankenStage, RewardItem } from "~/domain/event-shop";
import { calculateCumulativeTierEleph } from "~/domain/growth-resource";
import type { JankenPlannerEntry } from "~/domain/planner-state";

export type JankenResourceTotals = Record<string, number>;
export type JankenResourceRoles = {
  entryUid: string | null;
  shopUid: string | null;
  studentUid: string | null;
  equipmentUid: string | null;
};
type AvailableJankenConfig = Extract<JankenConfig, { status: "available" }>;
export type JankenEvaluation = {
  status: "available" | "unavailable" | "invalid" | "score-input-required";
  stagePlays: Record<string, number>;
  entryCost: number;
  entryResourceUid: string | null;
  rewards: JankenResourceTotals;
  projectedScore: number;
  achievedGoals: number;
  totalGoals: number;
  planSteps: JankenPlanStep[];
};

export type JankenPlanStep = {
  kind: "prerequisite" | "equipment" | "score" | "remaining";
  stageUid: string;
  plays: number;
};

export type JankenPlanInput = {
  progress: JankenPlannerEntry["progress"];
  goals: JankenPlannerEntry["goals"];
  shopCurrencyRequired: number;
  studentGrowthTotalRequired: number;
  shopCurrencyResourceUid?: string;
  studentGrowthResourceUid?: string;
};

export function getJankenStudentGrowthUid(
  config: AvailableJankenConfig,
  studentUids: readonly string[],
): string | null {
  const rewardUids = new Set([
    ...config.stages.flatMap((stage) => stage.rewards.map(({ resourceUid }) => resourceUid)),
    ...config.scoreRewards.flatMap(({ rewards }) => rewards.map(({ resourceUid }) => resourceUid)),
  ]);
  const matches = [...new Set(studentUids)].filter((uid) => rewardUids.has(uid));
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

export function getJankenResourceRoles(
  config: AvailableJankenConfig,
  shopResourceUids: readonly string[],
  studentUid: string | null,
): JankenResourceRoles {
  const shopResourceUidSet = new Set(shopResourceUids);
  const rewardedUids = config.stages.flatMap((stage) => stage.rewards.map(({ resourceUid }) => resourceUid));
  return {
    entryUid: config.stages[0]?.entryCost.resourceUid ?? null,
    shopUid: rewardedUids.find((uid) => shopResourceUidSet.has(uid)) ?? null,
    studentUid,
    equipmentUid: config.equipmentUpgrade.costResource?.resourceUid ?? null,
  };
}

export function getJankenStudentGrowthRequired(
  currentTier: number,
  targetTier: number | null,
  heldEleph: number,
): number | null {
  if (
    !Number.isSafeInteger(currentTier) ||
    currentTier < 1 ||
    currentTier > 9 ||
    (targetTier !== null && (!Number.isSafeInteger(targetTier) || targetTier < 1 || targetTier > 9)) ||
    !Number.isSafeInteger(heldEleph) ||
    heldEleph < 0
  )
    return null;
  if (targetTier === null || targetTier <= currentTier) return 0;
  return Math.max(0, calculateCumulativeTierEleph(currentTier, targetTier) - heldEleph);
}

function add(target: JankenResourceTotals, uid: string, quantity: number): void {
  target[uid] = (target[uid] ?? 0) + quantity;
}

function expectedRewards(stage: JankenStage): JankenResourceTotals {
  const totals: JankenResourceTotals = {};
  for (const reward of stage.rewards) {
    if (reward.tag === "default") add(totals, reward.resourceUid, reward.quantity * reward.probability);
  }
  return totals;
}

function prerequisiteStages(
  config: Extract<JankenConfig, { status: "available" }>,
  stage: JankenStage,
): JankenStage[] | null {
  const byUid = new Map(config.stages.map((item) => [item.uid, item]));
  const chain: JankenStage[] = [];
  const seen = new Set<string>();
  let current: JankenStage | undefined = stage;
  while (current) {
    if (seen.has(current.uid)) return null;
    seen.add(current.uid);
    chain.push(current);
    current = current.previousStageUid ? byUid.get(current.previousStageUid) : undefined;
    if (chain.at(-1)?.previousStageUid && !current) return null;
  }
  return chain.reverse();
}

export function evaluateJankenPlan(
  config: JankenConfig,
  input: {
    stagePlays: Record<string, number>;
    clearedStageUids?: readonly string[];
    currentScore?: number;
    averageScore?: number | null;
    targetScore?: number | null;
  },
): JankenEvaluation {
  const empty: JankenEvaluation = {
    status: config.status,
    stagePlays: {},
    entryCost: 0,
    entryResourceUid: null,
    rewards: {},
    projectedScore: input.currentScore ?? 0,
    achievedGoals: 0,
    totalGoals: 0,
    planSteps: [],
  };
  if (config.status !== "available") return empty;
  const plays = Object.fromEntries(
    Object.entries(input.stagePlays).filter(([, n]) => Number.isSafeInteger(n) && n > 0),
  );
  if (
    Object.keys(plays).length !== Object.keys(input.stagePlays).length ||
    Object.keys(plays).some((uid) => !config.stages.some((stage) => stage.uid === uid))
  )
    return { ...empty, status: "invalid" };
  const stageByUid = new Map(config.stages.map((stage) => [stage.uid, stage]));
  const cleared = new Set(input.clearedStageUids ?? []);
  for (const uid of Object.keys(plays)) {
    const stage = stageByUid.get(uid);
    if (!stage) return { ...empty, status: "invalid" };
    const chain = prerequisiteStages(config, stage);
    if (!chain) return { ...empty, status: "invalid" };
    for (const prerequisite of chain) {
      if (!cleared.has(prerequisite.uid) && !plays[prerequisite.uid]) plays[prerequisite.uid] = 1;
    }
  }
  const firstClearUids = new Set<string>();
  let entryCost = 0;
  let entryResourceUid: string | null = null;
  const rewards: JankenResourceTotals = {};
  for (const [uid, count] of Object.entries(plays)) {
    const stage = stageByUid.get(uid);
    if (!stage) return { ...empty, status: "invalid" };
    entryResourceUid = entryResourceUid ?? stage.entryCost.resourceUid;
    if (entryResourceUid !== stage.entryCost.resourceUid) return { ...empty, status: "invalid" };
    entryCost += stage.entryCost.quantity * count;
    for (const [resourceUid, quantity] of Object.entries(expectedRewards(stage)))
      add(rewards, resourceUid, quantity * count);
    const chain = prerequisiteStages(config, stage);
    if (!chain) return { ...empty, status: "invalid" };
    for (const needed of chain) if (!cleared.has(needed.uid)) firstClearUids.add(needed.uid);
  }
  for (const uid of firstClearUids) {
    const stage = stageByUid.get(uid);
    for (const reward of stage?.rewards ?? [])
      if (reward.tag === "first_clear") add(rewards, reward.resourceUid, reward.quantity);
  }
  const currentScore = input.currentScore ?? 0;
  let projectedScore = currentScore;
  const challenge = config.stages.find(({ stageType }) => stageType === "challenge");
  const challengePlays = challenge ? (plays[challenge.uid] ?? 0) : 0;
  if (challengePlays && input.averageScore != null) projectedScore += challengePlays * input.averageScore;
  if (
    input.targetScore != null &&
    currentScore < input.targetScore &&
    (input.averageScore == null || input.averageScore <= 0)
  ) {
    return {
      ...empty,
      status: "score-input-required",
      stagePlays: plays,
      entryCost,
      entryResourceUid,
      rewards,
      projectedScore,
    };
  }
  for (const tier of config.scoreRewards) {
    if (tier.score > currentScore && tier.score <= projectedScore) {
      for (const reward of tier.rewards) add(rewards, reward.resourceUid, reward.quantity);
    }
  }
  const totalGoals = Number(input.targetScore != null) + Number(Object.keys(plays).length > 0);
  const achievedGoals =
    Number(input.targetScore == null || projectedScore >= input.targetScore) + Number(Object.keys(plays).length > 0);
  return {
    status: "available",
    stagePlays: plays,
    entryCost,
    entryResourceUid,
    rewards,
    projectedScore,
    achievedGoals,
    totalGoals,
    planSteps: [],
  };
}

export function planJanken(config: JankenConfig, input: JankenPlanInput): JankenEvaluation {
  if (config.status !== "available") return evaluateJankenPlan(config, { stagePlays: {} });
  const stagePlays: Record<string, number> = {};
  const challenge = config.stages.find(({ stageType }) => stageType === "challenge");
  const scoreNeeded =
    input.goals.targetScore == null ? 0 : Math.max(0, input.goals.targetScore - input.progress.cumulativeScore);
  let normalTargetUid: string | null = null;
  if (scoreNeeded > 0 && input.goals.averageScore != null && input.goals.averageScore > 0) {
    if (!challenge) return { ...evaluateJankenPlan(config, { stagePlays: {} }), status: "invalid" };
    const chain = prerequisiteStages(config, challenge);
    if (!chain) return { ...evaluateJankenPlan(config, { stagePlays: {} }), status: "invalid" };
    const cleared = new Set(input.progress.clearedStageUids);
    for (const prerequisite of chain.slice(0, -1)) if (!cleared.has(prerequisite.uid)) stagePlays[prerequisite.uid] = 1;
    stagePlays[challenge.uid] = Math.ceil(scoreNeeded / input.goals.averageScore);
  }
  const first = evaluateJankenPlan(config, {
    stagePlays,
    clearedStageUids: input.progress.clearedStageUids,
    currentScore: input.progress.cumulativeScore,
    averageScore: input.goals.averageScore,
    targetScore: input.goals.targetScore,
  });
  const normalStages = config.stages.filter(({ stageType }) => stageType === "normal");
  if (normalStages.length === 0) return { ...first, status: "invalid" };
  const required: Record<string, number> = {};
  if (input.shopCurrencyResourceUid)
    required[input.shopCurrencyResourceUid] =
      input.goals.shopCurrencyMode === "manual" ? input.goals.manualShopCurrency : input.shopCurrencyRequired;
  if (input.studentGrowthResourceUid) required[input.studentGrowthResourceUid] = input.studentGrowthTotalRequired;
  const equipmentGoal = input.goals.targetEquipmentTier;
  const costResourceUid = config.equipmentUpgrade.costResource?.resourceUid;
  if (equipmentGoal != null && !costResourceUid) return { ...first, status: "invalid" };
  if (equipmentGoal != null && costResourceUid) {
    const equipmentCost = config.equipmentUpgrade.tierCosts
      .filter(({ tier }) => tier > input.progress.equipmentTier && tier <= equipmentGoal)
      .reduce((sum, { quantity }) => sum + quantity, 0);
    required[costResourceUid] = Math.max(required[costResourceUid] ?? 0, equipmentCost);
  }
  for (const [uid, quantity] of Object.entries(required)) {
    required[uid] = Math.max(
      0,
      quantity -
        (input.studentGrowthResourceUid && uid === input.studentGrowthResourceUid
          ? input.progress.heldEleph
          : uid === costResourceUid
            ? input.progress.heldEquipmentCurrency
            : 0),
    );
  }
  const normalGoalRemains = Object.entries(required).some(([uid, quantity]) => quantity > (first.rewards[uid] ?? 0));
  let result = first;
  if (normalGoalRemains) {
    const candidate = normalStages
      .map((stage) => {
        const chain = prerequisiteStages(config, stage);
        if (!chain) return { stage, plays: {}, count: Infinity, cost: Infinity };
        const cleared = new Set(input.progress.clearedStageUids);
        const basePlays = { ...stagePlays };
        for (const step of chain) if (!cleared.has(step.uid) && !basePlays[step.uid]) basePlays[step.uid] = 1;
        if (!basePlays[stage.uid]) basePlays[stage.uid] = 1;
        const baseRewards = evaluateJankenPlan(config, {
          stagePlays: basePlays,
          clearedStageUids: input.progress.clearedStageUids,
          currentScore: input.progress.cumulativeScore,
          averageScore: input.goals.averageScore,
          targetScore: input.goals.targetScore,
        }).rewards;
        const yields = expectedRewards(stage);
        const additional = Math.max(
          0,
          ...Object.entries(required).map(([uid, quantity]) => {
            const remainder = Math.max(0, quantity - (baseRewards[uid] ?? 0));
            const yieldPerPlay = yields[uid] ?? 0;
            return yieldPerPlay > 0 ? Math.ceil(remainder / yieldPerPlay) : remainder > 0 ? Infinity : 0;
          }),
        );
        if (!Number.isFinite(additional)) return { stage, plays: basePlays, count: Infinity, cost: Infinity };
        const stageCount = (basePlays[stage.uid] ?? 0) + additional;
        const plays = { ...basePlays, [stage.uid]: stageCount };
        const byUid = new Map(config.stages.map((item) => [item.uid, item]));
        const totalCost = Object.entries(plays).reduce(
          (sum, [uid, count]) => sum + (byUid.get(uid)?.entryCost.quantity ?? Infinity) * count,
          0,
        );
        const fixedCost = Object.entries(stagePlays).reduce(
          (sum, [uid, count]) => sum + (byUid.get(uid)?.entryCost.quantity ?? Infinity) * count,
          0,
        );
        const cost = totalCost - fixedCost;
        return { stage, plays, count: stageCount, cost };
      })
      .filter(({ cost }) => Number.isFinite(cost))
      .sort((a, b) => a.cost - b.cost)[0];
    if (!candidate) return { ...first, status: "invalid" };
    normalTargetUid = candidate.stage.uid;
    for (const [uid, count] of Object.entries(candidate.plays)) stagePlays[uid] = count;
    result = evaluateJankenPlan(config, {
      stagePlays,
      clearedStageUids: input.progress.clearedStageUids,
      currentScore: input.progress.cumulativeScore,
      averageScore: input.goals.averageScore,
      targetScore: input.goals.targetScore,
    });
  }
  const cleared = new Set(input.progress.clearedStageUids);
  const planSteps: JankenPlanStep[] = [];
  const challengePrerequisites = new Set(
    challenge && stagePlays[challenge.uid]
      ? (prerequisiteStages(config, challenge)?.slice(0, -1) ?? []).map(({ uid }) => uid)
      : [],
  );
  for (const stage of config.stages) {
    if (
      (stage.stageType === "story" || stage.stageType === "normal") &&
      stagePlays[stage.uid] &&
      !cleared.has(stage.uid) &&
      (stage.uid !== normalTargetUid || challengePrerequisites.has(stage.uid))
    ) {
      planSteps.push({ kind: "prerequisite", stageUid: stage.uid, plays: 1 });
    }
  }

  let equipmentPlays = 0;
  const normalTarget = normalTargetUid ? config.stages.find(({ uid }) => uid === normalTargetUid) : null;
  const equipmentResourceUid = config.equipmentUpgrade.costResource?.resourceUid;
  const targetEquipmentTier = input.goals.targetEquipmentTier;
  if (normalTarget && targetEquipmentTier != null && equipmentResourceUid) {
    const equipmentRequired = config.equipmentUpgrade.tierCosts
      .filter(({ tier }) => tier > input.progress.equipmentTier && tier <= targetEquipmentTier)
      .reduce((sum, { quantity }) => sum + quantity, 0);
    const precedingClearPlays = Object.fromEntries(
      planSteps.filter(({ kind }) => kind === "prerequisite").map(({ stageUid, plays }) => [stageUid, plays]),
    );
    const precedingRewards = evaluateJankenPlan(config, {
      stagePlays: precedingClearPlays,
      clearedStageUids: input.progress.clearedStageUids,
      currentScore: input.progress.cumulativeScore,
      averageScore: input.goals.averageScore,
      targetScore: input.goals.targetScore,
    }).rewards;
    const targetFirstClear =
      cleared.has(normalTarget.uid) || precedingClearPlays[normalTarget.uid]
        ? 0
        : normalTarget.rewards
            .filter(({ tag, resourceUid }) => tag === "first_clear" && resourceUid === equipmentResourceUid)
            .reduce((sum, { quantity }) => sum + quantity, 0);
    const otherAvailable =
      input.progress.heldEquipmentCurrency + (precedingRewards[equipmentResourceUid] ?? 0) + targetFirstClear;
    const remainingEquipment = Math.max(0, equipmentRequired - otherAvailable);
    const equipmentYield = expectedRewards(normalTarget)[equipmentResourceUid] ?? 0;
    const targetPlays = stagePlays[normalTarget.uid] ?? 0;
    const availableTargetPlays = targetPlays - (precedingClearPlays[normalTarget.uid] ?? 0);
    const playsNeeded = Math.max(
      targetFirstClear > 0 ? 1 : 0,
      equipmentYield > 0
        ? Math.ceil(remainingEquipment / equipmentYield)
        : remainingEquipment > 0
          ? availableTargetPlays
          : 0,
    );
    equipmentPlays = Math.min(availableTargetPlays, playsNeeded);
  }
  if (normalTarget && equipmentPlays > 0)
    planSteps.push({ kind: "equipment", stageUid: normalTarget.uid, plays: equipmentPlays });
  if (challenge && stagePlays[challenge.uid])
    planSteps.push({ kind: "score", stageUid: challenge.uid, plays: stagePlays[challenge.uid] });
  if (normalTarget) {
    const remainingPlays =
      (stagePlays[normalTarget.uid] ?? 0) -
      equipmentPlays -
      (planSteps.find(({ kind, stageUid }) => kind === "prerequisite" && stageUid === normalTarget.uid)?.plays ?? 0);
    if (remainingPlays > 0) planSteps.push({ kind: "remaining", stageUid: normalTarget.uid, plays: remainingPlays });
  }
  return { ...result, planSteps };
}

export function jankenRewardItems(
  config: JankenConfig,
  stagePlays: Record<string, number>,
  clearedStageUids: readonly string[] = [],
): RewardItem[] {
  const result = evaluateJankenPlan(config, { stagePlays, clearedStageUids });
  if (config.status !== "available") return [];
  return Object.entries(result.rewards).flatMap(([resourceUid, quantity]) => {
    const reward =
      config.stages.flatMap((stage) => stage.rewards).find((item) => item.resourceUid === resourceUid) ??
      config.scoreRewards.flatMap((tier) => tier.rewards).find((item) => item.resourceUid === resourceUid);
    return reward
      ? [
          {
            resourceUid,
            resourceType: reward.resourceType,
            resourceName: reward.resourceName,
            imageUrl: reward.imageUrl,
            quantity,
          },
        ]
      : [];
  });
}
