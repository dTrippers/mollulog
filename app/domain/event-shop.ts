import type { ResourceTypeEnum } from "~/graphql/graphql";

export const FIRST_CLEAR_REWARD_REQUIREMENT = "FirstClear";

export const MINIGAME_PAYMENT_QUANTITY_MODES = ["expected", "min", "max"] as const;

export type MinigamePaymentQuantityMode = (typeof MINIGAME_PAYMENT_QUANTITY_MODES)[number];

export const BONUS_STUDENT_SELECTION_MODES = ["shared", "perItem"] as const;

export type BonusStudentSelectionMode = (typeof BONUS_STUDENT_SELECTION_MODES)[number];

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
  tiles: number;
  diceMin: number;
  diceMax: number;
  bonusRollUntilLap: number;
  nodeRewards?: DiceNodeReward[];
};

export type MinigameConfig = {
  minigameType:
    | "roguelike"
    | "prize_exchange"
    | "dice"
    | "defense"
    | "card_flip"
    | "fortune_gacha"
    | "box_gacha"
    | "clue_search";
  payment: {
    resourceType: ResourceTypeEnum;
    resourceUid: string;
    resourceName?: string;
    quantity: number;
  };
  payments: MinigamePayment[];
  rewardGroups: RewardGroup[];
  dice?: DiceMinigameConfig;
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

export type Stage = {
  uid: string;
  entryAp: number;
  index: string;
  difficulty: number;
  rewards: {
    amount: number;
    rewardRequirement: string | null;
    chance: string | null;
    item: {
      uid: string;
      name: string;
      category: string;
      rarity: number;
    } | null;
  }[];
};

export type ShopResource = {
  uid: string;
  resource: {
    type: ResourceTypeEnum;
    uid: string;
    name: string;
    rarity: number;
  };
  resourceAmount: number;
  paymentResource: {
    type: ResourceTypeEnum;
    uid: string;
    name: string;
  };
  purchaseTiers: {
    tierIndex: number;
    startQuantity: number;
    quantity: number | null;
    unitPrice: number;
    paymentResource: {
      type: ResourceTypeEnum;
      uid: string;
      name: string;
    };
  }[];
  shopAmount: number | null;
};

export type EventRewardBonus = {
  uid: string;
  name: string;
  rewardBonuses: {
    student: {
      uid: string;
      name: string;
      role: string;
    };
    ratio: string;
  }[];
};

export type CollectableResource = {
  type: ResourceTypeEnum;
  uid: string;
  name: string;
  forPayment: boolean;
};
