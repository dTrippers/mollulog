import { describe, expect, it } from "@jest/globals";
import {
  convertRelationshipShortfall,
  getAvailableOwnedGiftQuantities,
  getOwnedGiftPlanQuantities,
  getRelationshipGiftQuantityBreakdown,
  getRelationshipShortfallSummary,
  groupStudentGiftsByExp,
  type StudentFavoriteGift,
} from "~/domain/relationship-gifts";

const aruGifts: StudentFavoriteGift[] = [
  { favorited: true, favoriteLevel: 4, exp: 240, item: { uid: "gift-240", name: "gift 240", rarity: 4 } },
  { favorited: true, favoriteLevel: 3, exp: 180, item: { uid: "gift-180", name: "gift 180", rarity: 4 } },
  { favorited: true, favoriteLevel: 3, exp: 60, item: { uid: "gift-60", name: "gift 60", rarity: 3 } },
  { favorited: false, favoriteLevel: 3, exp: 60, item: { uid: "common-60", name: "common gift", rarity: 4 } },
  { favorited: true, favoriteLevel: 2, exp: 120, item: { uid: "gift-120", name: "gift 120", rarity: 4 } },
];

describe("relationship gift calculations", () => {
  it("groups actual favorite gift EXP and excludes below-level gifts, including unfavorited common gifts", () => {
    const groups = groupStudentGiftsByExp(aruGifts);

    expect(groups.map(({ exp, gifts }) => [exp, gifts.map(({ item }) => item.uid)])).toEqual([
      [240, ["gift-240"]],
      [180, ["gift-180"]],
      [60, ["common-60", "gift-60"]],
    ]);
  });

  it("includes actual 40 EXP gifts without adding other below-level tiers", () => {
    const rows = convertRelationshipShortfall(
      81,
      groupStudentGiftsByExp([
        ...aruGifts,
        { favorited: true, favoriteLevel: 2, exp: 40, item: { uid: "5001", name: "페로로 휠 슬라이드", rarity: 3 } },
      ]),
    );
    expect(rows.map(({ exp }) => exp)).toEqual([240, 180, 60, 40]);
    expect(rows.at(-1)).toMatchObject({ exp: 40, quantity: 3 });
  });

  it("converts Aru's remaining 24,270 EXP into 102/135/405 gifts", () => {
    const rows = convertRelationshipShortfall(24_270, groupStudentGiftsByExp(aruGifts));
    expect(rows.map(({ exp, quantity }) => [exp, quantity])).toEqual([
      [240, 102],
      [180, 135],
      [60, 405],
    ]);
  });

  it("keeps the Haruna two-tier and four-tier cases grouped by their actual EXP", () => {
    const haruna = groupStudentGiftsByExp([
      { favorited: true, favoriteLevel: 4, exp: 240, item: { uid: "h240", name: "240", rarity: 4 } },
      { favorited: true, favoriteLevel: 3, exp: 60, item: { uid: "h60", name: "60", rarity: 3 } },
    ]);
    const fourTierStudent = groupStudentGiftsByExp([
      { favorited: true, favoriteLevel: 4, exp: 240, item: { uid: "a240", name: "240", rarity: 4 } },
      { favorited: true, favoriteLevel: 3, exp: 180, item: { uid: "a180", name: "180", rarity: 4 } },
      { favorited: true, favoriteLevel: 3, exp: 80, item: { uid: "a80", name: "80", rarity: 3 } },
      { favorited: true, favoriteLevel: 3, exp: 60, item: { uid: "a60", name: "60", rarity: 3 } },
    ]);

    expect(haruna.map(({ exp }) => exp)).toEqual([240, 60]);
    expect(fourTierStudent.map(({ exp }) => exp)).toEqual([240, 180, 80, 60]);
  });

  it("uses the same post-gift result for reached rank, next rank, and remaining target EXP", () => {
    const result = getRelationshipShortfallSummary({
      currentLevel: 20,
      currentExp: null,
      targetLevel: 50,
      giftExp: 12 * 180 + 10 * 60 + 5 * 60,
    });

    expect(result).toMatchObject({ expectedLevel: 27, nextRankExp: 115, remainingExp: 24_270, reached: false });
    expect(
      getRelationshipShortfallSummary({ currentLevel: 49, currentExp: null, targetLevel: 50, giftExp: 2_000 }),
    ).toMatchObject({
      reached: true,
      excessExp: 260,
    });
  });

  it("subtracts only other students' allocations and clamps available gifts at zero", () => {
    const breakdowns = {
      "gift-a": [
        { studentUid: "current", name: "Current", quantity: 2 },
        { studentUid: "other", name: "Other", quantity: 3 },
      ],
      "gift-b": [{ studentUid: "other", name: "Other", quantity: 5 }],
    };

    expect(
      getAvailableOwnedGiftQuantities({ "gift-a": 4, "gift-b": 2, "gift-c": 1 }, breakdowns, "current", true),
    ).toEqual({
      "gift-a": 1,
      "gift-b": 0,
      "gift-c": 1,
    });
    expect(getAvailableOwnedGiftQuantities({ "gift-a": 4 }, breakdowns, "current", false)).toEqual({ "gift-a": 4 });
  });

  it("only plans positive inventory for gifts the selected student can receive", () => {
    expect(
      getOwnedGiftPlanQuantities(
        [
          { item: { uid: "gift-a", name: "Gift A", rarity: 3 } },
          { item: { uid: "gift-b", name: "Gift B", rarity: 3 } },
        ],
        {
          "gift-a": 3,
          "gift-b": 0,
          "other-resource": 99,
        },
      ),
    ).toEqual({ "gift-a": 3 });
    expect(getOwnedGiftPlanQuantities(undefined, { "gift-a": 3 })).toEqual({});
    expect(getOwnedGiftPlanQuantities([{ item: { uid: "gift-a", name: "Gift A", rarity: 3 } }], null)).toEqual({});
  });

  it("totals all student plans and sorts each student's breakdown", () => {
    expect(
      getRelationshipGiftQuantityBreakdown([
        { uid: "b", name: "B", items: { "gift-a": 2, "gift-b": 1 } },
        { uid: "a", name: "A", items: { "gift-a": 2 } },
      ]),
    ).toEqual({
      requiredQuantities: { "gift-a": 4, "gift-b": 1 },
      breakdowns: {
        "gift-a": [
          { studentUid: "a", name: "A", quantity: 2 },
          { studentUid: "b", name: "B", quantity: 2 },
        ],
        "gift-b": [{ studentUid: "b", name: "B", quantity: 1 }],
      },
    });
  });
});
