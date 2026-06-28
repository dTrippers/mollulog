import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { cacheKey, cacheQuery, fetchSourceCached } from "~/lib/cache";
import type { FarmingStage, FarmingStageReward } from "~/domain/farming-recommendation";

const CAMPAIGN_FARMING_STAGES_CACHE_KEY = cacheKey("source", "farming-stage", 1, cacheQuery({ category: "campaign" }));

const farmingStagesQuery = graphql(`
  query FarmingStages($category: String) {
    stages(category: $category) {
      uid name stageNumber area difficulty terrain
      entryCosts { amount resource { uid name type } }
      rewards(region: gl) {
        rewardType rewardTag probability
        resource { __typename uid name type rarity ... on Equipment { category } }
        gachaGroup {
          items(region: gl) {
            chance
            resource { __typename uid name type rarity ... on Equipment { category } }
          }
        }
      }
    }
  }
`);

export async function getCampaignFarmingStages(env: Env, forceRefresh = false): Promise<FarmingStage[]> {
  return fetchSourceCached(
    env,
    CAMPAIGN_FARMING_STAGES_CACHE_KEY,
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
  gachaGroup?: {
    items: Array<{
      chance?: number | string | null;
      resource: { uid: string; name: string | null; type: string } | null;
    }>;
  } | null;
}): FarmingStageReward[] {
  if (reward.gachaGroup) {
    const rewardProbability = parseProbability(reward.probability);
    return reward.gachaGroup.items.flatMap((item) => {
      if (!item.resource) {
        return [];
      }

      const itemChance = parseProbability(item.chance);
      return [
        {
          uid: item.resource.uid,
          name: normalizeName(item.resource.name),
          rewardType: item.resource.type,
          rewardTag: reward.rewardTag,
          probability: multiplyProbability(rewardProbability, itemChance),
        },
      ];
    });
  }

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

function multiplyProbability(rewardProbability: number | null, itemChance: number | null): number | null {
  if (itemChance == null) {
    return null;
  }

  return rewardProbability == null ? itemChance : rewardProbability * itemChance;
}

function normalizeName(name: string | null): string {
  return (name ?? "").replaceAll("\n", " ").trim();
}
