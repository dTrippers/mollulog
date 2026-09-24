import Decimal from "decimal.js";
import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { StageCard } from "~/components/features/events/shop/StageCard";
import type { Stage } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { resourceImageUrl } from "~/models/assets";

const sharedProps = {
  isEnabled: false,
  calculatedRuns: 0,
  extraRuns: 0,
  appliedBonusRatio: {} as Record<string, Decimal>,
  onToggleStage: jest.fn(),
  onChangeExtraRuns: jest.fn(),
};

function renderStageRewards(rewards: Stage["rewards"]) {
  return renderToStaticMarkup(
    <StageCard
      {...sharedProps}
      stage={{ uid: "event-stage-1", entryAp: 10, index: "1", difficulty: 1, rewards }}
    />,
  );
}

describe("StageCard reward images", () => {
  it("renders an Emblem-only reward with the BAQL image URL", () => {
    const emblemImageUrl = "https://assets.baql.net/images/resources/emblems/3000845/background/ko.webp";
    const markup = renderStageRewards([
      {
        amount: 1,
        rewardRequirement: null,
        chance: null,
        item: {
          uid: "3000845",
          name: "이벤트 문양",
          category: "",
          rarity: 1,
          resourceType: ResourceTypeEnum.Emblem,
          imageUrl: emblemImageUrl,
        },
      },
    ]);

    expect(markup).toContain(`src="${emblemImageUrl}"`);
    expect(markup).not.toContain("resources/items/3000845");
  });

  it("keeps item resource images and does not show a rewards box for a missing resource", () => {
    const itemUid = "12345";
    const itemMarkup = renderStageRewards([
      {
        amount: 2,
        rewardRequirement: null,
        chance: null,
        item: {
          uid: itemUid,
          name: "가구 설계도",
          category: "normal",
          rarity: 1,
          resourceType: ResourceTypeEnum.Item,
        },
      },
    ]);
    const missingResourceMarkup = renderStageRewards([
      { amount: 2, rewardRequirement: null, chance: null, item: null },
    ]);

    expect(itemMarkup).toContain(resourceImageUrl("item", itemUid));
    expect(missingResourceMarkup).not.toContain("flex-wrap gap-1");
  });
});
