/**
 * @jest-environment jsdom
 */
import "../../components/v2/layout/layout-test-polyfills";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { V2Page } from "~/components/v2/layout";
import { installLayoutTestEnv } from "../../components/v2/layout/layout-test-env";
import { RelationshipGiftScreen } from "~/routes/utils.relationship._components/RelationshipGiftScreen";
import type { AllFavoriteItemsLoad } from "~/routes/utils.relationship._components/relationship-types";

const mockRevalidate = jest.fn<() => void>();
const readyItems = Promise.resolve({ status: "ready" as const, items: [] });

jest.mock("react-router", () => ({
  ...jest.requireActual<typeof import("react-router")>("react-router"),
  useRevalidator: () => ({ revalidate: mockRevalidate }),
}));

function rejectedLoad(): Promise<AllFavoriteItemsLoad> {
  const promise = Promise.reject(new Error("Server Timeout"));
  promise.catch(() => undefined);
  return promise;
}

function GiftScreenRoute() {
  const [items, setItems] = useState<Promise<AllFavoriteItemsLoad>>(rejectedLoad);
  mockRevalidate.mockImplementation(() => setItems(Promise.resolve({ status: "ready", items: [] })));
  return (
    <V2Page width="wide">
      <RelationshipGiftScreen
        items={items}
        students={[]}
        isAuthenticated={false}
        ownedQuantities={null}
        writeMode="legacy"
        staleWriteBlocked={false}
        commonItemUids={[]}
        onStaleWriteBlocked={() => undefined}
        onStudentItemsSaved={() => undefined}
        stacked={false}
        onChooseAnotherGift={() => undefined}
        onClosePanel={() => undefined}
      />
    </V2Page>
  );
}

function ReadyGiftScreenRoute({ stacked = true }: { stacked?: boolean }) {
  return (
    <V2Page width="wide">
      <RelationshipGiftScreen
        items={readyItems}
        students={[]}
        isAuthenticated={false}
        ownedQuantities={null}
        writeMode="legacy"
        staleWriteBlocked={false}
        commonItemUids={[]}
        onStaleWriteBlocked={() => undefined}
        onStudentItemsSaved={() => undefined}
        stacked={stacked}
        onChooseAnotherGift={() => undefined}
        onClosePanel={() => undefined}
      />
    </V2Page>
  );
}

function DesktopReadyGiftScreenRoute() {
  return <ReadyGiftScreenRoute stacked={false} />;
}

function renderGiftScreen() {
  const router = createMemoryRouter([{ path: "/", Component: GiftScreenRoute, HydrateFallback: () => null }], {
    initialEntries: ["/"],
  });
  render(<RouterProvider router={router} />);
}

describe("RelationshipGiftScreen rejected deferred item loads", () => {
  beforeEach(() => {
    installLayoutTestEnv();
    mockRevalidate.mockReset();
  });

  it("shows an explicit failure for a rejected promise and recovers when retry revalidates", async () => {
    renderGiftScreen();

    expect(await screen.findAllByText("선물 정보를 불러오지 못했어요.")).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/Server Timeout|Unexpected Application Error/);

    fireEvent.click(screen.getAllByRole("button", { name: "다시 시도" })[0]!);
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("선물을 고르면 선호 학생과 수량을 볼 수 있어요.")).toBeTruthy();
    expect(screen.queryByText("선물 정보를 불러오지 못했어요.")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Server Timeout|Unexpected Application Error/);
  });

  it("keeps the unselected gift list responsive to the page container on first render", async () => {
    const router = createMemoryRouter(
      [{ path: "/", Component: ReadyGiftScreenRoute, HydrateFallback: () => null }],
      { initialEntries: ["/"] },
    );
    const { container } = render(<RouterProvider router={router} />);
    await screen.findByText("선물을 고르면 선호 학생과 수량을 볼 수 있어요.");

    const main = container.querySelector(".v2-main");
    const mobileGiftList = main?.querySelector('[class*="@min-[48rem]/page-available:hidden"]');
    const desktopGuidance = main?.querySelector('p[class*="@min-[48rem]/page-available:block"]');
    expect(mobileGiftList).toBeTruthy();
    expect(desktopGuidance?.textContent).toBe("선물을 고르면 선호 학생과 수량을 볼 수 있어요.");
    router.dispose();
  });

  it("unmounts the duplicate Main gift list after layout measures the page as unstacked", async () => {
    const router = createMemoryRouter(
      [{ path: "/", Component: DesktopReadyGiftScreenRoute, HydrateFallback: () => null }],
      { initialEntries: ["/"] },
    );
    const { container } = render(<RouterProvider router={router} />);
    await screen.findByText("선물을 고르면 선호 학생과 수량을 볼 수 있어요.");

    const main = container.querySelector(".v2-main");
    expect(main?.querySelector('[class*="@min-[48rem]/page-available:hidden"]')).toBeNull();
    expect(main?.querySelector('p[class*="@min-[48rem]/page-available:block"]')?.textContent).toBe(
      "선물을 고르면 선호 학생과 수량을 볼 수 있어요.",
    );
    router.dispose();
  });
});
