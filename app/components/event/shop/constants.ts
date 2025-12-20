import { ResourceTypeEnum } from "~/graphql/graphql";

export type MinigameConfig = {
  payment: {
    resourceType: ResourceTypeEnum;
    resourceUid: string;
    quantity: number;
  };
  rewards: {
    resourceType: ResourceTypeEnum;
    resourceUid: string;
    quantity: number;
    rarity?: number;
  }[];
};

export const MINIGAME_CONFIG: Record<string, MinigameConfig> = {
  "natsuzora-no-yakusoku": {
    payment: {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "80650",
      quantity: 2000,
    },
    rewards: [
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "80654",
        quantity: 420,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "26015",
        quantity: 5,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "80653",
        quantity: 10,
      },
      {
        resourceType: ResourceTypeEnum.Currency,
        resourceUid: "1",
        quantity: 1500000,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "12",
        quantity: 25,
        rarity: 3,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "200",
        quantity: 4,
        rarity: 1,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "201",
        quantity: 3,
        rarity: 2,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "202",
        quantity: 2,
        rarity: 3,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "203",
        quantity: 1,
        rarity: 4,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "230",
        quantity: 4,
        rarity: 1,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "231",
        quantity: 3,
        rarity: 2,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "232",
        quantity: 2,
        rarity: 3,
      },
      {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "233",
        quantity: 1,
        rarity: 4,
      },
    ],
  },
};
