import { describe, expect, it } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server";
import ResourceCard from "~/components/primitives/ResourceCard";

describe("ResourceCard image accessible name", () => {
  it("preserves the existing image name for callers that do not pass imageAlt", () => {
    const markup = renderToStaticMarkup(
      <ResourceCard itemUid="existing-resource" name="기존 아이템 이름" imageUrl="/existing-resource.webp" />,
    );

    expect(markup).toContain('<img alt="아이템 이미지" src="/existing-resource.webp"');
  });

  it("allows road-puzzle callers to use the resource name as the image name", () => {
    const markup = renderToStaticMarkup(
      <ResourceCard
        itemUid="road-puzzle-resource"
        name="하이랜더 기념 스티커"
        imageAlt="하이랜더 기념 스티커"
        imageUrl="/road-puzzle-resource.webp"
      />,
    );

    expect(markup).toContain('<img alt="하이랜더 기념 스티커" src="/road-puzzle-resource.webp"');
  });
});
