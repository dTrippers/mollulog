import type { ResourceTypeEnum } from "~/graphql/graphql";

export const MINIGAME_PAYMENT_QUANTITY_MODES = ["expected", "min", "max"] as const;

export type MinigamePaymentQuantityMode = (typeof MINIGAME_PAYMENT_QUANTITY_MODES)[number];

export type RewardItem = {
  resourceType: ResourceTypeEnum;
  resourceUid: string;
  resourceName?: string;
  quantity: number;
  rarity?: number;
};

export type DivisorRoundCondition = {
  divisor: number;
  remainders: number[];
};

export type GteRoundCondition = {
  gte: number;
};

export type RewardGroup = {
  rounds: number[] | "subsequent" | DivisorRoundCondition | GteRoundCondition;
  payments: MinigamePaymentRange[];
  rewards: RewardItem[];
};

export type DiceNodeReward = {
  resourceType: ResourceTypeEnum;
  resourceUid: string;
  resourceName?: string;
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
  minigameType: "roguelike" | "prize_exchange" | "dice" | "defense" | "card_flip" | "fortune_gacha" | "box_gacha";
  payment: {
    resourceType: ResourceTypeEnum;
    resourceUid: string;
    resourceName?: string;
    quantity: number;
  };
  payments: MinigamePayment[];
  rewardGroups: RewardGroup[];
  dice?: DiceMinigameConfig; // dice 타입일 때만 사용
};

export type MinigamePayment = {
  resourceType: ResourceTypeEnum;
  resourceUid: string;
  resourceName?: string;
  quantity: number;
};

export type MinigamePaymentRange = {
  resourceType: ResourceTypeEnum;
  resourceUid: string;
  resourceName?: string;
  quantityMin: number;
  quantityExpected: number;
  quantityMax: number;
  quantityVariable: boolean;
};
