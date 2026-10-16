/**
 * @jest-environment jsdom
 */
import { describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react";
import { useFetcher } from "react-router";
import { useRecruitmentOpinionSetting } from "~/routes/futures._components/recruitment-opinion-setting";

// The hook uses only useFetcher. The rest of react-router is not loaded, since jsdom lacks TextEncoder for it.
jest.mock("react-router", () => ({ useFetcher: jest.fn() }));

type FakeFetcher = {
  state: "idle" | "submitting";
  data: { ok: true; hideRecruitmentOpinions: boolean } | { ok: false; error?: string } | undefined;
  submit: jest.Mock;
};

const mockedUseFetcher = jest.mocked(useFetcher);
let fetcher: FakeFetcher;

function setFetcher(next: Partial<Pick<FakeFetcher, "state" | "data">>) {
  fetcher = { ...fetcher, ...next };
}

describe("useRecruitmentOpinionSetting", () => {
  it("holds the requested value while saving, then applies and reports the saved value", () => {
    fetcher = { state: "idle", data: undefined, submit: jest.fn() };
    mockedUseFetcher.mockImplementation(() => fetcher as never);
    const onSaved = jest.fn<(value: boolean) => void>();
    const { result, rerender } = renderHook(() =>
      useRecruitmentOpinionSetting({ initialValue: false, signedIn: true, onSaved, onSignedOut: jest.fn() }),
    );

    act(() => result.current.toggle(true));
    expect(fetcher.submit).toHaveBeenCalledWith(
      { hideRecruitmentOpinions: true },
      expect.objectContaining({ action: "/api/account/recruitment-opinions", method: "post" }),
    );

    setFetcher({ state: "submitting" });
    rerender();
    expect(result.current.value).toBe(true);
    expect(result.current.saving).toBe(true);

    setFetcher({ state: "idle", data: { ok: true, hideRecruitmentOpinions: true } });
    rerender();
    expect(onSaved).toHaveBeenCalledWith(true);
    expect(result.current.saved).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it("reverts to the last saved value and shows the error when the save fails", () => {
    fetcher = { state: "idle", data: undefined, submit: jest.fn() };
    mockedUseFetcher.mockImplementation(() => fetcher as never);
    const onSaved = jest.fn<(value: boolean) => void>();
    const { result, rerender } = renderHook(() =>
      useRecruitmentOpinionSetting({ initialValue: false, signedIn: true, onSaved, onSignedOut: jest.fn() }),
    );

    act(() => result.current.toggle(true));
    setFetcher({ state: "submitting" });
    rerender();
    setFetcher({ state: "idle", data: { ok: false, error: "저장 실패" } });
    rerender();

    expect(result.current.value).toBe(false);
    expect(result.current.error).toBe("저장 실패");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("opens sign-in for a signed-out toggle, and submits nothing", () => {
    fetcher = { state: "idle", data: undefined, submit: jest.fn() };
    mockedUseFetcher.mockImplementation(() => fetcher as never);
    const onSignedOut = jest.fn<() => void>();
    const { result } = renderHook(() =>
      useRecruitmentOpinionSetting({
        initialValue: false,
        signedIn: false,
        onSaved: jest.fn<(value: boolean) => void>(),
        onSignedOut,
      }),
    );

    act(() => result.current.toggle(true));

    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(fetcher.submit).not.toHaveBeenCalled();
    expect(result.current.value).toBe(false);
  });
});
