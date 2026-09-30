import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectedTotalsSection } from "~/components/features/events/shop/CollectedTotalsSection";
import { TreasureHuntSection, type TreasureHuntSectionState } from "~/components/features/events/shop/TreasureHuntSection";
import type { ShopActions, ShopState } from "~/components/features/events/shop/hooks";
import type { TreasureHuntConfig } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";

const treasureHunt: TreasureHuntConfig = {
  loopRound: 1,
  rounds: [
    {
      round: 1,
      boardWidth: 3,
      boardHeight: 3,
      cellCost: {
        resourceType: ResourceTypeEnum.Item,
        resourceUid: "event-item",
        resourceName: "이벤트 재화",
        quantity: 100,
      },
      openCellRewards: [],
      treasures: [],
    },
  ],
};

const shopState = {
  minigameStartRound: 1,
  minigamePlayCount: 101,
  minigamePaymentQuantityMode: "expected",
  itemQuantities: {},
  itemPurchaseDays: {},
} as ShopState;

describe("treasure-hunt target round limit", () => {
  it("keeps an over-limit restored value editable and explains the range", () => {
    const calculation: TreasureHuntSectionState = {
      status: "round-limit",
      progress: null,
      rows: [],
      statsBySignature: {},
      estimate: null,
      retry: jest.fn(),
    };
    const markup = renderToStaticMarkup(
      <TreasureHuntSection
        treasureHunt={treasureHunt}
        state={shopState}
        actions={{} as ShopActions}
        calculation={calculation}
      />,
    );

    expect(markup).toContain('value="101"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="treasure-hunt-target-round-error"');
    expect(markup).toMatch(/disabled=""[^>]*aria-label="증가"/);
    expect(markup).toContain("보물찾기 목표 회차는 최대 100회차까지 설정할 수 있어요.");
  });

  it("withholds final AP until the over-limit target is corrected", () => {
    const empty = {};
    const markup = renderToStaticMarkup(
      <CollectedTotalsSection
        stages={[]}
        collectableResources={[]}
        shopResources={[]}
        eventUid="event-uid"
        shopStateUid="event-uid"
        savedShopStateSource="none"
        minigameRewards={[]}
        treasureHuntStatus="round-limit"
        state={shopState}
        actions={{} as ShopActions}
        stageCalculations={{
          stageRuns: empty,
          unobtainableTargets: empty,
          totalAp: 1234,
          firstClearAp: 0,
          questSweepAp: 1234,
          extraSweepAp: 0,
          totalApWithExtras: 1234,
          itemBreakdown: {
            fromFirstRun: empty,
            fromRepeatedRuns: empty,
            existing: empty,
            fromShop: empty,
            toPlayMinigame: empty,
            toBuyShopItems: empty,
            fromMinigame: empty,
            remaining: empty,
          },
        }}
        signedIn={false}
      />,
    );

    expect(markup).toContain("목표 회차가 100회를 넘어 소탕 횟수와 필요 AP를 계산할 수 없어요.");
    expect(markup).not.toContain(">1,234<");
  });
});
