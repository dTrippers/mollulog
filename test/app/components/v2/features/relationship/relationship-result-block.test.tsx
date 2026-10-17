import { describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";


import { RelationshipResultBlock } from "~/components/v2/features/relationship/RelationshipResultBlock";
import type { RelationshipShortfallRow } from "~/domain/relationship-gifts";

const rows: RelationshipShortfallRow[] = [
  {
    exp: 240,
    quantity: 102,
    gifts: [{ favorited: false, favoriteLevel: 4, exp: 240, item: { uid: "5996", name: "gift", rarity: 4 } }],
  },
  {
    exp: 180,
    quantity: 135,
    gifts: [{ favorited: true, favoriteLevel: 3, exp: 180, item: { uid: "5103", name: "gift 180", rarity: 4 } }],
  },
  {
    exp: 60,
    quantity: 405,
    gifts: [
      { favorited: true, favoriteLevel: 3, exp: 60, item: { uid: "5017", name: "gift 60", rarity: 3 } },
      { favorited: false, favoriteLevel: 3, exp: 60, item: { uid: "5998", name: "common gift", rarity: 4 } },
    ],
  },
];

function renderResult(overrides: Partial<Parameters<typeof RelationshipResultBlock>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(RelationshipResultBlock, {
      rankInputs: null,
      state: "ready",
      result: { expectedLevel: 27, nextRankExp: 115, remainingExp: 24_270, excessExp: 0, reached: false },
      targetLevel: 50,
      shortfallRows: rows,
      inventoryMode: false,
      excludeOtherStudents: false,
      pendingMessage: "현재 랭크를 입력하면 계산할 수 있어요.",
      onRetry: () => undefined,
      ...overrides,
    }),
  );
}

describe("RelationshipResultBlock", () => {
  it("shows both post-gift metrics and the shortfall rows in one result block", () => {
    const markup = renderResult();
    expect(markup).toContain("도달 랭크");
    expect(markup).toContain("다음 랭크까지 115 EXP");
    expect(markup).toContain("목표 50랭크까지");
    expect(markup).toContain("24,270");
    for (const quantity of [102, 135, 405]) {
      expect(markup).toMatch(new RegExp(`>${quantity}<span[^>]*>개</span>`));
    }
    expect(markup).not.toContain('>-<');
    expect(markup).toContain('aria-label="gift, 희귀도 4"');
  });

  it("renders actual EXP tiers, including the 80 and 40 EXP tiers", () => {
    const fourTierRows: RelationshipShortfallRow[] = [240, 180, 80, 60, 40].map((exp) => ({
      exp,
      quantity: Math.ceil(12_345 / exp),
      gifts: [
        {
          favorited: true,
          favoriteLevel: 3,
          exp,
          item: { uid: `gift-${exp}`, name: `gift ${exp}`, rarity: exp > 100 ? 4 : 3 },
        },
      ],
    }));
    const markup = renderResult({ shortfallRows: fourTierRows });

    for (const exp of [240, 180, 80, 60, 40]) {
      expect(markup).toContain(`${exp} EXP`);
    }
  });

  it.each([5, 8])("shows up to five gift icons and counts the remainder for %i gifts", (count) => {
    const gifts = Array.from({ length: count }, (_, index) => ({
      favorited: true,
      favoriteLevel: 2,
      exp: 40,
      item: { uid: String(5000 + index), name: `gift ${index + 1}`, rarity: 3 },
    }));
    const markup = renderResult({ shortfallRows: [{ exp: 40, quantity: 607, gifts }] });
    expect(markup.match(/role="img" aria-label="gift /g)).toHaveLength(5);
    if (count > 5) {
      expect(markup).toContain(`외 ${count - 5}개`);
      expect(markup).not.toContain('aria-label="gift 6,');
    } else {
      expect(markup).not.toContain("외 ");
    }
  });

  it("shows inventory-only context without repeated calculator copy", () => {
    const markup = renderResult({ inventoryMode: true, excludeOtherStudents: true });
    expect(markup).toContain("보유 선물 기준 · 다른 학생 배정분 제외");
    expect(markup).not.toContain("선택한 선물을 더하면");
  });

  it("uses reached state copy and hides shortfall rows and activity counts", () => {
    const markup = renderResult({
      result: { expectedLevel: 50, nextRankExp: 0, remainingExp: 0, excessExp: 260, reached: true },
    });
    expect(markup).toContain("도달 완료");
    expect(markup).toContain("목표 50랭크 · 260 EXP 초과");
    expect(markup).toContain("목표 랭크에 도달해서 더 필요한 선물이 없어요.");
    expect(markup).not.toContain("한 종류로만 채울 때");
    expect(markup).not.toContain("카페");
    expect(markup).not.toContain("스케줄");
    expect(markup).not.toContain("102개");
  });

  it("states missing inputs by name without rendering a dash", () => {
    const markup = renderResult({ result: null, pendingMessage: "현재 랭크와 목표 랭크를 입력하면 계산할 수 있어요." });
    expect(markup).toContain("현재 랭크와 목표 랭크를 입력하면 계산할 수 있어요.");
    expect(markup).not.toContain('>-<');
    expect(markup).not.toContain("계산할 수 없어요.");
  });

  it("distinguishes loading and recoverable error states", () => {
    const loading = renderResult({ state: "loading", result: null });
    const failure = renderResult({ state: "error", result: null });
    expect(loading).toContain("계산 결과 불러오는 중");
    expect(failure).toContain("선물 정보를 불러오지 못해 계산할 수 없어요.");
    expect(failure).toContain("다시 시도");
    expect(failure).not.toContain("BAQL");
  });

  it("labels the maximum rank without inventing a next-rank amount", () => {
    const markup = renderResult({
      result: { expectedLevel: 100, nextRankExp: null, remainingExp: 0, excessExp: 0, reached: true },
      targetLevel: 100,
    });
    expect(markup).toContain("최고 랭크");
    expect(markup).not.toContain("다음 랭크까지 0 EXP");
  });
});
