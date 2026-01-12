import { ResourceTypeEnum } from "~/graphql/graphql";

export type RewardItem = {
  resourceType: ResourceTypeEnum;
  resourceUid: string;
  quantity: number;
  rarity?: number;
};

export type RewardGroup = {
  rounds: number[] | "subsequent"; // 특정 회차 배열 또는 이후 모든 회차
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
  title: string;
  minigameType: "roguelike" | "prize_exchange" | "dice";
  description: string;
  payment: {
    resourceType: ResourceTypeEnum;
    resourceUid: string;
    quantity: number;
  };
  rewardGroups: RewardGroup[];
  dice?: DiceMinigameConfig; // dice 타입일 때만 사용
};

export const MINIGAME_CONFIG: Record<string, MinigameConfig> = {
  "natsuzora-no-yakusoku": {
    minigameType: "roguelike",
    title: "미니게임 <정의실현부의 끝나지 않은 여름방학>",
    description: "최종 스테이지(3-7) 클리어를 기준으로 계산돼요",
    payment: {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "80650",
      quantity: 2000,
    },
    rewardGroups: [
      {
        rounds: "subsequent",
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
    ],
  },
  "say-bing-rerun": {
    minigameType: "prize_exchange",
    title: "경품 교환소",
    description: "각 회차별 모든 보상 획득을 기준으로 계산돼요",
    payment: {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "80440",
      quantity: 1800,
    },
    rewardGroups: [
      {
        rounds: [1, 3, 5, 7],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "26012",
            quantity: 20,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "80443",
            quantity: 20,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "10",
            quantity: 50,
            rarity: 1,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "11",
            quantity: 35,
            rarity: 2,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "12",
            quantity: 25,
            rarity: 3,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "13",
            quantity: 10,
            rarity: 4,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "290",
            quantity: 30,
            rarity: 1,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "291",
            quantity: 15,
            rarity: 2,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "292",
            quantity: 8,
            rarity: 3,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "293",
            quantity: 3,
            rarity: 4,
          },
        ],
      },
      {
        rounds: [2, 4, 6, 8],
        rewards: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "26012",
            quantity: 20,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "80443",
            quantity: 20,
          },
          {
            resourceType: ResourceTypeEnum.Equipment,
            resourceUid: "1",
            quantity: 50,
            rarity: 1,
          },
          {
            resourceType: ResourceTypeEnum.Equipment,
            resourceUid: "2",
            quantity: 35,
            rarity: 2,
          },
          {
            resourceType: ResourceTypeEnum.Equipment,
            resourceUid: "3",
            quantity: 25,
            rarity: 3,
          },
          {
            resourceType: ResourceTypeEnum.Equipment,
            resourceUid: "4",
            quantity: 10,
            rarity: 4,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "120",
            quantity: 30,
            rarity: 1,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "121",
            quantity: 15,
            rarity: 2,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "122",
            quantity: 8,
            rarity: 3,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "123",
            quantity: 3,
            rarity: 4,
          },
        ],
      },
      {
        rounds: "subsequent",
        rewards: [
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "26012",
            quantity: 3,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "80443",
            quantity: 10,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "10",
            quantity: 100,
            rarity: 1,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "11",
            quantity: 75,
            rarity: 2,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "12",
            quantity: 15,
            rarity: 3,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "13",
            quantity: 5,
            rarity: 4,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "290",
            quantity: 15,
            rarity: 1,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "291",
            quantity: 7,
            rarity: 2,
          },
          {
            resourceType: ResourceTypeEnum.Item,
            resourceUid: "292",
            quantity: 2,
            rarity: 3,
          },
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "1",
            quantity: 200000,
          },
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "1",
            quantity: 450000,
          },
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "1",
            quantity: 375000,
          },
          {
            resourceType: ResourceTypeEnum.Currency,
            resourceUid: "1",
            quantity: 300000,
          },
        ],
      },
    ],
  },
  "occult-club": {
    minigameType: "dice",
    title: "주사위 달리기",
    description: "보상은 주사위의 평균값으로 계산되어 실제와 다를 수 있어요",
    payment: {
      resourceType: ResourceTypeEnum.Item,
      resourceUid: "80660",
      quantity: 500,
    },
    dice: {
      tiles: 18,
      diceMin: 1,
      diceMax: 6,
      bonusRollUntilLap: 16,
      nodeRewards: [
        // { resourceType: ResourceTypeEnum.Item, resourceUid: "100043", quantity: 53 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "192", quantity: 3 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "262", quantity: 3 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "13", quantity: 6 },
        // { resourceType: ResourceTypeEnum.Item, resourceUid: "100043", quantity: 41 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "262", quantity: 2 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "23", quantity: 5 },
        { resourceType: ResourceTypeEnum.Equipment, resourceUid: "4", quantity: 7 },
        { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", quantity: 2000000 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "23", quantity: 4 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "192", quantity: 2 },
        { resourceType: ResourceTypeEnum.Equipment, resourceUid: "4", quantity: 4 },
        { resourceType: ResourceTypeEnum.Item, resourceUid: "13", quantity: 6 },
        { resourceType: ResourceTypeEnum.Equipment, resourceUid: "4", quantity: 4 },
      ],
    },
    rewardGroups: [
      {
        rounds: [1],
        rewards: [
          { resourceType: ResourceTypeEnum.Item, resourceUid: "12", quantity: 30 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "260", quantity: 50 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "190", quantity: 50 },
        ],
      },
      {
        rounds: [2],
        rewards: [
          { resourceType: ResourceTypeEnum.Equipment, resourceUid: "3", quantity: 30 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "261", quantity: 20 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "191", quantity: 20 },
        ],
      },
      {
        rounds: [3],
        rewards: [
          { resourceType: ResourceTypeEnum.Item, resourceUid: "12", quantity: 40 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "260", quantity: 50 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "190", quantity: 50 },
        ],
      },
      {
        rounds: [4],
        rewards: [
          { resourceType: ResourceTypeEnum.Equipment, resourceUid: "3", quantity: 40 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "261", quantity: 20 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "191", quantity: 20 },
        ],
      },
      {
        rounds: [5],
        rewards: [
          { resourceType: ResourceTypeEnum.Item, resourceUid: "13", quantity: 25 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "260", quantity: 50 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "190", quantity: 50 },
        ],
      },
      {
        rounds: [6],
        rewards: [
          { resourceType: ResourceTypeEnum.Equipment, resourceUid: "4", quantity: 35 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "261", quantity: 20 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "191", quantity: 20 },
        ],
      },
      {
        rounds: [7],
        rewards: [
          { resourceType: ResourceTypeEnum.Item, resourceUid: "6998", quantity: 5 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "262", quantity: 14 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "192", quantity: 14 },
        ],
      },
      {
        rounds: [8],
        rewards: [
          { resourceType: ResourceTypeEnum.Item, resourceUid: "13", quantity: 30 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "263", quantity: 5 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "193", quantity: 5 },
        ],
      },
      {
        rounds: [9],
        rewards: [
          { resourceType: ResourceTypeEnum.Equipment, resourceUid: "4", quantity: 40 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "262", quantity: 16 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "192", quantity: 16 },
        ],
      },
      {
        rounds: [10],
        rewards: [
          { resourceType: ResourceTypeEnum.Item, resourceUid: "9999", quantity: 1 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "263", quantity: 6 },
          { resourceType: ResourceTypeEnum.Item, resourceUid: "193", quantity: 6 },
        ],
      },
      {
        rounds: [11],
        rewards: [
          { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", quantity: 1200000 },
        ],
      },
      {
        rounds: [12],
        rewards: [
          { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", quantity: 1200000 },
        ],
      },
      {
        rounds: [13],
        rewards: [
          { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", quantity: 1200000 },
        ],
      },
      {
        rounds: [14],
        rewards: [
          { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", quantity: 1200000 },
        ],
      },
      {
        rounds: [15],
        rewards: [
          { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", quantity: 1200000 },
        ],
      },
      {
        rounds: [16],
        rewards: [
          { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", quantity: 2000000 },
        ],
      },
      {
        rounds: [17, 18, 19, 20],
        rewards: [
          { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", quantity: 2000000 },
        ],
      },
    ],
  }
};
