import {
  CARD_FLIP_STRATEGIES,
  type CardFlipData,
  type CardFlipStrategy,
  type MinigameConfig,
  type MinigamePayment,
  type RewardItem,
} from "~/domain/event-shop";

export const CARD_FLIP_EFFICIENCY_CARD_COUNT = 100;

const CARD_FLIP_STEADY_STATE_SAMPLE_COUNT = 1_000_000;

export type CardFlipStrategyReward = RewardItem & { per100Cards: number };

export type CardFlipStrategyResult = {
  strategy: CardFlipStrategy;
  cardCount: number;
  costs: MinigamePayment[];
  rewards: CardFlipStrategyReward[];
};

type Matrix = number[][];
type TransitionPower = { transition: Matrix; metrics: Matrix };
type Outcome = { costs: MinigamePayment[]; rewards: RewardItem[] };

type StrategyModel = {
  transition: Matrix;
  metrics: Matrix;
  initialDistribution: number[];
  costResources: MinigamePayment[];
  rewardItems: RewardItem[];
};

function isShuffle(strategy: CardFlipStrategy, drawIndex: number, rarity: number, maxDrawCount: number): boolean {
  if (strategy === "one-open") return true;
  if (strategy === "sr-reset") return rarity >= 3 || drawIndex === maxDrawCount;
  return drawIndex === maxDrawCount;
}

function validateCardFlip(cardFlip: Extract<CardFlipData, { status: "available" }>): void {
  const { slotCount, flipCosts, drawRules, cards } = cardFlip;
  if (!Number.isSafeInteger(slotCount) || slotCount <= 0) throw new Error("Invalid card flip slot count");
  if (
    !Number.isSafeInteger(drawRules.initialGroup) ||
    drawRules.initialGroup < 1 ||
    drawRules.initialGroup > slotCount ||
    !Number.isSafeInteger(drawRules.maxDrawCount) ||
    drawRules.maxDrawCount < 1
  ) {
    throw new Error("Invalid card flip draw rules");
  }
  if (flipCosts.length !== drawRules.maxDrawCount) throw new Error("Card flip costs do not cover every draw");
  if (flipCosts.some(({ flip }, index) => flip !== index + 1)) throw new Error("Card flip costs are not sequential");
  if (flipCosts.some(({ payments }) => payments.length !== 1)) throw new Error("Card flips must have one payment");
  const firstPayment = flipCosts[0]?.payments[0];
  if (
    !firstPayment ||
    flipCosts.some(
      ({ payments }) =>
        payments[0].resourceType !== firstPayment.resourceType || payments[0].resourceUid !== firstPayment.resourceUid,
    )
  ) {
    throw new Error("Card flip payment resources must match");
  }
  if (!Array.isArray(cards) || cards.length === 0) throw new Error("Card flip has no cards");
  if (
    cards.some(
      (card) =>
        card.rarity === null ||
        !Number.isSafeInteger(card.rarity) ||
        card.slots.some(
          ({ slot, weight }) =>
            !Number.isSafeInteger(slot) || slot < 1 || slot > slotCount || !Number.isFinite(weight) || weight < 0,
        ),
    )
  ) {
    throw new Error("Invalid card flip card data");
  }
}

function resourceKey(item: Pick<RewardItem, "resourceType" | "resourceUid" | "rarity">): string {
  return `${item.resourceType}:${item.resourceUid}:${item.rarity ?? ""}`;
}

