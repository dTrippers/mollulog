import { describe, expect, it } from "@jest/globals";
import { Attack, Defense, Position, RoleEnum, TacticRole } from "~/graphql/graphql";
import {
  applyStudentsFilter,
  clearStudentsFilters,
  createStudentsFilterState,
  hasActiveStudentsFilters,
  isSameStudentsFilterCookie,
  readStudentsFilterFromCookie,
  STUDENTS_FILTER_COOKIE_NAME,
} from "~/routes/$username.students._components/students-filter";

function student(uid: string, name: string, order: number, tier: number | null, initialTier = 3) {
  return {
    uid,
    name,
    order,
    tier,
    initialTier,
    attackType: Attack.Explosive,
    defenseType: Defense.Light,
    role: RoleEnum.Striker,
    position: Position.Front,
    tacticRole: TacticRole.Attacker,
  };
}

const students = [student("b", "나나", 2, 5), student("a", "가가", 1, null), student("c", "다다", 3, 9)];

describe("students filter", () => {
  it("sorts newest first by default and supports the other sorts", () => {
    const uids = (sort: "recent" | "old" | "name" | "tier") =>
      applyStudentsFilter(students, createStudentsFilterState(sort)).map(({ uid }) => uid);
    expect(uids("recent")).toEqual(["c", "b", "a"]);
    expect(uids("old")).toEqual(["a", "b", "c"]);
    expect(uids("name")).toEqual(["a", "b", "c"]);
    expect(uids("tier")).toEqual(["c", "b", "a"]);
  });

  it("searches by partially typed Hangul", () => {
    const state = { ...createStudentsFilterState(), search: "나" };
    expect(applyStudentsFilter(students, state).map(({ uid }) => uid)).toEqual(["b"]);
  });

  it("filters by attribute chips", () => {
    expect(applyStudentsFilter(students, { ...createStudentsFilterState(), attackTypes: [Attack.Mystic] })).toEqual([]);
    expect(
      applyStudentsFilter(students, { ...createStudentsFilterState(), attackTypes: [Attack.Explosive] }),
    ).toHaveLength(3);
  });

  it("clears the chips and the search but keeps the sort", () => {
    const state = { ...createStudentsFilterState("name"), roles: [RoleEnum.Striker], search: "가" };
    expect(hasActiveStudentsFilters(state)).toBe(true);
    const cleared = clearStudentsFilters(state);
    expect(hasActiveStudentsFilters(cleared)).toBe(false);
    expect(cleared.sort).toBe("name");
  });

  it("reads the cookie, ignoring unknown values and oversized or broken payloads", () => {
    const encoded = encodeURIComponent(
      JSON.stringify({ attackTypes: [Attack.Explosive, "nope"], sort: "tier", search: "x", roles: "bad" }),
    );
    const state = readStudentsFilterFromCookie(`a=1; ${STUDENTS_FILTER_COOKIE_NAME}=${encoded}`);
    expect(state).toEqual({ ...createStudentsFilterState("tier"), attackTypes: [Attack.Explosive] });
    expect(readStudentsFilterFromCookie(`${STUDENTS_FILTER_COOKIE_NAME}=%7Bbroken`)).toEqual(
      createStudentsFilterState(),
    );
    expect(readStudentsFilterFromCookie(`${STUDENTS_FILTER_COOKIE_NAME}=${"a".repeat(3000)}`)).toEqual(
      createStudentsFilterState(),
    );
    expect(readStudentsFilterFromCookie(null)).toEqual(createStudentsFilterState());
  });

  it("does not count a search text change as a cookie change", () => {
    const a = createStudentsFilterState();
    expect(isSameStudentsFilterCookie(a, { ...a, search: "아루" })).toBe(true);
    expect(isSameStudentsFilterCookie(a, { ...a, sort: "name" })).toBe(false);
  });
});
