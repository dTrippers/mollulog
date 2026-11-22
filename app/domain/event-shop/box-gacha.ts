import type { BoxGachaData, BoxGachaRound, MinigamePayment, RewardItem } from "~/domain/event-shop";

export type BoxGachaBoxReward = RewardItem & { isPrize: boolean };

// The box shared by one or more rounds. `rounds` lists the configured rounds it covers; `repeatsFrom` is set on the
// loop round's box, which every later round repeats.
export type BoxGachaBox = {
  rounds: number[];
  repeatsFrom: number | null;
  drawCost: MinigamePayment;
  drawCount: number;
  // One box's rewards summed per resource. A prize reward stays apart from the same resource in other groups.
  rewards: BoxGachaBoxReward[];
};

type AvailableBoxGacha = Extract<BoxGachaData, { status: "available" }>;

function rewardKey(reward: Pick<RewardItem, "resourceType" | "resourceUid">): string {
  return `${reward.resourceType}:${reward.resourceUid}`;
}

function boxRewards(round: BoxGachaRound): BoxGachaBoxReward[] {
  const rewards = new Map<string, BoxGachaBoxReward>();
  const items = [...round.items].sort((left, right) => left.displayOrder - right.displayOrder);
  for (const item of items) {
    for (const reward of item.rewards) {
      const key = `${rewardKey(reward)}:${item.isPrize ? "prize" : "regular"}`;
      const quantity = reward.quantity * item.count;
      const current = rewards.get(key);
      if (current) {
        current.quantity += quantity;
      } else {
        rewards.set(key, { ...reward, quantity, isPrize: item.isPrize });
      }
    }
  }
  return [...rewards.values()];
}

// Rounds with the same box compare equal: the same draw cost, draw count, and slot groups.
function roundSignature(round: BoxGachaRound): string {
  const items = [...round.items]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((item) => ({
      count: item.count,
      isPrize: item.isPrize,
      rewards: item.rewards.map((reward) => [rewardKey(reward), reward.quantity]),
    }));
  return JSON.stringify({
    drawCost: [rewardKey(round.drawCost), round.drawCost.quantity],
    drawCount: round.drawCount,
    items,
  });
}

// Groups the configured rounds into distinct boxes, in round order. The loop round always gets its own box, since
// every round after it repeats that box.
export function groupBoxGachaBoxes(boxGacha: AvailableBoxGacha): BoxGachaBox[] {
  const boxes: (BoxGachaBox & { signature: string | null })[] = [];
  const rounds = [...boxGacha.rounds].sort((left, right) => left.round - right.round);
  for (const round of rounds) {
    const isLoop = round.round === boxGacha.loopRound;
    const signature = isLoop ? null : roundSignature(round);
    const existing = signature === null ? undefined : boxes.find((box) => box.signature === signature);
    if (existing) {
      existing.rounds.push(round.round);
      continue;
    }
    boxes.push({
      signature,
      rounds: [round.round],
      repeatsFrom: isLoop ? round.round : null,
      drawCost: round.drawCost,
      drawCount: round.drawCount,
      rewards: boxRewards(round),
    });
  }
  return boxes.map(({ signature: _signature, ...box }) => box);
}
