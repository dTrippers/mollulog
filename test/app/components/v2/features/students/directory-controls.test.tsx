/** @jest-environment jsdom */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, jest } from "@jest/globals";
import { useState } from "react";
jest.mock("react-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    Link: ({ to, prefetch, children, ...props }: { to: string; prefetch?: string; children: React.ReactNode }) =>
      React.createElement("a", { ...props, href: to, "data-prefetch": prefetch }, children),
  };
});
jest.mock("~/components/v2/layout/screen-transition", () => ({
  getV2LinkTransitionProps: () => ({ "data-transition": "forward" }),
}));
import { Attack, Defense, StudentTerrainAdaptationRank } from "~/graphql/graphql";
import { TimeZoneProvider } from "~/contexts/TimeZoneProvider";
import { terrainAdaptationIconUrl } from "~/models/assets";
import { DirectoryCard } from "~/components/v2/features/students/DirectoryCardLabel";
import { DirectoryFilterPanel } from "~/components/v2/features/students/DirectoryFilterPanel";
import { ResultSummary } from "~/components/v2/features/students/ResultSummary";
import { SortControl } from "~/components/v2/primitives/SortControl";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { Select } from "~/components/v2/primitives/Select";
import { defaultStudentDirectoryFilterState, getStudentDirectoryVisibleState, studentDirectoryDisplayOptions, type StudentDirectoryFilterState, type StudentDirectoryPersonalState } from "~/domain/student-directory";
import type { StudentDirectoryStudent } from "~/models/student-directory";
import { useStudentDirectoryFilterState } from "~/routes/students._components/use-student-directory-filter-state";
import { readStudentDirectoryFilterStateFromCookie } from "~/routes/students._components/student-directory-cookie";

function student(): StudentDirectoryStudent {
  return {
    uid: "1", name: "학생", familyName: null, altNames: [], school: "millennium", initialTier: 3, order: 1,
    releaseAt: "2024-01-01T00:00:00.000Z", attackType: Attack.Explosive, defenseType: Defense.Light, weaponType: "ar",
    acquisitionType: "regular", canUseCover: true, skillEffectTags: [], club: { uid: "club-1", name: "게임개발부" },
    studentVariant: { primaryStudent: { uid: "1" } }, position: "front", tacticRole: "attacker", birthday: "2000-01-01",
    role: "striker", equipments: ["hat", "bag", "shoes"], released: true, catalog: null,
  };
}

