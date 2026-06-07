import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { DEFAULT_KV_EXPIRATION_TTL, fetchCached } from "~/models/base";
import type { FarmingStage, FarmingStageReward } from "~/models/farming-recommendation";

const farmingStagesQuery = graphql(`
  query FarmingStages($category: String) {
    stages(category: $category) {
      uid name stageNumber area difficulty terrain
      entryCosts { amount resource { uid name type } }
      rewards {
        rewardType rewardTag probability
        resource { __typename uid name type rarity ... on Equipment { category } }
      }
    }
  }
`);

export async function getCampaignFarmingStages(env: Env, forceRefresh = false): Promise<FarmingStage[]> {
  return fetchCached(
    env,
    "farming-stages::campaign::v1",
    async () => {
      const { data, error } = await runQuery(farmingStagesQuery, { category: "campaign" });
      if (error) {
        throw error;
      }

      return (data?.stages ?? []).map((stage) => ({
        uid: stage.uid,
        name: normalizeName(stage.name),
        stageNumber: String(stage.stageNumber),
        area: String(stage.area),
        difficulty: stage.difficulty ?? -1,
        apCost: calculateApCost(stage.entryCosts),
        rewards: stage.rewards.flatMap(toFarmingStageReward),
      }));
    },
    DEFAULT_KV_EXPIRATION_TTL,
    forceRefresh,
  );
}

function calculateApCost(entryCosts: Array<{ amount: number; resource: { type: string } }>): number {
  return entryCosts
    .filter((entryCost) => entryCost.resource.type === "currency")
    .reduce((sum, entryCost) => sum + entryCost.amount, 0);
}

function toFarmingStageReward(reward: {
  rewardType: string;
  rewardTag?: string | null;
  probability?: number | string | null;
  resource: { uid: string; name: string | null } | null;
}): FarmingStageReward[] {
  if (!reward.resource) {
    return [];
  }

  return [
    {
      uid: reward.resource.uid,
      name: normalizeName(reward.resource.name),
      rewardType: reward.rewardType,
      rewardTag: reward.rewardTag,
      probability: parseProbability(reward.probability),
    },
  ];
}

function parseProbability(probability: number | string | null | undefined): number | null {
  if (probability == null) {
    return null;
  }

  const parsed = Number(probability);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeName(name: string | null): string {
  return (name ?? "").replaceAll("\n", " ").trim();
}
