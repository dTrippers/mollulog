/**
 * @jest-environment jsdom
 */
import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { ResourceTypeEnum } from "~/graphql/graphql";

describe("ResourceThumb shop options", () => {
  it("shows a bottom-right quantity label and the requested rarity background", () => {
    const markup = renderToStaticMarkup(createElement(ResourceThumb, {
      itemUid: "item-1",
      resourceType: ResourceTypeEnum.Item,
      name: "이벤트 아이템",
      rarity: 4,
      label: "5",
      tooltip: true,
    }));

    expect(markup).toContain("이벤트 아이템");
    expect(markup).toContain("bg-v2-item-rarity-4");
    expect(markup).toContain("pr-1 pb-1");
    expect(markup).toContain("-right-1 -bottom-1");
    expect(markup).toContain(">5</span>");
  });

  it("renders bare payment thumbnails without a background or label gutter", () => {
    const markup = renderToStaticMarkup(createElement(ResourceThumb, {
      itemUid: "currency-1",
      resourceType: ResourceTypeEnum.Currency,
      name: "이벤트 재화",
      bare: true,
      tooltip: true,
    }));

    expect(markup).toContain('title="이벤트 재화"');
    expect(markup).not.toContain("bg-v2-inset");
    expect(markup).not.toContain("pr-1 pb-1");
  });

  it("keeps the existing thumbnail rendering unchanged when shop options are omitted", () => {
    const markup = renderToStaticMarkup(createElement(ResourceThumb, {
      itemUid: "item-1",
      name: "기존 아이템",
    }));

    expect(markup).toContain("bg-v2-inset");
    expect(markup).not.toContain("title=");
    expect(markup).not.toContain("role=\"tooltip\"");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("pr-1 pb-1");
  });

  it("shows the opt-in name tooltip on hover, focus, and tap, with tap toggling it", () => {
    render(
      createElement(ResourceThumb, {
        itemUid: "item-1",
        name: "이벤트 아이템",
        nameTooltip: true,
      }),
    );
    const thumb = screen.getByRole("button", { name: "이벤트 아이템 이름 표시" });

    fireEvent.pointerEnter(thumb, { pointerType: "mouse" });
    expect(screen.getByRole("tooltip").textContent).toBe("이벤트 아이템");
    fireEvent.pointerLeave(thumb, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.focus(thumb);
    expect(screen.getByRole("tooltip").textContent).toBe("이벤트 아이템");
    fireEvent.blur(thumb);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.click(thumb);
    expect(screen.getByRole("tooltip").textContent).toBe("이벤트 아이템");
    fireEvent.click(thumb);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.touchStart(thumb);
    fireEvent.focus(thumb);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(thumb);
    expect(screen.getByRole("tooltip").textContent).toBe("이벤트 아이템");
    fireEvent.touchStart(thumb);
    fireEvent.click(thumb);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
