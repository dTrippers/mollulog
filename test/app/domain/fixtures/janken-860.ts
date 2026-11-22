import type { JankenConfig, JankenStage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const item = (
  resourceUid: string,
  quantity: number,
  tag: "default" | "first_clear" | "three_star" = "default",
  probability = 1,
) => ({
  resourceType: ResourceTypeEnum.Item,
  resourceUid,
  quantity,
  probability,
  tag,
});

const currency = (
  resourceUid: string,
  quantity: number,
  tag: "default" | "first_clear" | "three_star" = "default",
) => ({
  resourceType: ResourceTypeEnum.Currency,
  resourceUid,
  quantity,
  probability: 1,
  tag,
});

const expectedItem = (resourceUid: string, tenths: number) => {
  const whole = Math.floor(tenths / 10);
  const remainder = tenths % 10;
  return [
    ...(whole > 0 ? [item(resourceUid, whole)] : []),
    ...(remainder > 0 ? [item(resourceUid, remainder, "default", 0.1)] : []),
  ];
};

function makeStage(
  uid: string,
  stageType: JankenStage["stageType"],
  stageNumber: number,
  previousStageUid: string | null,
  entryCost: number,
  rewards: JankenStage["rewards"],
): JankenStage {
  return {
    uid,
    stageType,
    stageNumber,
    previousStageUid,
    entryCost: { resourceType: ResourceTypeEnum.Item, resourceUid: "80860", quantity: entryCost },
    rewards,
  };
}

const storyStages = Array.from({ length: 5 }, (_, index) =>
  makeStage(`10086010${index + 1}`, "story", index + 1, index === 0 ? null : `10086010${index}`, 100, [
    item("26016", 1, "first_clear"),
    item("80863", 1, "first_clear"),
    currency("3", 10, "first_clear"),
  ]),
);

const normalDefaults = [
  { elephTenths: 10, shopTenths: 11, equipment: 30 },
  { elephTenths: 11, shopTenths: 14, equipment: 36 },
  { elephTenths: 12, shopTenths: 17, equipment: 42 },
  { elephTenths: 13, shopTenths: 20, equipment: 50 },
];

const normalStages = normalDefaults.map((reward, index) =>
  makeStage(
    `10086020${index + 1}`,
    "normal",
    index + 1,
    index === 0 ? "100860105" : `10086020${index}`,
    325 + index * 25,
    [
      item("26016", 2, "first_clear"),
      item("80863", 2, "first_clear"),
      currency("3", 20, "three_star"),
      ...expectedItem("26016", reward.elephTenths),
      ...expectedItem("80863", reward.shopTenths),
      item("80864", reward.equipment),
    ],
  ),
);

const challengeStage = makeStage("100860301", "challenge", 1, "100860204", 400, [
  item("26016", 3, "first_clear"),
  item("80863", 3, "first_clear"),
  ...expectedItem("26016", 13),
  item("80863", 2),
]);

const scoreReward = (tier: number, score: number, eleph = 0, other = false) => ({
  tier,
  score,
  rewards: [...(eleph > 0 ? [item("26016", eleph)] : []), ...(other ? [item("12", 5)] : [])],
});

export const janken860Fixture: Extract<JankenConfig, { status: "available" }> = {
  status: "available",
  challengeMultipleUnlockScore: 2_000_000,
  multipleMax: 99,
  stages: [...storyStages, ...normalStages, challengeStage],
  scoreRewards: [
    scoreReward(5, 500_000, 10),
    scoreReward(10, 1_000_000, 10),
    scoreReward(15, 1_750_000, 20),
    scoreReward(20, 2_500_000, 20),
    scoreReward(25, 3_250_000, 20),
    scoreReward(30, 4_000_000),
    scoreReward(31, 4_150_000, 0, true),
    scoreReward(50, 7_000_000, 0, true),
  ],
  equipmentUpgrade: {
    maxTier: 5,
    costResource: { resourceType: ResourceTypeEnum.Item, resourceUid: "80864", quantity: 1 },
    tierCosts: [
      { tier: 2, quantity: 100 },
      { tier: 3, quantity: 150 },
      { tier: 4, quantity: 200 },
      { tier: 5, quantity: 250 },
    ],
  },
  equipments: Array.from({ length: 5 }, (_, index) => ({
    uid: `8600${index + 1}`,
    unlockStageUid: "100860104",
    tiers: [],
  })),
};
