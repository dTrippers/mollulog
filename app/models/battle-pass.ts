const battlePassRewardsKey = (eventUid: string) => `battle-pass-rewards::${eventUid}`;

export type BattlePassReward = {
  normal: {
    resourceType: string;
    resourceUid: string;
    quantity: number;
  };
  growth: {
    resourceType: string;
    resourceUid: string;
    quantity: number;
  };
};

export async function getBattlePassRewards(env: Env, eventUid: string): Promise<BattlePassReward[]> {
  const key = battlePassRewardsKey(eventUid);
  const rawData = await env.KV_CACHE.get(key);
  if (rawData) {
    return JSON.parse(rawData) as BattlePassReward[];
  }
  return [];
}
