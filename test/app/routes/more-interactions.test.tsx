/** @jest-environment jsdom */
import "../components/v2/layout/layout-test-polyfills";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("react-router", () => {
  const actual = jest.requireActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useLoaderData: jest.fn(),
    useOutletContext: jest.fn(),
    useSubmit: jest.fn(),
    useRevalidator: jest.fn(() => ({ revalidate: jest.fn(), state: "idle" })),
  };
});
jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/views/more", () => ({ getMoreViewData: jest.fn() }));
jest.mock("~/lib/preference-submission.client", () => ({ submitPreference: jest.fn() }));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter, useLoaderData, useOutletContext, useSubmit } from "react-router";
import { submitPreference } from "~/lib/preference-submission.client";
import MoreIndexPage from "~/routes/more._index";

const mockUseLoaderData = useLoaderData as unknown as jest.Mock;
const mockUseOutletContext = useOutletContext as unknown as jest.Mock;
const mockUseSubmit = useSubmit as unknown as jest.Mock;
const mockSubmitPreference = submitPreference as unknown as jest.Mock<(...args: unknown[]) => Promise<unknown>>;

// jsdom has no PointerEvent, so a fired pointer event would lose its pointerType and every press would look like touch.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerType = init.pointerType ?? "";
  }
}
Object.defineProperty(window, "PointerEvent", { configurable: true, value: TestPointerEvent });

function renderMore(setMobileNavigationIds: jest.Mock) {
  mockUseLoaderData.mockReturnValue({ account: null, summary: null });
  mockUseOutletContext.mockReturnValue({
    currentUsername: null,
    isAdmin: false,
    darkMode: false,
    setDarkMode: jest.fn(),
    mobileNavigationIds: ["feed", "students"],
    setMobileNavigationIds,
    navigationBarContents: {
      upcomingEvent: null,
      hasRecentNews: false,
      hasOngoingRaid: false,
      hasActiveCoupons: false,
      hasUnconsumedCoupons: false,
      hasUnreadFeedbackReplies: false,
      unreadNotificationCount: 0,
      menuBadgeOverrides: {},
    },
  });
  mockUseSubmit.mockReturnValue(jest.fn());
  return render(createElement(MemoryRouter, null, createElement(MoreIndexPage)));
}

function preferenceResponse(ok: boolean) {
  return { json: async () => ({ ok }) };
}

describe("more screen bottom tab pins", () => {
  beforeEach(() => {
    mockSubmitPreference.mockReset();
  });

  it("applies a pin only after the save succeeds, and keeps the tabs when it fails", async () => {
    const setMobileNavigationIds = jest.fn();
    renderMore(setMobileNavigationIds);

    fireEvent.click(screen.getByRole("button", { name: "바꾸기" }));
    fireEvent.click(await screen.findByRole("button", { name: "이벤트" }));
    expect(await screen.findByText("이벤트 고정")).toBeTruthy();

    mockSubmitPreference.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getAllByRole("button", { name: /이 탭과 교체/ })[0]);
    expect(await screen.findByText("저장하지 못했어요.")).toBeTruthy();
    expect(setMobileNavigationIds).not.toHaveBeenCalled();

    mockSubmitPreference.mockResolvedValueOnce(preferenceResponse(false));
    fireEvent.click(screen.getAllByRole("button", { name: /이 탭과 교체/ })[0]);
    await waitFor(() => expect(mockSubmitPreference).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("저장하지 못했어요.")).toBeTruthy();
    expect(setMobileNavigationIds).not.toHaveBeenCalled();

    mockSubmitPreference.mockResolvedValueOnce(preferenceResponse(true));
    fireEvent.click(screen.getAllByRole("button", { name: /이 탭과 교체/ })[0]);
    await waitFor(() => expect(setMobileNavigationIds).toHaveBeenCalledWith(["events", "students"]));
    expect(mockSubmitPreference).toHaveBeenLastCalledWith({ mobileNavigationIds: ["events", "students"] });
  });

  it("does not offer a pinned menu again", async () => {
    renderMore(jest.fn());

    fireEvent.click(screen.getByRole("button", { name: "바꾸기" }));
    const pinned = await screen.findByRole("button", { name: "피드, 현재 3번째 하단 탭에 고정됨" });

    expect((pinned as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("more screen halo mode button", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockSubmitPreference.mockReset();
    mockSubmitPreference.mockResolvedValue(preferenceResponse(true));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("toggles on a tap without opening the tooltip", () => {
    renderMore(jest.fn());
    const button = screen.getByRole("button", { name: "헤일로 모드" });

    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);

    // The page has no halo mode provider here, so the toggle shows as the saved preference.
    expect(mockSubmitPreference).toHaveBeenCalledWith({ haloMode: true });
    expect(document.querySelectorAll("[data-placement]")).toHaveLength(0);
  });

  it("does not open the tooltip on a mouse press held as long as a touch hold", () => {
    renderMore(jest.fn());
    const button = screen.getByRole("button", { name: "헤일로 모드" });

    fireEvent.pointerDown(button, { pointerType: "mouse" });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    fireEvent.pointerUp(button, { pointerType: "mouse" });
    fireEvent.click(button);

    expect(mockSubmitPreference).toHaveBeenCalledWith({ haloMode: true });
  });

  it("opens the tooltip on a hold and does not toggle on its release", () => {
    renderMore(jest.fn());
    const button = screen.getByRole("button", { name: "헤일로 모드" });

    fireEvent.pointerDown(button, { pointerType: "touch" });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(document.querySelectorAll("[data-placement]")).toHaveLength(1);

    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(mockSubmitPreference).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(document.querySelectorAll("[data-placement]")).toHaveLength(0);
  });
});
