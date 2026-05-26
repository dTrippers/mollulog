import type { ResourceTypeEnum } from "~/graphql/graphql";

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
  paymentResourceAmount: number;
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
    ratio: string; // decimal string
  }[];
};

export type CollectableResource = {
  type: ResourceTypeEnum;
  uid: string;
  name: string;
  forPayment: boolean;
};
