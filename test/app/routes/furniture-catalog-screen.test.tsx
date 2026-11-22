/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FurnitureCatalogView } from "~/domain/furniture-catalog-view";
import type { FurnitureInventoryActionResult } from "~/routes/furniture._components/action-data";
import {
  FURNITURE_CATALOG_STORAGE_KEY,
  FURNITURE_INPUT_ERROR_MESSAGES,
  getFurnitureQuantityAriaDescription,
  getFurnitureQuantityInputError,
  readStoredFurnitureCatalogState,
  writeStoredFurnitureCatalogState,
} from "~/routes/furniture._components/furniture-state";
import { installLayoutTestEnv } from "../components/v2/layout/layout-test-env";

let mockSearchParams = new URLSearchParams();
const mockNavigate = jest.fn();
const mockRevalidate = jest.fn();
let mockRevalidatorState: "idle" | "loading" = "idle";
const mockFetcherSubmit = jest.fn();
let mockFetcherState: "idle" | "submitting" | "loading" = "idle";
let mockFetcherData: FurnitureInventoryActionResult | undefined;

jest.mock("react-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    Link: ({ to, children, viewTransition: _vt, prefetch: _pf, ...props }: { to: string; children: ReactNode; viewTransition?: boolean; prefetch?: string }) =>
      React.createElement("a", { ...props, href: to }, children),
    useLocation: () => ({
      pathname: "/furniture",
      search: mockSearchParams.toString() ? `?${mockSearchParams.toString()}` : "",
      hash: "",
      key: "test-key",
    }),
    useNavigationType: () => "PUSH",
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams, jest.fn()],
    useRevalidator: () => ({ state: mockRevalidatorState, revalidate: mockRevalidate }),
    useFetcher: () => ({
      state: mockFetcherState,
      data: mockFetcherData,
      submit: mockFetcherSubmit,
    }),
  };
});

jest.mock("~/lib/google-analytics-events.client", () => ({
  getGoogleAnalyticsResultBucket: () => "1-9",
  trackGoogleAnalyticsEvent: jest.fn(),
  trackGoogleAnalyticsEventOncePerPage: jest.fn(),
}));

import FurnitureCatalogScreen from "~/routes/furniture._components/FurnitureCatalogScreen";

function createSampleView(overrides: Partial<FurnitureCatalogView> = {}): FurnitureCatalogView {
  const chair = {
    uid: "chair-1",
    name: "핑크색 심플 스툴",
    category: "furnitures" as const,
    subCategory: null,
    tags: [],
    rarity: 2 as const,
    imageUrl: "https://assets.test/chair.webp",
    themeUid: "theme-1",
    themeUids: ["theme-1"],
    interactionStudents: [{ uid: "s-1", name: "우타하(응원단)" }],
    quantity: 2,
    status: "owned" as const,
  };
  const lamp = {
    uid: "lamp-1",
    name: "아케이드 네온 전광판",
    category: "decorations" as const,
    subCategory: null,
    tags: [],
    rarity: 4 as const,
    imageUrl: "https://assets.test/lamp.webp",
    themeUid: "theme-1",
    themeUids: ["theme-1"],
    interactionStudents: [],
    quantity: null,
    status: "unregistered" as const,
  };
  const emptyTheme = {
    uid: "theme-empty",
    name: "빈 테마 세트",
    description: null,
    previews: [],
    furnitureUids: [],
    items: [],
    progress: { ownedKinds: 0, notOwnedKinds: 0, unregisteredKinds: 0, totalKinds: 0 },
  };
  const arcadeTheme = {
    uid: "theme-1",
    name: "젤리즈 오락실 세트",
    description: null,
    previews: [
      {
        uid: "preview-1",
        title: "젤리즈 오락실 세트 대표 이미지",
        thumbnailUrl: "https://assets.test/theme-thumb.webp",
        imageUrl: "https://assets.test/theme-full.webp",
      },
    ],
    furnitureUids: ["chair-1", "lamp-1"],
    items: [chair, lamp],
    progress: { ownedKinds: 1, notOwnedKinds: 0, unregisteredKinds: 1, totalKinds: 2 },
  };
  return {
    themes: [arcadeTheme, emptyTheme],
    items: [chair, lamp],
    ownedQuantities: { "chair-1": 2 },
    ...overrides,
  };
}

