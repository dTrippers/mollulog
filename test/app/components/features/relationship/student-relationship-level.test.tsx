import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RequiredGifts from "~/components/features/relationship/RequiredGifts";
import StudentRelationshipLevel from "~/components/features/relationship/StudentRelationshipLevel";

describe("nullable relationship calculator presentation", () => {
  it("holds the summary when the current or target rank is missing", () => {
    const markup = renderToStaticMarkup(
      createElement(StudentRelationshipLevel, {
        currentExp: null,
        currentLevel: null,
        targetLevel: 50,
        studentName: "Test Student",
        nullableSemantics: true,
        selectedItemExp: 0,
        onCurrentLevelUpdate: () => undefined,
        onTargetLevelUpdate: () => undefined,
      }),
    );

    expect(markup).toContain('aria-label="Test Student 현재 랭크"');
    expect(markup).toContain('aria-label="Test Student 목표 랭크"');
    expect(markup).toContain('<fieldset');
    expect(markup).toContain('aria-label="계산 보류"');
    expect(markup).toContain('aria-hidden="true">-</span>');
    expect(markup).not.toContain("도달 완료");
  });

  it("dims all required gift quantities when the calculator is on hold", () => {
    const markup = renderToStaticMarkup(
      createElement(RequiredGifts, {
        currentExp: null,
        currentLevel: 20,
        targetLevel: null,
        nullableSemantics: true,
      }),
    );

    expect(markup.match(/aria-hidden="true">-<\/span>/g)).toHaveLength(8);
    expect(markup).toContain('<fieldset');
    expect(markup).toContain('aria-label="계산 보류"');
  });
});