function buildStrategyModel(
  cardFlip: Extract<CardFlipData, { status: "available" }>,
  strategy: CardFlipStrategy,
): StrategyModel {
  validateCardFlip(cardFlip);
  const { flipCosts, drawRules, cards } = cardFlip;
  const rewardByKey = new Map<string, RewardItem>();
  for (const card of cards) {
    for (const reward of card.rewards) {
      const key = resourceKey(reward);
      if (!rewardByKey.has(key)) rewardByKey.set(key, { ...reward, quantity: 0 });
    }
  }
  const rewardItems = [...rewardByKey.values()];
  const costResources: MinigamePayment[] = [];
  const costIndexByKey = new Map<string, number>();
  for (const { payments } of flipCosts) {
    const payment = payments[0];
    const key = `${payment.resourceType}:${payment.resourceUid}`;
    if (!costIndexByKey.has(key)) {
      costIndexByKey.set(key, costResources.length);
      costResources.push({ ...payment, quantity: 0 });
    }
  }

  const metricCount = costResources.length + rewardItems.length;
  const states: { drawIndex: number; group: number }[] = [];
  const stateIndex = new Map<string, number>();
  const addState = (drawIndex: number, group: number): number => {
    const key = `${drawIndex}:${group}`;
    const existing = stateIndex.get(key);
    if (existing !== undefined) return existing;
    const index = states.length;
    states.push({ drawIndex, group });
    stateIndex.set(key, index);
    return index;
  };
  const initialState = addState(0, drawRules.initialGroup);
  const transitionRows: number[][] = [];
  const metricRows: number[][] = [];

  // The state graph is finite: every strategy shuffles no later than maxDrawCount.
  // Discover only states reachable from the initial draw state.
  for (let cursor = 0; cursor < states.length; cursor += 1) {
    const { drawIndex, group } = states[cursor];
    const drawNumber = drawIndex + 1;
    const flipCost = flipCosts[drawIndex];
    const payment = flipCost.payments[0];
    const costKey = `${payment.resourceType}:${payment.resourceUid}`;
    const row = Array.from({ length: states.length }, () => 0);
    const metrics = Array.from({ length: metricCount }, () => 0);
    const weights = cards.map((card) => card.slots.find((slot) => slot.slot === group)?.weight ?? 0);
    const weightTotal = weights.reduce((total, weight) => total + weight, 0);
    if (!(weightTotal > 0)) throw new Error(`No card flip weight for reachable group ${group}`);

    metrics[costIndexByKey.get(costKey) as number] += payment.quantity;
    for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
      const card = cards[cardIndex];
      const weight = weights[cardIndex];
      if (weight <= 0) continue;
      const probability = weight / weightTotal;
      const shouldShuffle = isShuffle(strategy, drawNumber, card.rarity as number, drawRules.maxDrawCount);
      const nextDrawIndex = shouldShuffle ? 0 : drawNumber;
      const nextGroup = shouldShuffle
        ? drawRules.initialGroup
        : (drawRules.advanceOnRarities.includes(card.rarity as number) ? group + 1 : group);
      const nextState = addState(nextDrawIndex, nextGroup);
      while (row.length < states.length) row.push(0);
      row[nextState] += probability;

      for (const reward of card.rewards) {
        const rewardIndex = rewardItems.findIndex((item) => resourceKey(item) === resourceKey(reward));
        if (rewardIndex >= 0) metrics[costResources.length + rewardIndex] += probability * reward.quantity;
      }
    }
    transitionRows[cursor] = row;
    metricRows[cursor] = metrics;
  }

  // State discovery may grow rows after they have been created; normalize each row.
  const stateCount = states.length;
  const transition = Array.from({ length: stateCount }, (_, index) => {
    const row = transitionRows[index] ?? Array.from({ length: stateCount }, () => 0);
    while (row.length < stateCount) row.push(0);
    return row;
  });
  const metrics = Array.from({ length: stateCount }, (_, index) =>
    metricRows[index] ?? Array.from({ length: metricCount }, () => 0),
  );
  const initialDistribution = Array.from({ length: stateCount }, (_, index) => (index === initialState ? 1 : 0));

  return { transition, metrics, initialDistribution, costResources, rewardItems };
}

function multiplyMatrices(left: Matrix, right: Matrix): Matrix {
  const size = left.length;
  const result = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
  for (let row = 0; row < size; row += 1) {
    for (let middle = 0; middle < size; middle += 1) {
      const leftValue = left[row][middle];
      if (leftValue === 0) continue;
      for (let column = 0; column < size; column += 1) {
        const rightValue = right[middle][column];
        if (rightValue !== 0) result[row][column] += leftValue * rightValue;
      }
    }
  }
  return result;
}