describe("furniture-state helpers", () => {
  it("classifies the three input error causes distinctly", () => {
    expect(getFurnitureQuantityInputError("", { hasStoredQuantity: false })).toBeNull();
    expect(getFurnitureQuantityInputError("", { hasStoredQuantity: true })).toBe(
      FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded,
    );
    expect(getFurnitureQuantityInputError("1.5", { hasStoredQuantity: false })).toBe(
      FURNITURE_INPUT_ERROR_MESSAGES.notNonNegativeInteger,
    );
    expect(getFurnitureQuantityInputError("-1", { hasStoredQuantity: true })).toBe(
      FURNITURE_INPUT_ERROR_MESSAGES.notNonNegativeInteger,
    );
    expect(getFurnitureQuantityInputError("2147483648", { hasStoredQuantity: false })).toBe(
      FURNITURE_INPUT_ERROR_MESSAGES.exceedsMax,
    );
    expect(getFurnitureQuantityInputError("0", { hasStoredQuantity: false })).toBeNull();
    expect(getFurnitureQuantityInputError("2147483647", { hasStoredQuantity: true })).toBeNull();
  });

  it("uses the error message as aria-description when an error exists, and unregistered text only without error", () => {
    expect(getFurnitureQuantityAriaDescription({ draftValue: "", errorMessage: null })).toBe(
      "미등록 상태예요. 수량을 확인한 뒤 0 이상으로 입력해 주세요.",
    );
    expect(
      getFurnitureQuantityAriaDescription({
        draftValue: "",
        errorMessage: FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded,
      }),
    ).toBe(FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded);
    expect(getFurnitureQuantityAriaDescription({ draftValue: "0", errorMessage: null })).toBe(
      "확인된 미보유 상태예요.",
    );
    expect(getFurnitureQuantityAriaDescription({ draftValue: "3", errorMessage: null })).toBe("보유 수량이에요.");
    expect(
      getFurnitureQuantityAriaDescription({
        draftValue: "12",
        errorMessage: FURNITURE_INPUT_ERROR_MESSAGES.saveFailed,
      }),
    ).toBe(FURNITURE_INPUT_ERROR_MESSAGES.saveFailed);
  });

  it("persists mode and filters in storage and never stores query", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    writeStoredFurnitureCatalogState(
      {
        mode: "all",
        categories: ["furnitures"],
        rarities: [4],
        onlyWithInteractionStudents: true,
      },
      storage,
    );
    expect(readStoredFurnitureCatalogState(storage)).toEqual({
      mode: "all",
      categories: ["furnitures"],
      rarities: [4],
      onlyWithInteractionStudents: true,
    });
    expect(store.get(FURNITURE_CATALOG_STORAGE_KEY)).not.toContain("query");
  });
});