describe("student directory controls", () => {
  it("debounces name search for 150ms", () => {
    const onChange = jest.fn<(value: string) => void>();
    jest.useFakeTimers();
    try {
      render(<SearchInput value="" onChange={onChange} />);
      fireEvent.change(screen.getByRole("searchbox", { name: "이름 검색" }), { target: { value: "아루" } });
      act(() => jest.advanceTimersByTime(149));
      expect(onChange).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1));
      expect(onChange).toHaveBeenLastCalledWith("아루");
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps search controls at the v2 height and avoids native search sizing", () => {
    render(<SearchInput value="학생" onChange={jest.fn()} />);
    const input = screen.getByRole<HTMLInputElement>("searchbox", { name: "이름 검색" });
    const label = input.parentElement!;
    const clear = screen.getByRole("button", { name: "검색어 지우기" });
    expect(label.className).toContain("h-v2-control-min");
    expect(label.className).toContain("has-[:focus-visible]:outline-2");
    expect(label.className).toContain("has-[:focus-visible]:outline-offset-2");
    expect(label.className).toContain("has-[:focus-visible]:outline-v2-focus");
    expect(input.className).toContain("appearance-none");
    expect(input.className).toContain("text-base");
    expect(input.className).toContain("sm:text-sm");
    expect(clear.className).toContain("size-8");
    expect(clear.className).not.toContain("max-lg:size-11");
  });

  it("clears a search immediately and keeps focus in the search box", () => {
    const onChange = jest.fn<(value: string) => void>();
    render(<SearchInput value="아루" onChange={onChange} />);

    const input = screen.getByRole<HTMLInputElement>("searchbox", { name: "이름 검색" });
    const clear = screen.getByRole("button", { name: "검색어 지우기" });
    expect(clear.className).toContain("active:bg-v2-filled-hover");
    fireEvent.click(clear);

    expect(onChange).toHaveBeenCalledWith("");
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "검색어 지우기" })).toBeNull();
  });

  it("uses text group names and pressed chips, and disables personal controls while signed out", () => {
    const onRequestSignIn = jest.fn();
    const onChange = jest.fn<(update: React.SetStateAction<StudentDirectoryFilterState>) => void>();
    const state = { ...defaultStudentDirectoryFilterState, schools: ["millennium"] };
    const rendered = render(
      <DirectoryFilterPanel
        students={[student()]}
        state={state}
        personalStatus="signed-out"
        onChange={onChange}
        onRequestSignIn={onRequestSignIn}
      />,
    );

    expect(screen.getByRole("group", { name: "공격 타입" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "방어 타입" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "클래스" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "역할" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "지형 적성" }));
    for (const rank of ["SS", "S", "A", "B", "C", "D"] as const) {
      const terrainChip = screen.getByRole("button", { name: `시가지 적성 ${rank}` });
      const icon = terrainChip.querySelector("img");
      expect(terrainChip.textContent).toBe("");
      expect(terrainChip.className).toContain("min-h-8");
      expect(terrainChip.className).toContain("sm:min-h-6");
      expect(icon?.getAttribute("src")).toBe(terrainAdaptationIconUrl(rank));
      expect(icon?.getAttribute("alt")).toBe("");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(icon?.className).toContain("size-4");
      expect(icon?.className).toContain("sm:size-3.5");
    }
    expect(studentDirectoryDisplayOptions.slice(0, 2)).toEqual([
      { value: "none", label: "없음" },
      { value: "sortValue", label: "정렬 값" },
    ]);
    const selected = screen.getByRole("button", { name: /학교 1/ });
    expect(selected.getAttribute("aria-expanded")).toBe("false");
    expect(selected.className).toContain("min-h-v2-row-min");
    expect(selected.className).toContain("sm:min-h-8");
    expect(selected.className).toContain("px-0");
    expect(selected.className).toContain("sm:px-1");
    expect(selected.className).toContain("active:bg-v2-filled-hover");
    const attack = screen.getByRole("button", { name: /폭발/ });
    expect(attack.getAttribute("aria-pressed")).toBe("false");
    expect(attack.className).toContain("active:opacity-80");
    expect(attack.className).toContain("min-h-8");
    expect(attack.className).toContain("px-0");
    expect(attack.className).toContain("sm:min-h-6");
    expect(attack.firstElementChild?.className).toContain("min-h-8");
    expect(attack.firstElementChild?.className).not.toContain("min-w-9");
    expect(attack.firstElementChild?.className).toContain("px-2.5");
    expect(attack.firstElementChild?.className).toContain("text-sm");
    expect(attack.firstElementChild?.className).toContain("rounded-md");
    expect(attack.firstElementChild?.className).toContain("sm:min-h-6");
    expect(attack.firstElementChild?.className).toContain("sm:px-1.5");
    expect(attack.firstElementChild?.className).toContain("sm:text-[13px]");
    expect(attack.parentElement?.className).toContain("gap-x-1.5");
    expect(attack.parentElement?.className).toContain("gap-y-1.5");
    expect(attack.parentElement?.className).toContain("sm:gap-x-0.5");
    expect(attack.parentElement?.parentElement?.parentElement?.className).toContain("space-y-1.5 sm:space-y-0.5");
    expect(rendered.container.firstElementChild?.className).toContain("space-y-1");
    expect(rendered.container.firstElementChild?.firstElementChild?.className).toContain("space-y-2 pb-1 sm:pb-0");
    const role = screen.getByRole("button", { name: "딜러" });
    const recruitment = screen.getByRole("button", { name: "모집함" });
    expect(role.className).toContain("min-h-8");
    expect(role.className).not.toContain("min-w-11");
    expect(role.className).toContain("px-0");
    expect(recruitment.className).toContain("min-h-8");
    expect(recruitment.className).not.toContain("min-w-11");
    expect(recruitment.className).toContain("px-0");
    expect(role.parentElement?.className).toContain("gap-x-1.5");
    expect(recruitment.parentElement?.className).toContain("gap-x-1.5");
    expect(role.parentElement?.className).toContain("sm:gap-x-0.5");
    expect(role.parentElement?.className).toContain("gap-y-1.5");
    fireEvent.click(screen.getByRole("button", { name: "동아리" }));
    expect(screen.getByRole("button", { name: "없음" })).toBeTruthy();
    fireEvent.click(attack);
    const addUpdate = onChange.mock.calls.at(-1)?.[0];
    const withAttack = typeof addUpdate === "function" ? addUpdate(state) : addUpdate;
    expect(withAttack?.attackTypes).toContain(Attack.Explosive);
    expect(screen.getByRole("button", { name: "모집함" }).hasAttribute("disabled")).toBe(true);
    const signInAction = screen.getByRole("button", { name: "로그인 후 사용 가능: 로그인하고 내 기록으로 정렬·필터하기" });
    expect(signInAction.className).toContain("min-h-6");
    expect(signInAction.className).not.toContain("after:");
    expect(signInAction.className).not.toContain("min-h-9");
    fireEvent.click(signInAction);
    expect(onRequestSignIn).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("알 수 없음");

    rendered.unmount();
    const selectedChange = jest.fn<(update: React.SetStateAction<StudentDirectoryFilterState>) => void>();
    render(
      <DirectoryFilterPanel
        students={[student()]}
        state={{ ...defaultStudentDirectoryFilterState, attackTypes: [Attack.Explosive] }}
        personalStatus="loaded"
        onChange={selectedChange}
        onRequestSignIn={onRequestSignIn}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /폭발/ }));
    const removeUpdate = selectedChange.mock.calls.at(-1)?.[0];
    const withoutAttack = typeof removeUpdate === "function" ? removeUpdate({ ...defaultStudentDirectoryFilterState, attackTypes: [Attack.Explosive] }) : removeUpdate;
    expect(withoutAttack?.attackTypes).toEqual([]);
  });

  it("shows the personal sort group disabled until records load and describes direction in text", async () => {
    const onChange = jest.fn();
    render(
      <SortControl sort="name" direction="asc" personalStatus="failed" onChange={onChange} onRequestSignIn={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "정렬 방향: 가나다순" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "정렬 기준: 이름" }));
    const personalSort = await screen.findByRole("button", { name: "내 등급" });
    expect(personalSort.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("내 기록")).toBeTruthy();
  });

  it("uses the logged-out availability copy in the sort menu and adds press feedback to selects", async () => {
    render(
      <>
        <SortControl sort="release" direction="desc" personalStatus="signed-out" onChange={jest.fn()} onRequestSignIn={jest.fn()} />
        <Select label="표시할 정보" value="none" options={studentDirectoryDisplayOptions} onChange={jest.fn()} />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "정렬 기준: 출시" }));
    const signIn = await screen.findByRole("button", { name: "로그인 후 사용 가능: 로그인하고 내 기록으로 정렬·필터하기" });
    expect(signIn.textContent).toBe("로그인 후 사용 가능");
    expect(screen.getByRole("combobox", { name: "표시할 정보" }).className).toContain("active:bg-v2-filled-hover");
  });

  it("adds press feedback to the removable condition chip and reset button", () => {
    render(
      <ResultSummary
        students={[student()]}
        state={{ ...defaultStudentDirectoryFilterState, attackTypes: [Attack.Explosive] }}
        count={1}
        onChange={jest.fn()}
      />,
    );
    const removable = screen.getByRole("button", { name: "폭발 해제" });
    expect(removable.firstElementChild?.className).toContain("group-active:bg-v2-filled-hover");
    expect(removable.className).toContain("min-h-8");
    expect(removable.className).not.toContain("py-1.5");
    expect(removable.className).toContain("sm:min-h-7");
    expect(removable.firstElementChild?.className).toContain("min-h-8");
    expect(removable.firstElementChild?.className).toContain("sm:min-h-7");
    const reset = screen.getByRole("button", { name: "초기화" });
    expect(reset.className).toContain("min-h-8");
    expect(reset.className).not.toContain("py-1.5");
    expect(reset.className).toContain("sm:min-h-7");
    expect(reset.className).toContain("active:opacity-80");
    expect(reset.firstElementChild?.className).toContain("min-h-8");
    expect(reset.firstElementChild?.className).toContain("sm:min-h-7");
  });

  it("keeps a changed public sort direction through the persisted route state path", () => {
    const cookieName = "mollulog_students_filter";
    document.cookie = `${cookieName}=; Max-Age=0; Path=/`;

    function RouteStateHarness() {
      const [state, setState] = useStudentDirectoryFilterState(
        cookieName,
        defaultStudentDirectoryFilterState,
        [],
        true,
      );
      const visibleState = getStudentDirectoryVisibleState(state, "signed-out");
      return (
        <>
          <SortControl
            sort={visibleState.sort}
            direction={visibleState.direction}
            personalStatus="signed-out"
            onChange={(sort, direction) => setState((current) => ({ ...current, sort, direction }))}
            onRequestSignIn={jest.fn()}
          />
          <output>{JSON.stringify(visibleState)}</output>
        </>
      );
    }

    render(<RouteStateHarness />);
    fireEvent.click(screen.getByRole("button", { name: "정렬 방향: 최신순" }));

    expect(screen.getByRole("button", { name: "정렬 방향: 과거순" })).toBeTruthy();
    expect(JSON.parse(screen.getByText(/"direction":"asc"/).textContent!)).toMatchObject({
      sort: "release",
      direction: "asc",
    });
    expect(readStudentDirectoryFilterStateFromCookie(document.cookie, cookieName, []).direction).toBe("asc");
  });

  it("keeps focus after removing a chip and after resetting filters while preserving view choices", async () => {
    const initial: StudentDirectoryFilterState = {
      ...defaultStudentDirectoryFilterState,
      attackTypes: [Attack.Explosive],
      search: "아루",
      sort: "name",
      direction: "desc",
      displayBy: "height",
      groupBy: "school",
    };
    function Harness() {
      const [state, setState] = useState(initial);
      return (
        <>
          <ResultSummary students={[student()]} state={state} count={1} onChange={setState} />
          <output data-state>{JSON.stringify(state)}</output>
        </>
      );
    }
    const { container } = render(<Harness />);
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => {
      callback(performance.now());
      return 0;
    };

    try {
      fireEvent.click(screen.getByRole("button", { name: "폭발 해제" }));
      await waitFor(() => expect(document.activeElement?.getAttribute("data-filter-reset")).toBe("true"));

      fireEvent.click(screen.getByRole("button", { name: "초기화" }));
      await waitFor(() => expect(document.activeElement?.textContent).toContain("1명"));
      const state = JSON.parse(container.querySelector("output")!.textContent!) as StudentDirectoryFilterState;
      expect(state).toMatchObject({ attackTypes: [], search: "", sort: "name", direction: "desc", displayBy: "height", groupBy: "school" });
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("shows terrain ranks as icons in removable filters with a descriptive accessible name", () => {
    const state = {
      ...defaultStudentDirectoryFilterState,
      terrain: { street: [StudentTerrainAdaptationRank.Ss], outdoor: [], indoor: [] },
    };
    render(<ResultSummary students={[student()]} state={state} count={1} onChange={jest.fn()} />);

    const chip = screen.getByRole("button", { name: "시가지 적성 SS 해제" });
    const icon = chip.querySelector("img");
    expect(chip.textContent).toContain("시가지");
    expect(chip.textContent).not.toContain("SS");
    expect(icon?.getAttribute("src")).toBe(terrainAdaptationIconUrl("SS"));
    expect(icon?.getAttribute("alt")).toBe("");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the terrain icon without rank text on the card and keeps unknown text explicit", () => {
    const state = { ...defaultStudentDirectoryFilterState, sort: "street" as const, displayBy: "sortValue" as const };
    const knownStudent: StudentDirectoryStudent = {
      ...student(),
      catalog: {
        profile: { age: null, schoolYear: null, height: null },
        terrainAdaptations: {
          street: StudentTerrainAdaptationRank.Ss,
          outdoor: StudentTerrainAdaptationRank.A,
          indoor: StudentTerrainAdaptationRank.B,
        },
      },
    };
    const rendered = render(
      <TimeZoneProvider timeZone="UTC">
        <DirectoryCard student={knownStudent} state={state} personal={{ status: "signed-out" }} />
      </TimeZoneProvider>,
    );
    const knownCard = screen.getByRole("link", { name: "학생 상세, 시가지 적성 SS" });
    const knownScrim = knownCard.querySelector(".bg-v2-scrim");
    expect(knownScrim?.textContent).toBe("");
    expect(knownScrim?.querySelector("img")?.getAttribute("src")).toBe(terrainAdaptationIconUrl("SS"));
    rendered.unmount();

    render(
      <TimeZoneProvider timeZone="UTC">
        <DirectoryCard student={student()} state={state} personal={{ status: "signed-out" }} />
      </TimeZoneProvider>,
    );
    const unknownCard = screen.getByRole("link", { name: "학생 상세, 시가지 적성 알 수 없음" });
    expect(unknownCard.querySelector(".bg-v2-scrim")?.textContent).toContain("알 수 없음");
    expect(unknownCard.querySelector(".bg-v2-scrim img")).toBeNull();
  });
});
