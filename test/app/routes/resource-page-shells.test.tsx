import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("~/components/features/layout", () => ({ Page: jest.fn(() => null) }));
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useActionData: jest.fn(),
    useLoaderData: jest.fn(),
    useOutletContext: jest.fn(),
  };
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useActionData, useLoaderData, useOutletContext } from "react-router";
import { Page } from "~/components/features/layout";
import ResourceFarmingPage, { meta as farmingMeta } from "~/routes/utils.resources.farming";
import ResourceInventoryPage, { meta as inventoryMeta } from "~/routes/utils.resources.inventory";

const mockPage = Page as unknown as jest.Mock;
const mockUseActionData = useActionData as unknown as jest.Mock;
const mockUseLoaderData = useLoaderData as unknown as jest.Mock;
const mockUseOutletContext = useOutletContext as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockUseActionData.mockReturnValue(undefined);
});

describe("split resource planner page shells", () => {
  it("renders the inventory page with the farming counterpart first and no screen selector", () => {
    mockUseLoaderData.mockReturnValue({
      resources: [],
      ownedQuantities: {},
      relationshipGiftRequirements: { items: [], characterExp: 0, credit: 0, skillUnavailable: false },
    });
    mockUseOutletContext.mockReturnValue({
      managedStudents: [],
      resourceInventoryFilter: {},
      setResourceInventoryFilter: jest.fn(),
    });

    renderToStaticMarkup(createElement(ResourceInventoryPage));
    const page = mockPage.mock.calls.at(-1)?.[0] as {
      title: string;
      description: string;
      contentWidth: string;
      screens?: unknown;
      panels: Array<{ title: string }>;
      links: Array<{ title: string; to: string }>;
    };

    expect(page).toMatchObject({
      title: "재화 플래너",
      description: "각 재화의 보유·필요 수량을 관리해요",
      contentWidth: "full",
    });
    expect(page.panels.map(({ title }) => title)).toEqual(["검색 및 필터"]);
    expect(page.links.map(({ title, to }) => [title, to])).toEqual([
      ["파밍 계산기", "/utils/resources/farming"],
      ["스크린샷 인식기", "/scanner/resource"],
      ["학생 성장 플래너", "/utils/growth/students"],
    ]);
    expect(page.screens).toBeUndefined();
    expect(inventoryMeta({} as never)).toContainEqual({ title: "재화 플래너 | 몰루로그" });
  });

  it("renders the farming page with the inventory counterpart first and no screen selector", () => {
    mockUseLoaderData.mockReturnValue({ ownedQuantities: {}, stages: [] });
    mockUseOutletContext.mockReturnValue({
      managedStudents: [],
      farmingStageFilter: { showNormal: true, showHard: false, prioritizeHighTier: false },
      setFarmingSettings: jest.fn(),
    });

    renderToStaticMarkup(createElement(ResourceFarmingPage));
    const page = mockPage.mock.calls.at(-1)?.[0] as {
      title: string;
      description: string;
      contentWidth: string;
      screens?: unknown;
      panels: Array<{ title: string }>;
      links: Array<{ title: string; to: string }>;
    };

    expect(page).toMatchObject({
      title: "파밍 계산기",
      description: "필요 장비를 얻기 위한 스테이지를 확인해요",
      contentWidth: "full",
    });
    expect(page.panels.map(({ title }) => title)).toEqual(["계산 설정"]);
    expect(page.links.map(({ title, to }) => [title, to])).toEqual([
      ["재화 플래너", "/utils/resources/inventory"],
      ["스크린샷 인식기", "/scanner/resource"],
      ["학생 성장 플래너", "/utils/growth/students"],
    ]);
    expect(page.screens).toBeUndefined();
    expect(farmingMeta({} as never)).toContainEqual({ title: "파밍 계산기 | 몰루로그" });
  });
});