describe("FurnitureCatalogScreen state branches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installLayoutTestEnv();
    window.localStorage.clear();
    mockSearchParams = new URLSearchParams();
    mockRevalidatorState = "idle";
    mockFetcherState = "idle";
    mockFetcherData = undefined;
  });

  it("renders load failure distinctly and disables search controls", () => {
    render(<FurnitureCatalogScreen view={null} signedIn={false} loadError="가구 도감을 불러오지 못했어요." />);

    expect(screen.getByRole("alert").textContent).toContain("가구 도감을 불러오지 못했어요.");
    const retryButton = screen.getByRole("button", { name: "다시 시도" });
    fireEvent.click(retryButton);
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "검색" }).hasAttribute("disabled")).toBe(true);
  });

  it("disables retry button with loading label while revalidating", () => {
    mockRevalidatorState = "loading";
    render(<FurnitureCatalogScreen view={null} signedIn={false} loadError="가구 도감을 불러오지 못했어요." />);

    const button = screen.getByRole("button", { name: "불러오는 중..." });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("renders empty catalog data state without description line and disables search", () => {
    render(
      <FurnitureCatalogScreen
        view={{ themes: [], items: [], ownedQuantities: {} }}
        signedIn
        loadError={null}
      />,
    );

    expect(screen.getByText("가구 정보가 아직 없어요.")).toBeTruthy();
    expect(screen.queryByText("가구 데이터를 불러왔지만 등록된 가구가 없습니다.")).toBeNull();
    expect(screen.getByRole("button", { name: "검색" }).hasAttribute("disabled")).toBe(true);
  });

  it("renders missing theme URL state with back link and button", () => {
    mockSearchParams = new URLSearchParams("theme=unknown-999");
    render(<FurnitureCatalogScreen view={createSampleView()} signedIn={false} loadError={null} />);

    expect(screen.getByText("테마를 찾을 수 없어요.")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "테마 목록" });
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0]?.getAttribute("href")).toBe("/furniture");
  });

  it("renders signed-out CTA with updated copy linking to /edit?auth_error=signin_required", () => {
    render(<FurnitureCatalogScreen view={createSampleView()} signedIn={false} loadError={null} />);

    const cta = screen.getByRole("link", { name: "로그인 후 보유 수량 기록" });
    expect(cta.getAttribute("href")).toBe("/edit?auth_error=signin_required");
    expect(screen.getByText("대표 이미지 없음")).toBeTruthy();
  });

  it("renders theme detail with theme name as heading, category counts, and empty theme state", () => {
    mockSearchParams = new URLSearchParams("theme=theme-1");
    const { rerender } = render(<FurnitureCatalogScreen view={createSampleView()} signedIn loadError={null} />);

    expect(screen.getByRole("heading", { level: 1, name: "젤리즈 오락실 세트" })).toBeTruthy();
    expect(screen.getAllByText("보유 1/2종").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("1종")).toHaveLength(2);

    mockSearchParams = new URLSearchParams("theme=theme-empty");
    rerender(<FurnitureCatalogScreen view={createSampleView()} signedIn loadError={null} />);
    expect(screen.getByText("이 테마에 등록된 가구가 없어요.")).toBeTruthy();
  });

  it("restores stored all-furniture mode and filters after mount without restoring search query", () => {
    writeStoredFurnitureCatalogState({
      mode: "all",
      categories: ["furnitures"],
      rarities: [],
      onlyWithInteractionStudents: true,
    });
    render(<FurnitureCatalogScreen view={createSampleView()} signedIn={false} loadError={null} />);

    expect(screen.getByText("핑크색 심플 스툴")).toBeTruthy();
    expect(screen.queryByText("아케이드 네온 전광판")).toBeNull();
    expect(screen.getAllByText("전체 2종 중 1종 표시 중").length).toBeGreaterThanOrEqual(1);
  });

  it("matches aria-description to the empty-recorded error when clearing a recorded furniture", () => {
    mockSearchParams = new URLSearchParams("theme=theme-1");
    render(<FurnitureCatalogScreen view={createSampleView()} signedIn loadError={null} />);

    const input = screen.getByLabelText("핑크색 심플 스툴 보유 수량");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "" } });

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-description")).toBe(FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded);
    expect(screen.getByRole("alert").textContent).toContain(FURNITURE_INPUT_ERROR_MESSAGES.emptyRecorded);
  });

  it("shows SaveToast saving, saved, and failed states with retry for failed saves", () => {
    jest.useFakeTimers();
    try {
      mockSearchParams = new URLSearchParams("theme=theme-1");
      const { rerender } = render(<FurnitureCatalogScreen view={createSampleView()} signedIn loadError={null} />);

      const input = screen.getByLabelText("아케이드 네온 전광판 보유 수량");
      fireEvent.change(input, { target: { value: "3" } });
      // A value waiting for its debounce already shows the saving toast.
      expect(screen.getByRole("status").textContent).toContain("저장 중...");
      expect(mockFetcherSubmit).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(450);
      });
      expect(mockFetcherSubmit).toHaveBeenCalledTimes(1);
      expect(mockFetcherSubmit.mock.calls[0]?.[1]).toEqual({
        action: "/furniture",
        method: "post",
        encType: "application/json",
      });
      const submittedBody = mockFetcherSubmit.mock.calls[0]?.[0] as { requestId: string };
      expect(screen.getByRole("status").textContent).toContain("저장 중...");

      // Simulate server save failure
      mockFetcherState = "submitting";
      rerender(<FurnitureCatalogScreen view={createSampleView()} signedIn loadError={null} />);
      mockFetcherState = "idle";
      mockFetcherData = { ok: false, requestId: submittedBody.requestId, error: "internal db error" };
      rerender(<FurnitureCatalogScreen view={createSampleView()} signedIn loadError={null} />);

      expect(screen.getByRole("alert").textContent).toContain("저장하지 못했어요");
      expect(input.getAttribute("aria-description")).toBe("저장하지 못했어요.");

      // Retry from SaveToast
      fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
      expect(mockFetcherSubmit).toHaveBeenCalledTimes(2);
      const retryBody = mockFetcherSubmit.mock.calls[1]?.[0] as { requestId: string };

      mockFetcherState = "submitting";
      rerender(<FurnitureCatalogScreen view={createSampleView()} signedIn loadError={null} />);
      mockFetcherState = "idle";
      mockFetcherData = { ok: true, requestId: retryBody.requestId, quantities: { "lamp-1": 3 } };
      rerender(<FurnitureCatalogScreen view={createSampleView()} signedIn loadError={null} />);

      expect(screen.getByRole("status").textContent).toContain("저장됨");
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
