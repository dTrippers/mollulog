import { describe, expect, it } from "@jest/globals";
import { buildCollectableResources } from "~/components/features/events/shop/calculations/collectable-resources";
import { calculateResourceLedger } from "~/components/features/events/shop/calculations/ledger";
import type { ClueSearchExchange } from "~/components/features/events/shop/clue-search";
import type { MinigameConfig, RewardItem, ShopResource, Stage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const eventCoin = { type: ResourceTypeEnum.Item, uid: "event-coin", name: "이벤트 재화" };
const minigameTicket = { type: ResourceTypeEnum.Item, uid: "minigame-ticket", name: "미니게임 재화" };

// Reward-only resources: obtainable from a minigame but never spent in the shop or the minigame.
const rewardOnlyUids = ["reward-eligma", "reward-report", "reward-furniture", "reward-extra"];
const rewardOnly = (uid: string, quantity = 1): RewardItem => ({
  resourceType: ResourceTypeEnum.Item,
  resourceUid: uid,
  resourceName: uid,
  quantity,
});
// An event currency that the minigame also rewards. It is collectable because the shop spends it.
const eventCoinReward: RewardItem = {
  resourceType: eventCoin.type,
  resourceUid: eventCoin.uid,
  resourceName: eventCoin.name,
  quantity: 300,
};

const shopResources: ShopResource[] = [
  {
    uid: "shop-entry",
    resource: { type: ResourceTypeEnum.Item, uid: "shop-reward", name: "상점 상품", rarity: 1 },
    resourceAmount: 1,
    paymentResource: eventCoin,
    purchaseTiers: [{ tierIndex: 0, startQuantity: 1, quantity: 1, unitPrice: 100, paymentResource: eventCoin }],
    shopAmount: 1,
  },
];

const stages: Stage[] = [
  {
    uid: "stage-1",
    index: "1",
    entryAp: 10,
    difficulty: 1,
    rewards: [
      {
        amount: 30,
        rewardRequirement: "ThreeStar",
        chance: "1.0",
        item: { uid: "pyroxene", name: "청휘석", category: "", rarity: 1 },
      },
      {
        amount: 1,
        rewardRequirement: null,
        chance: "0.3",
        item: { uid: "stage-report", name: "활동 보고서", category: "exp", rarity: 2 },
      },
      {
        amount: 9,
        rewardRequirement: null,
        chance: "1.0",
        item: { uid: minigameTicket.uid, name: minigameTicket.name, category: "coin", rarity: 1 },
      },
    ],
  },
];

const payment = {
  resourceType: minigameTicket.type,
  resourceUid: minigameTicket.uid,
  resourceName: minigameTicket.name,
  quantity: 150,
};

function minigameConfig(overrides: Partial<MinigameConfig>): MinigameConfig {
  return { minigameType: "box_gacha", payment, payments: [], rewardGroups: [], ...overrides };
}

// Every minigame shape that carries reward data, each mixing reward-only items with an event currency reward.
const rewardBearingConfigs: [string, MinigameConfig][] = [
  [
    "box_gacha reward groups",
    minigameConfig({
      rewardGroups: [
        {
          rounds: [1],
          payments: [],
          rewards: [eventCoinReward, ...rewardOnlyUids.map((uid) => rewardOnly(uid))],
        },
      ],
    }),
  ],
  [
    "dice node rewards",
    minigameConfig({
      minigameType: "dice",
      dice: {
        tiles: 20,
        diceMin: 1,
        diceMax: 6,
        bonusRollUntilLap: 0,
        nodeRewards: [eventCoinReward, ...rewardOnlyUids.map((uid) => rewardOnly(uid))],
      },
    }),
  ],
  [
    "card_flip card rewards",
    minigameConfig({
      minigameType: "card_flip",
      cardFlip: {
        status: "available",
        slotCount: 1,
        flipCosts: [],
        drawRules: { initialGroup: 1, maxDrawCount: 1, advanceOnRarities: [] },
        cards: [
          {
            uid: "card-1",
            name: null,
            rarity: 1,
            imageUrl: null,
            slots: [{ slot: 1, weight: 1 }],
            rewards: [eventCoinReward, ...rewardOnlyUids.map((uid) => rewardOnly(uid))],
          },
        ],
      },
    }),
  ],
  [
    "treasure_hunt treasure and open-cell rewards",
    minigameConfig({
      minigameType: "treasure_hunt",
      treasureHunt: {
        loopRound: 1,
        rounds: [
          {
            round: 1,
            boardWidth: 3,
            boardHeight: 3,
            cellCost: payment,
            openCellRewards: [rewardOnly("reward-eligma")],
            treasures: [
              {
                uid: "treasure-1",
                width: 1,
                height: 1,
                count: 1,
                rewards: [eventCoinReward, ...rewardOnlyUids.slice(1).map((uid) => rewardOnly(uid))],
              },
            ],
          },
        ],
      },
    }),
  ],
  [
    "road_puzzle round, additional and rail set rewards",
    minigameConfig({
      minigameType: "road_puzzle",
      roadPuzzle: {
        instantClearRound: 7,
        railSetReward: [rewardOnly("reward-extra")],
        rounds: [
          {
            round: 1,
            isLoop: false,
            mapUids: ["map-1"],
            rewards: [eventCoinReward, rewardOnly("reward-eligma"), rewardOnly("reward-report")],
            additionalRewards: [rewardOnly("reward-furniture")],
          },
        ],
        maps: [],
      },
    }),
  ],
];

function uidsOf(config: MinigameConfig | null, clueSearchExchange: ClueSearchExchange | null = null) {
  return buildCollectableResources({ shopResources, stages, minigameConfig: config, clueSearchExchange }).map(
    ({ uid }) => uid,
  );
}

describe("buildCollectableResources", () => {
  it("lists shop payments and stage coin drops, but not other stage rewards", () => {
    expect(uidsOf(null)).toEqual([eventCoin.uid, minigameTicket.uid]);
  });

  it.each(rewardBearingConfigs)("never lists minigame rewards as farming resources (%s)", (_label, config) => {
    const uids = uidsOf(config);

    for (const uid of rewardOnlyUids) {
      expect(uids).not.toContain(uid);
    }
    expect(uids).toEqual([eventCoin.uid, minigameTicket.uid]);
  });

  it("lists minigame payments that the shop and stages do not cover", () => {
    const otherPayment = { ...payment, resourceUid: "rail-sticker", resourceName: "스티커" };
    const uids = uidsOf(
      minigameConfig({
        minigameType: "road_puzzle",
        payment: otherPayment,
        roadPuzzle: {
          instantClearRound: 7,
          railSetReward: [],
          rounds: [
            { round: 1, isLoop: false, mapUids: [], rewards: [rewardOnly("reward-eligma")], additionalRewards: [] },
          ],
          maps: [],
        },
      }),
    );

    expect(uids).toEqual([eventCoin.uid, minigameTicket.uid, "rail-sticker"]);
  });

  it("lists treasure hunt cell costs instead of the base minigame payment", () => {
    const cellCost = { ...payment, resourceUid: "shovel", resourceName: "삽" };
    const uids = uidsOf(
      minigameConfig({
        minigameType: "treasure_hunt",
        payment: { ...payment, resourceUid: "unused-payment" },
        treasureHunt: {
          loopRound: 1,
          rounds: [{ round: 1, boardWidth: 1, boardHeight: 1, cellCost, openCellRewards: [], treasures: [] }],
        },
      }),
    );

    expect(uids).toEqual([eventCoin.uid, minigameTicket.uid, "shovel"]);
  });

  it("replaces exchanged clues with the clue search point resource", () => {
    const clue = { ...payment, resourceUid: "clue", resourceName: "단서" };
    const exchange: ClueSearchExchange = {
      supported: true,
      clueUids: ["clue"],
      pointResource: { type: ResourceTypeEnum.Item, uid: "clue-points", name: "단서 포인트", rarity: 1 },
      rules: [],
      pointPerClue: {},
      hiddenShopResourceUids: [],
    };

    expect(uidsOf(minigameConfig({ minigameType: "clue_search", payment: clue }), exchange)).toEqual([
      eventCoin.uid,
      minigameTicket.uid,
      "clue-points",
    ]);
  });

  it("still counts event currency rewards through the ledger", () => {
    const ledger = calculateResourceLedger({
      shopResources,
      itemQuantities: { "shop-entry": 1 },
      itemPurchaseDays: {},
      existingPaymentItemQuantities: {},
      stages,
      includeFirstClear: false,
      minigamePlayCount: 1,
      minigameRewards: [eventCoinReward, rewardOnly("reward-eligma", 5)],
    });
    const collectableUids = new Set(uidsOf(null));

    expect(ledger.fromMinigame[eventCoin.uid]).toBe(300);
    expect(collectableUids.has(eventCoin.uid)).toBe(true);
    expect(collectableUids.has("reward-eligma")).toBe(false);
  });
});
