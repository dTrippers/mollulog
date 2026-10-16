/**
 * @jest-environment jsdom
 */
import "../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";
import Index from "~/routes/_index";

// The loader's server modules are not needed here: the test renders the page from its own loader data.
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/auth/preference.server", () => ({ getPreference: jest.fn() }));
jest.mock("~/lib/observability.server", () => ({ getLogger: jest.fn() }));
jest.mock("~/models/community.server", () => ({ getCommunityFeedPage: jest.fn(), upsertYoutubeVideoCommunityPost: jest.fn() }));
jest.mock("~/models/favorite-students", () => ({ getUserFavoritedStudents: jest.fn() }));
jest.mock("~/models/recruitment-result.server", () => ({ getRecruitmentResultsByRecruitmentGroupUids: jest.fn() }));
jest.mock("~/models/youtube", () => ({ getHomeYoutubeChannelLinks: jest.fn(() => []), getHomeYoutubeSections: jest.fn() }));
jest.mock("~/views/community.server", () => ({ enrichCommunityFeedPosts: jest.fn() }));
jest.mock("~/views/home", () => ({
  getHomeBirthdaySource: jest.fn(),
  getHomeFavoritedCounts: jest.fn(),
  getIndexContents: jest.fn(),
}));

// A deferred source that never settles in time: React Router rejects it with a timeout. The rejection is marked handled
// up front, so the test controls only what the page renders.
function timedOut<T>(): Promise<T> {
  const promise = Promise.reject(new Error("Server Timeout"));
  promise.catch(() => {});
  return promise as Promise<T>;
}

const NOW = "2026-10-16T03:00:00.000Z";

const healthyContents = {
  events: { status: "success", data: { main: null, together: [], upcoming: null, minigameType: null } },
  recruitmentGroups: { status: "success", data: [] },
  raids: { status: "success", data: { total: { ongoing: [], upcoming: null }, unlimit: { ongoing: [], upcoming: null } } },
  overview: {
    campaigns: { status: "success", data: [] },
    jointFiringDrills: { status: "success", data: [] },
    mainStoryContent: { status: "success", data: null },
  },
  news: { status: "success", data: [] },
};

function loaderData(overrides: Record<string, unknown> = {}) {
  return {
    accountLeft: false,
    signedIn: false,
    now: NOW,
    contents: Promise.resolve(healthyContents),
    viewer: Promise.resolve({
      favorites: { status: "available", value: [] },
      results: { status: "available", value: [] },
    }),
    favoritedCounts: Promise.resolve({ status: "success", data: [] }),
    birthdays: Promise.resolve({
      status: "success",
      data: [{ uid: "26002", name: "주리", monthDay: "10-20", daysUntil: 4 }],
    }),
    feed: Promise.resolve({ status: "success", posts: [] }),
    youtube: Promise.resolve({ status: "success", sections: [] }),
    youtubeChannels: [{ key: "kr", url: "https://www.youtube.com/@bluearchive_kr" }],
    ...overrides,
  };
}

function renderHome(data: ReturnType<typeof loaderData>) {
  const router = createMemoryRouter(
    [{ path: "/", Component: Index, HydrateFallback: () => null, loader: () => data }],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("home route with deferred sources that reject", () => {
  beforeEach(() => {
    installLayoutTestEnv();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the page and the birthdays when the main contents time out, and shows every main section as failed", async () => {
    renderHome(loaderData({ contents: timedOut() }));

    expect(await screen.findByRole("heading", { name: "진행 중인 컨텐츠" })).toBeTruthy();
    // The other deferred source still renders its own section.
    expect(await screen.findByText("주리")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "다가오는 생일" })).toBeTruthy();
    // Each main section shows its failure state, with a retry.
    expect(screen.getByRole("heading", { name: "이벤트" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "학생 모집" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "레이드" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "그 외 컨텐츠" })).toBeTruthy();
    expect(screen.getAllByText("일정을 불러오지 못했어요").length).toBeGreaterThanOrEqual(4);
    const retryButtons = screen.getAllByRole("button", { name: /다시 시도/ });
    expect(retryButtons.length).toBeGreaterThanOrEqual(4);
    // The retry's left padding is pulled back, so its icon lines up with the tile text.
    expect(retryButtons.every((button) => button.className.includes("-ml-3"))).toBe(true);
    // No raw error text reaches the page.
    expect(document.body.textContent).not.toMatch(/Server Timeout|Unexpected Application Error/);
  });

  it("keeps the header link's 44px hit box without moving its text up", async () => {
    renderHome(loaderData({ contents: timedOut() }));

    const link = await screen.findByRole("link", { name: /전체 일정/ });
    expect(link.className).toContain("min-h-11");
    // The negative vertical margin is gone: it pulled the text up by the margin amount.
    expect(link.className).not.toContain("-my-3");
    // On desktop the bottom padding centers the text in the 36px box it had before.
    expect(link.className).toContain("md:pb-2");
  });

  it("shows the section and aside skeletons with their real titles while the sources are still loading", async () => {
    const pending = () => new Promise(() => {});
    renderHome(loaderData({ contents: pending(), feed: pending(), youtube: pending() }));

    expect(await screen.findByRole("link", { name: /전체 일정/ })).toBeTruthy();
    // The skeleton is hidden from assistive technology, so its titles are read from the text.
    for (const title of ["이벤트", "학생 모집", "레이드", "그 외 컨텐츠", "다가오는 생일", "몰루로그 소식"]) {
      const heading = screen.getByText(title);
      expect(heading.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(screen.getByText("공식 유튜브 최근 영상").closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText("최근 피드").closest('[aria-hidden="true"]')).not.toBeNull();
    // A loading state shows no failure copy.
    expect(screen.queryByText("일정을 불러오지 못했어요")).toBeNull();
  });

  it("shows the birthday failure and the rest of the page when the birthdays time out", async () => {
    renderHome(loaderData({ birthdays: timedOut() }));

    expect(await screen.findByRole("heading", { name: "다가오는 생일" })).toBeTruthy();
    expect(await screen.findByText("일정을 불러오지 못했어요")).toBeTruthy();
    // The news block is part of the same bottom section and still renders.
    expect(screen.getByRole("heading", { name: "몰루로그 소식" })).toBeTruthy();
    expect(screen.getByText("등록된 소식이 없어요")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Server Timeout|Unexpected Application Error/);
  });

  it("shows the feed and YouTube failure copy, and keeps the channel links, when those sources time out", async () => {
    renderHome(loaderData({ feed: timedOut(), youtube: timedOut() }));

    expect(await screen.findByText("최근 피드를 불러오지 못했어요")).toBeTruthy();
    expect(await screen.findByText("최근 영상을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("link", { name: /한국 공식 채널/ }).getAttribute("href")).toBe(
      "https://www.youtube.com/@bluearchive_kr",
    );
    expect(document.body.textContent).not.toMatch(/Server Timeout|Unexpected Application Error/);
  });

  it("shows the viewer notice when the viewer state times out, and the recruitment block stays", async () => {
    renderHome(loaderData({ viewer: timedOut() }));

    expect(await screen.findByText("관심 학생과 모집 기록을 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "학생 모집" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Server Timeout|Unexpected Application Error/);
  });
});
