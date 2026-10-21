import { describe, expect, it } from "@jest/globals";
import { defaultStudentDirectoryFilterState } from "~/domain/student-directory";
import { Attack, Defense } from "~/graphql/graphql";
import type { StudentDirectoryStudent } from "~/models/student-directory";
import {
  MAX_STUDENT_DIRECTORY_COOKIE_SIZE,
  normalizeStudentDirectoryFilterState,
  readStudentDirectoryFilterStateFromCookie,
  serializeStudentDirectoryFilterStateCookie,
} from "~/routes/students._components/student-directory-cookie";

function student(overrides: Partial<StudentDirectoryStudent> = {}): StudentDirectoryStudent {
  return {
    uid: "1",
    name: "학생",
    familyName: null,
    altNames: [],
    school: "millennium",
    initialTier: 3,
    order: 1,
    releaseAt: "2024-01-01T00:00:00.000Z",
    attackType: Attack.Explosive,
    defenseType: Defense.Light,
    weaponType: "ar",
    acquisitionType: "regular",
    canUseCover: true,
    skillEffectTags: [],
    club: { uid: "club-uid", name: "게임개발부" },
    studentVariant: null,
    position: "front",
    tacticRole: "attacker",
    birthday: "2000-01-01",
    role: "striker",
    equipments: ["hat", "bag", "shoes"],
    released: true,
    catalog: null,
    ...overrides,
  };
}

const students: StudentDirectoryStudent[] = [student()];

describe("student directory cookie", () => {
  it("migrates 1.x role fields and carries valid filters through current validation", () => {
    const legacy = {
      attackTypes: [Attack.Explosive],
      defenseTypes: [Defense.Heavy],
      roles: ["striker"],
      tacticRoles: ["attacker"],
      positions: ["front"],
      schools: ["millennium"],
      equipmentSlots: [["hat"], [], []],
      initialTiers: [3],
      sort: "old",
      groupBy: "school",
      displayBy: "none",
    };
    const normalized = readStudentDirectoryFilterStateFromCookie(
      `mollulog_students_filter=${encodeURIComponent(JSON.stringify(legacy))}`,
      "mollulog_students_filter",
      students,
    );

    expect(normalized).toMatchObject({
      attackTypes: [Attack.Explosive],
      defenseTypes: [Defense.Heavy],
      classes: ["striker"],
      roles: ["attacker"],
      positions: ["front"],
      schools: ["millennium"],
      equipmentSlots: [["hat"], [], []],
      initialTiers: [3],
      sort: "release",
      direction: "asc",
      groupBy: "school",
      displayBy: "none",
    });
  });

  it.each([
    ["recent", "release", "desc"],
    ["old", "release", "asc"],
    ["name", "name", "asc"],
    ["tier", "initialTier", "desc"],
  ] as const)("maps the 1.x %s sort to its current visible equivalent", (legacySort, sort, direction) => {
    const value = { roles: [], tacticRoles: [], sort: legacySort };
    const normalized = normalizeStudentDirectoryFilterState(value, students);

    expect(normalized.sort).toBe(sort);
    expect(normalized.direction).toBe(direction);
  });

  it("does not treat new-format roles as legacy class values", () => {
    const newer = {
      classes: ["special"],
      roles: ["tank"],
      sort: "name",
      direction: "desc",
    };

    expect(normalizeStudentDirectoryFilterState(newer, students)).toMatchObject({
      classes: ["special"],
      roles: ["tank"],
      sort: "name",
      direction: "desc",
    });
  });

  it("validates every persisted filter against the current allowed data and omits search", () => {
    const normalized = normalizeStudentDirectoryFilterState(
      {
        attackTypes: [Attack.Explosive, "unknown"],
        defenseTypes: [Defense.Heavy],
        schools: ["millennium", "unmapped"],
        clubUids: ["club-uid", "internal-id"],
        weaponTypes: ["ar", "unmapped"],
        acquisitionTypes: ["regular", "unknown"],
        skillEffects: ["debuff", "unknown"],
        cover: [true, "yes", null],
        search: "검색어",
        sort: "myLevel",
        recruitment: ["unrecruited", "all"],
        displayBy: "height",
        groupBy: "club",
      },
      students,
    );

    expect(normalized).toMatchObject({
      attackTypes: [Attack.Explosive],
      defenseTypes: [Defense.Heavy],
      schools: ["millennium"],
      clubUids: ["club-uid"],
      weaponTypes: ["ar"],
      acquisitionTypes: ["regular"],
      skillEffects: ["debuff"],
      cover: [true],
      search: "",
      sort: "myLevel",
      recruitment: ["unrecruited"],
      displayBy: "height",
      groupBy: "none",
    });
  });

  it("serializes club uids and preferences but never the search text", () => {
    const state = {
      ...defaultStudentDirectoryFilterState,
      clubUids: ["club-uid"],
      search: "검색어",
      sort: "myBond" as const,
      displayBy: "age" as const,
      groupBy: "school" as const,
    };
    const serialized = serializeStudentDirectoryFilterStateCookie(state, students);
    expect(serialized).not.toBeNull();
    if (serialized === null) throw new Error("Expected a serialized student directory filter state.");
    const saved = JSON.parse(decodeURIComponent(serialized));
    expect(saved.clubUids).toEqual(["club-uid"]);
    expect(saved.sort).toBe("myBond");
    expect(saved.displayBy).toBe("age");
    expect(saved.groupBy).toBe("school");
    expect(saved).not.toHaveProperty("search");
  });

  it("keeps none as the hidden-label value and accepts sortValue for the sort label", () => {
    expect(normalizeStudentDirectoryFilterState({ displayBy: "none" }, students).displayBy).toBe("none");
    expect(normalizeStudentDirectoryFilterState({ displayBy: "sortValue" }, students).displayBy).toBe("sortValue");
    expect(defaultStudentDirectoryFilterState.displayBy).toBe("none");
  });

  it("recovers defaults for invalid or oversized cookies", () => {
    const read = (value: string) =>
      readStudentDirectoryFilterStateFromCookie(
        `mollulog_students_filter=${value}`,
        "mollulog_students_filter",
        students,
      );
    expect(read("not-json")).toEqual(defaultStudentDirectoryFilterState);
    expect(read("%")).toEqual(defaultStudentDirectoryFilterState);
    expect(read("x".repeat(MAX_STUDENT_DIRECTORY_COOKIE_SIZE + 1))).toEqual(defaultStudentDirectoryFilterState);
    expect(readStudentDirectoryFilterStateFromCookie(null, "mollulog_students_filter", students)).toEqual(
      defaultStudentDirectoryFilterState,
    );
  });
});
