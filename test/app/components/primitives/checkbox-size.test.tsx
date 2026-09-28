import { describe, expect, it } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Checkbox from "~/components/primitives/Checkbox";

describe("Checkbox sizing", () => {
  it("keeps its 16px control from shrinking beside long labels", () => {
    const markup = renderToStaticMarkup(
      createElement(Checkbox, {
        checked: false,
        label: createElement("span", null, "모집 · 150회 계정에 모집 목표가 저장되어 있어요."),
      }),
    );

    expect(markup).toContain('class="size-4 shrink-0 rounded-sm');
  });
});
