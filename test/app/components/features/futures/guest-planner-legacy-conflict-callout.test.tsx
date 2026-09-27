import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import GuestPlannerLegacyConflictCallout from "~/components/features/futures/GuestPlannerLegacyConflictCallout";

const title = "이전 버전 화면에서 저장한 계획이 있어요";
const description =
  "이전 화면과 이 화면에서 같은 항목을 다르게 바꿨어요. 덮어쓰지 않았으니 내용을 확인하고 사용할 값을 선택해주세요.";

describe("GuestPlannerLegacyConflictCallout", () => {
  it("renders one shared warning without an action on the import page", () => {
    const markup = renderToStaticMarkup(createElement(GuestPlannerLegacyConflictCallout));

    expect(markup.split(title)).toHaveLength(2);
    expect(markup).toContain(description);
    expect(markup).toContain("bg-amber-500/10");
    expect(markup).toContain('class="mt-0.5 size-5 shrink-0"');
    expect(markup).not.toContain("내용 확인");
  });

  it("keeps the same warning and uses the same confirmation label wherever linked", () => {
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(GuestPlannerLegacyConflictCallout, { to: "/planner/import?from=planner" }),
      ),
    );

    expect(markup.split(title)).toHaveLength(2);
    expect(markup).toContain(description);
    expect(markup).toContain("내용 확인");
    expect(markup).toContain('href="/planner/import?from=planner"');
  });
});
