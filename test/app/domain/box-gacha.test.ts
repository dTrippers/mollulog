import { describe, expect, it } from "@jest/globals";
import type { BoxGachaData, BoxGachaItem, BoxGachaRound } from "~/domain/event-shop";
import { groupBoxGachaBoxes } from "~/domain/event-shop/box-gacha";
import { ResourceTypeEnum } from "~/graphql/graphql";

const ticket = { resourceType: ResourceTypeEnum.Item, resourceUid: "ticket", resourceName: "교환권", quantity: 6 };
const pyroxene = { resourceType: ResourceTypeEnum.Currency, resourceUid: "3", resourceName: "청휘석" };
const credit = { resourceType: ResourceTypeEnum.Currency, resourceUid: "1", resourceName: "크레딧" };
const report = { resourceType: ResourceTypeEnum.Item, resourceUid: "10", resourceName: "활동 보고서", rarity: 1 };
const stone = { resourceType: ResourceTypeEnum.Equipment, resourceUid: "1", resourceName: "강화석", rarity: 1 };

function item(groupId: number, count: number, rewards: BoxGachaItem["rewards"], isPrize = false): BoxGachaItem {
  return { groupId, displayOrder: groupId, count, isPrize, rewards };
}

function round(number: number, items: BoxGachaItem[]): BoxGachaRound {
  return { round: number, drawCost: ticket, drawCount: items.reduce((sum, { count }) => sum + count, 0), items };
}

const oddItems = [
  item(1, 1, [{ ...pyroxene, quantity: 150 }], true),
  item(2, 5, [{ ...credit, quantity: 150000 }]),
  item(3, 7, [{ ...credit, quantity: 75000 }]),
  item(4, 87, [{ ...report, quantity: 3 }]),
];
const evenItems = [
  item(1, 1, [{ ...pyroxene, quantity: 150 }], true),
  item(2, 12, [{ ...credit, quantity: 100000 }]),
  item(3, 87, [{ ...stone, quantity: 3 }]),
];
const loopItems = [item(1, 100, [{ ...report, quantity: 2 }])];

function boxGacha(rounds: BoxGachaRound[], loopRound: number | null): Extract<BoxGachaData, { status: "available" }> {
  return { status: "available", loopRound, rounds };
}

describe("groupBoxGachaBoxes", () => {
  it("groups rounds that share a box and keeps the loop round apart", () => {
    const boxes = groupBoxGachaBoxes(
      boxGacha(
        [round(1, oddItems), round(2, evenItems), round(3, oddItems), round(4, evenItems), round(5, loopItems)],
        5,
      ),
    );

    expect(boxes.map(({ rounds, repeatsFrom }) => ({ rounds, repeatsFrom }))).toEqual([
      { rounds: [1, 3], repeatsFrom: null },
      { rounds: [2, 4], repeatsFrom: null },
      { rounds: [5], repeatsFrom: 5 },
    ]);
    expect(boxes[0].drawCount).toBe(100);
    expect(boxes[0].drawCost).toEqual(ticket);
  });

  it("sums one box's rewards per resource and marks prize rewards", () => {
    const [box] = groupBoxGachaBoxes(boxGacha([round(1, oddItems)], null));

    expect(box.rewards.map(({ resourceUid, quantity, isPrize }) => ({ resourceUid, quantity, isPrize }))).toEqual([
      { resourceUid: "3", quantity: 150, isPrize: true },
      { resourceUid: "1", quantity: 150000 * 5 + 75000 * 7, isPrize: false },
      { resourceUid: "10", quantity: 261, isPrize: false },
    ]);
  });

  it("keeps a prize apart from the same resource in a regular group", () => {
    const [box] = groupBoxGachaBoxes(
      boxGacha(
        [round(1, [item(1, 1, [{ ...pyroxene, quantity: 150 }], true), item(2, 9, [{ ...pyroxene, quantity: 10 }])])],
        null,
      ),
    );

    expect(box.rewards.map(({ quantity, isPrize }) => ({ quantity, isPrize }))).toEqual([
      { quantity: 150, isPrize: true },
      { quantity: 90, isPrize: false },
    ]);
  });

  it("separates rounds whose boxes differ only in the draw cost", () => {
    const pricier = { ...round(2, oddItems), drawCost: { ...ticket, quantity: 12 } };
    const boxes = groupBoxGachaBoxes(boxGacha([round(1, oddItems), pricier], null));

    expect(boxes.map(({ rounds }) => rounds)).toEqual([[1], [2]]);
  });
});
