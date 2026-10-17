/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { STUDENT_STATE_STALE_MESSAGE } from "~/domain/student-state-errors";


import { RelationshipStudentScreen } from "~/routes/utils.relationship._components/RelationshipStudentScreen";

const fetchMock = jest.fn<typeof fetch>();
const originalFetch = global.fetch;

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    json: async () => value,
  } as Response;
}

function renderStudentScreen(
  onSignIn = jest.fn(),
  options: {
    staleWriteBlocked?: boolean;
    saveError?: string | null;
    onRetry?: (() => void) | null;
    saveState?: "idle" | "pending" | "submitting" | "loading";
    saveSuccess?: boolean;
    isAuthenticated?: boolean;
    giftCalculationMode?: "manual" | "owned";
    onGiftCalculationModeChange?: (mode: "manual" | "owned") => void;
    ownedQuantities?: Record<string, number> | null;
    requiredQuantities?: Record<string, number>;
    quantityBreakdowns?: Record<string, { studentUid: string; name: string; quantity: number }[]>;
  } = {},
) {
  function StudentScreenHarness() {
    const [giftCalculationMode, setGiftCalculationMode] = useState(options.giftCalculationMode ?? "manual");
    return (
      <RelationshipStudentScreen
      student={{
        uid: "student-a",
        name: "테스트 학생",
        order: 1,
        currentLevel: 20,
        currentExp: null,
        targetLevel: 50,
        hasSavedState: true,
      }}
      isAuthenticated={options.isAuthenticated ?? false}
      nullableSemantics={false}
      relationship={{ currentLevel: 20, currentExp: null, targetLevel: 50, items: {} }}
      giftCalculationMode={giftCalculationMode}
      onGiftCalculationModeChange={options.onGiftCalculationModeChange ?? setGiftCalculationMode}
      saveState={options.saveState ?? "idle"}
      saveError={options.saveError ?? null}
      saveSuccess={options.saveSuccess ?? false}
      staleWriteBlocked={options.staleWriteBlocked ?? false}
      onRetry={options.onRetry ?? null}
      requiredQuantities={options.requiredQuantities ?? {}}
      quantityBreakdowns={options.quantityBreakdowns ?? {}}
      ownedQuantities={options.ownedQuantities ?? null}
      onRelationshipChange={() => undefined}
      onDelete={() => undefined}
      onSignIn={onSignIn}
      onChooseAnotherStudent={() => undefined}
      />
    );
  }
  return render(<StudentScreenHarness />);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("RelationshipStudentScreen gift data states", () => {
  it("replaces loading skeletons with an error and retries the student item request", async () => {
    fetchMock.mockRejectedValueOnce(new Error("private source failure"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ uid: "student-a", name: "테스트 학생", favoriteItems: [] }),
    );

    renderStudentScreen();
    expect(screen.getByLabelText("계산 결과 불러오는 중")).toBeTruthy();
    await screen.findByText("선물 목록을 불러오지 못했어요.");
    expect(screen.queryByLabelText("계산 결과 불러오는 중")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: "다시 시도" })[0]!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await screen.findByText("선물 정보가 없어요.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks guests to sign in before selecting the owned-gift calculation mode", () => {
    const onSignIn = jest.fn();
    renderStudentScreen(onSignIn);

    fireEvent.click(screen.getByRole("radio", { name: "보유 선물 기준" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radio", { name: "직접 입력" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "보유 선물 기준" }).getAttribute("aria-checked")).toBe("false");
  });

  it("moves authenticated users through the calculation radios with arrow keys", () => {
    renderStudentScreen(jest.fn(), { isAuthenticated: true });
    const manualMode = screen.getByRole("radio", { name: "직접 입력" });
    const ownedMode = screen.getByRole("radio", { name: "보유 선물 기준" });

    expect(manualMode.tabIndex).toBe(0);
    expect(ownedMode.tabIndex).toBe(-1);
    fireEvent.keyDown(manualMode, { key: "ArrowRight" });
    expect(ownedMode.getAttribute("aria-checked")).toBe("true");
    expect(ownedMode.tabIndex).toBe(0);
    expect(document.activeElement).toBe(ownedMode);

    fireEvent.keyDown(ownedMode, { key: "ArrowLeft" });
    expect(manualMode.getAttribute("aria-checked")).toBe("true");
    expect(manualMode.tabIndex).toBe(0);
    expect(document.activeElement).toBe(manualMode);
  });

  it("keeps focus and manual mode when a guest arrows toward owned gifts", () => {
    const onSignIn = jest.fn();
    renderStudentScreen(onSignIn);
    const manualMode = screen.getByRole("radio", { name: "직접 입력" });
    const ownedMode = screen.getByRole("radio", { name: "보유 선물 기준" });
    manualMode.focus();

    fireEvent.keyDown(manualMode, { key: "ArrowRight" });

    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("radio", { name: "직접 입력" }).getAttribute("aria-checked")).toBe("true");
    expect(ownedMode.getAttribute("aria-checked")).toBe("false");
    expect(document.activeElement).toBe(manualMode);
  });

  it("exposes the favorite-only filter as an on/off switch", () => {
    renderStudentScreen();
    const favoriteOnly = screen.getByRole("switch", { name: "좋아하는 선물만" });

    expect(favoriteOnly.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(favoriteOnly);
    expect(screen.getByRole("switch", { name: "좋아하는 선물만" }).getAttribute("aria-checked")).toBe("false");
  });

  it("keeps the route-owned gift mode when the student screen is remounted", async () => {
    function TabHarness() {
      const [tab, setTab] = useState<"student" | "gift">("student");
      const [mode, setMode] = useState<"manual" | "owned">("manual");
      return (
        <>
          <button onClick={() => setTab(tab === "student" ? "gift" : "student")}>탭 전환</button>
          {tab === "student" ? (
            <RelationshipStudentScreen
              student={{
                uid: "student-a",
                name: "테스트 학생",
                order: 1,
                currentLevel: 20,
                currentExp: null,
                targetLevel: 50,
                hasSavedState: true,
              }}
              isAuthenticated
              nullableSemantics={false}
              relationship={{ currentLevel: 20, currentExp: null, targetLevel: 50, items: {} }}
              giftCalculationMode={mode}
              onGiftCalculationModeChange={setMode}
              saveState="idle"
              saveError={null}
              saveSuccess={false}
              staleWriteBlocked={false}
              onRetry={null}
              requiredQuantities={{}}
              quantityBreakdowns={{}}
              ownedQuantities={{}}
              onRelationshipChange={() => undefined}
              onDelete={() => undefined}
              onSignIn={() => undefined}
              onChooseAnotherStudent={() => undefined}
            />
          ) : (
            <p>선물 탭</p>
          )}
        </>
      );
    }

    render(<TabHarness />);
    fireEvent.click(screen.getByRole("radio", { name: "보유 선물 기준" }));
    fireEvent.click(screen.getByRole("button", { name: "탭 전환" }));
    expect(await screen.findByText("선물 탭")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "탭 전환" }));
    expect(screen.getByRole("radio", { name: "보유 선물 기준" }).getAttribute("aria-checked")).toBe("true");
  });

  it("does not show fabricated inventory comparisons to guests", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        uid: "student-a",
        name: "테스트 학생",
        favoriteItems: [
          {
            favorited: true,
            favoriteLevel: 3,
            exp: 60,
            item: { uid: "gift-a", name: "테스트 선물", rarity: 3 },
          },
        ],
      }),
    );
    renderStudentScreen();

    expect(await screen.findByRole("textbox", { name: "테스트 선물 수량" })).toBeTruthy();
    expect(screen.queryByText(/필요 0 · 보유 0/)).toBeNull();
  });

  it("keeps stale writes blocked and exposes refresh in the student status row", () => {
    renderStudentScreen(undefined, { staleWriteBlocked: true });

    expect(screen.getByRole("alert").textContent).toContain(STUDENT_STATE_STALE_MESSAGE);
    expect(screen.getByRole("button", { name: "새로고침" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("exposes the existing retry callback after a save failure", () => {
    const onRetry = jest.fn();
    renderStudentScreen(undefined, { saveError: "저장하지 못했어요", onRetry });

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("distinguishes zero gifts after other students' allocations are excluded", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        uid: "student-a",
        name: "테스트 학생",
        favoriteItems: [
          {
            favorited: true,
            favoriteLevel: 3,
            exp: 60,
            item: { uid: "gift-a", name: "테스트 선물", rarity: 3 },
          },
        ],
      }),
    );
    renderStudentScreen(jest.fn(), {
      isAuthenticated: true,
      ownedQuantities: { "gift-a": 1 },
      requiredQuantities: { "gift-a": 1 },
      quantityBreakdowns: {
        "gift-a": [{ studentUid: "other", name: "다른 학생", quantity: 1 }],
      },
    });

    fireEvent.click(screen.getByRole("radio", { name: "보유 선물 기준" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 학생 배정분 제외" }));
    expect(await screen.findByText("다른 학생 배정분을 제외하면 남은 선물이 없어요.")).toBeTruthy();
    expect(screen.getByText(/0개 · \+0 EXP · 1개 제외/)).toBeTruthy();
    expect(screen.getByText(/보유 선물 기준 · 다른 학생 배정분 제외/)).toBeTruthy();
    expect(screen.getByText(/사용 0/)).toBeTruthy();
    expect(screen.getByText(/보유 1 · 다른 학생 1/)).toBeTruthy();
    expect(screen.getByText("27,330")).toBeTruthy();
  });

  it("shows saved and saving states in the student row", () => {
    const { rerender } = renderStudentScreen(undefined, { saveState: "pending" });
    expect(screen.getByRole("status").textContent).toBe("저장 중");

    rerender(
      <RelationshipStudentScreen
        student={{
          uid: "student-a",
          name: "테스트 학생",
          order: 1,
          currentLevel: 20,
          currentExp: null,
          targetLevel: 50,
          hasSavedState: true,
        }}
        isAuthenticated
        nullableSemantics={false}
        relationship={{ currentLevel: 20, currentExp: null, targetLevel: 50, items: {} }}
        giftCalculationMode="manual"
        onGiftCalculationModeChange={() => undefined}
        saveState="idle"
        saveError={null}
        saveSuccess
        staleWriteBlocked={false}
        onRetry={null}
        requiredQuantities={{}}
        quantityBreakdowns={{}}
        ownedQuantities={{}}
        onRelationshipChange={() => undefined}
        onDelete={() => undefined}
        onSignIn={() => undefined}
        onChooseAnotherStudent={() => undefined}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("저장됨");
  });

  it("states when authenticated users have no owned gifts", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        uid: "student-a",
        name: "테스트 학생",
        favoriteItems: [
          {
            favorited: true,
            favoriteLevel: 3,
            exp: 60,
            item: { uid: "gift-a", name: "테스트 선물", rarity: 3 },
          },
        ],
      }),
    );
    renderStudentScreen(jest.fn(), { isAuthenticated: true, ownedQuantities: {} });

    fireEvent.click(screen.getByRole("radio", { name: "보유 선물 기준" }));
    expect(await screen.findByText("재화 플래너에 등록된 보유 선물이 없어요.")).toBeTruthy();
  });
});
