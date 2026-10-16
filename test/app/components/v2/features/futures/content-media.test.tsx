/**
 * @jest-environment jsdom
 */
import "../../layout/layout-test-polyfills";
import { describe, expect, it } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContentMedia } from "~/components/v2/features/futures/ContentMedia";
import { eventIconImageUrl } from "~/models/assets";

const contentUid = "event-1";
const typeLabel = "이벤트";

function renderLogo() {
  return render(
    <ContentMedia source={{ kind: "logo", contentUid }} contentType="main_story" typeLabel={typeLabel} size="row" />,
  );
}

describe("ContentMedia logo fallback", () => {
  it("tries the Japanese logo after the Korean logo fails", () => {
    const { container } = renderLogo();
    const image = container.querySelector("img") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe(eventIconImageUrl(contentUid, "kr"));

    fireEvent.error(image);

    expect(container.querySelector("img")?.getAttribute("src")).toBe(eventIconImageUrl(contentUid, "jp"));
    expect(screen.queryByRole("img", { name: typeLabel })).toBeNull();
  });

  it("shows the type icon once the Japanese logo fails too", () => {
    const { container } = renderLogo();
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: typeLabel })).toBeTruthy();
  });

  it("keeps the neutral fill while the logo loads and drops it once the logo loads", () => {
    const { container } = renderLogo();
    const image = container.querySelector("img") as HTMLImageElement;
    expect(image.parentElement?.classList.contains("bg-v2-inset")).toBe(true);

    fireEvent.load(image);

    expect(image.parentElement?.classList.contains("bg-v2-inset")).toBe(false);
  });

  it("keeps the neutral fill behind the type icon", () => {
    const { container } = renderLogo();
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(screen.getByRole("img", { name: typeLabel }).classList.contains("bg-v2-inset")).toBe(true);
  });
});