function squarePower(power: TransitionPower): TransitionPower {
  const transition = multiplyMatrices(power.transition, power.transition);
  const metrics = power.metrics.map((row, state) => {
    const accumulated = [...row];
    for (let nextState = 0; nextState < power.transition.length; nextState += 1) {
      const probability = power.transition[state][nextState];
      if (probability === 0) continue;
      for (let metric = 0; metric < accumulated.length; metric += 1) {
        accumulated[metric] += probability * power.metrics[nextState][metric];
      }
    }
    return accumulated;
  });
  return { transition, metrics };
}

function calculateOutcome(
  cardFlip: Extract<CardFlipData, { status: "available" }>,
  cardCount: number,
  strategy: CardFlipStrategy,
): Outcome {
  if (!Number.isSafeInteger(cardCount) || cardCount < 0) throw new RangeError("Card count must be a nonnegative integer");
  const model = buildStrategyModel(cardFlip, strategy);
  let distribution = model.initialDistribution;
  const totals = Array.from({ length: model.metrics[0]?.length ?? 0 }, () => 0);
  let remaining = cardCount;
  let power: TransitionPower = { transition: model.transition, metrics: model.metrics };

  while (remaining > 0) {
    if (remaining % 2 === 1) {
      for (let state = 0; state < distribution.length; state += 1) {
        const probability = distribution[state];
        if (probability === 0) continue;
        for (let metric = 0; metric < totals.length; metric += 1) {
          totals[metric] += probability * power.metrics[state][metric];
        }
      }
      distribution = distribution.map((_, targetState) =>
        distribution.reduce((total, probability, state) => total + probability * power.transition[state][targetState], 0),
      );
    }
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) power = squarePower(power);
  }

  return {
    costs: model.costResources.map((payment, index) => ({ ...payment, quantity: totals[index] })),
    rewards: model.rewardItems.map((reward, index) => ({
      ...reward,
      quantity: totals[model.costResources.length + index] ?? 0,
    })),
  };
}

export function calculateCardFlipStrategy(
  cardFlip: Extract<CardFlipData, { status: "available" }>,
  cardCount: number,
  strategy: CardFlipStrategy,
): CardFlipStrategyResult {
  const result = calculateOutcome(cardFlip, cardCount, strategy);
  // A short run starts at the initial draw state and retains a transient bias for
  // strategies whose shuffle point is probabilistic (notably sr-reset). Use a
  // long-run expectation so the displayed rate is independent of that startup.
  const steadyStateSample = calculateOutcome(cardFlip, CARD_FLIP_STEADY_STATE_SAMPLE_COUNT, strategy);
  const per100ByKey = new Map(
    steadyStateSample.rewards.map((reward) => [
      resourceKey(reward),
      (reward.quantity * CARD_FLIP_EFFICIENCY_CARD_COUNT) / CARD_FLIP_STEADY_STATE_SAMPLE_COUNT,
    ]),
  );
  return {
    strategy,
    cardCount,
    costs: result.costs,
    rewards: result.rewards.map((reward) => ({ ...reward, per100Cards: per100ByKey.get(resourceKey(reward)) ?? 0 })),
  };
}

export function calculateCardFlipStrategyComparison(
  cardFlip: Extract<CardFlipData, { status: "available" }>,
  cardCount: number,
): CardFlipStrategyResult[] {
  return CARD_FLIP_STRATEGIES.map((strategy) => calculateCardFlipStrategy(cardFlip, cardCount, strategy));
}

export function resolveCardFlipMinigameInputs(
  config: MinigameConfig,
  cardCount: number,
  strategy: CardFlipStrategy,
): { costs: MinigamePayment[]; rewards: RewardItem[] } | null {
  if (config.minigameType !== "card_flip" || config.cardFlip?.status !== "available") return null;
  const { costs, rewards } = calculateOutcome(config.cardFlip, cardCount, strategy);
  return { costs, rewards };
}
