import type { ResourceTypeEnum } from "~/graphql/graphql";

export type RewardItem = {
  resourceType: ResourceTypeEnum;
  resourceUid: string;
  quantity: number;
  rarity?: number;
};

export type DivisorRoundCondition = {
  divisor: number;
  remainders: number[];
};

export type RewardGroup = {
  rounds: number[] | "subsequent" | DivisorRoundCondition; // 특정 회차, 이후 모든 회차, 또는 나머지 조건
  rewards: RewardItem[];
};

export type DiceNodeReward = {
  resourceType: ResourceTypeEnum;
  resourceUid: string;
  quantity: number;
};

export type DiceMinigameConfig = {
  tiles: number; // 칸 수 (18)
  diceMin: number; // 주사위 최솟값 (1)
  diceMax: number; // 주사위 최댓값 (6)
  bonusRollUntilLap: number; // 보너스 종료 바퀴 (16) - 이 바퀴까지 확정권 1회 지급
  nodeRewards?: DiceNodeReward[]; // 각 발판(노드)의 보상 목록
};

export type MinigameConfig = {
  minigameType: "roguelike" | "prize_exchange" | "dice" | "defense" | "card_flip";
  payment: {
    resourceType: ResourceTypeEnum;
    resourceUid: string;
    resourceName?: string;
    quantity: number;
  };
  rewardGroups: RewardGroup[];
  dice?: DiceMinigameConfig; // dice 타입일 때만 사용
};
