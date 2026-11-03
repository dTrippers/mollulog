import { describe, expect, it } from "@jest/globals";
import {
  defaultStudentDirectoryFilterState,
  filterAndSortStudentDirectory,
  getStudentDirectoryAppliedFilters,
  getStudentDirectoryLabel,
  getStudentDirectoryVisibleState,
  groupStudentDirectoryStudents,
  STUDENT_DIRECTORY_SORTS,
  type StudentDirectoryFilterState,
  type StudentDirectoryPersonalState,
} from "~/domain/student-directory";
import { Attack, Defense, StudentTerrainAdaptationRank } from "~/graphql/graphql";
import type { StudentDirectoryStudent } from "~/models/student-directory";

function student(overrides: Partial<StudentDirectoryStudent> = {}): StudentDirectoryStudent {
  return {
    uid: "10001",
    name: "학생",
    familyName: null,
    altNames: [],
    school: "millennium",
    initialTier: 3,
    order: 1,
    releaseAt: "2023-01-01T00:00:00.000Z",
    attackType: Attack.Explosive,
    defenseType: Defense.Light,
    weaponType: "ar",
    acquisitionType: "regular",
    canUseCover: true,
    skillEffectTags: ["debuff"],
    club: { uid: "club-1", name: "게임개발부" },
    studentVariant: { primaryStudent: { uid: "primary-1" } },
    position: "front",
    tacticRole: "attacker",
    birthday: "2000-01-01",
    role: "striker",
    equipments: ["hat", "bag", "shoes"],
    released: true,
    catalog: {
      profile: { age: "17세", schoolYear: "2학년", height: "159cm" },
      terrainAdaptations: {
        street: StudentTerrainAdaptationRank.Ss,
        outdoor: StudentTerrainAdaptationRank.A,
        indoor: StudentTerrainAdaptationRank.B,
      },
    },
    ...overrides,
  };
}

function catalog(
  terrainAdaptations: NonNullable<StudentDirectoryStudent["catalog"]>["terrainAdaptations"],
): NonNullable<StudentDirectoryStudent["catalog"]> {
  return { profile: { age: null, schoolYear: null, height: null }, terrainAdaptations };
}

const signedOut: StudentDirectoryPersonalState = { status: "signed-out" };

describe("student directory filters and sorting", () => {
  it("combines OR within filter groups and AND across groups, including each terrain row", () => {
    const students = [
      student({
        uid: "match",
        attackType: Attack.Explosive,
        catalog: catalog({
          street: StudentTerrainAdaptationRank.Ss,
          outdoor: StudentTerrainAdaptationRank.D,
          indoor: StudentTerrainAdaptationRank.A,
        }),
      }),
      student({
        uid: "other-attack",
        attackType: Attack.Mystic,
        catalog: catalog({
          street: StudentTerrainAdaptationRank.S,
          outdoor: StudentTerrainAdaptationRank.D,
          indoor: StudentTerrainAdaptationRank.A,
        }),
      }),
      student({
        uid: "other-terrain",
        attackType: Attack.Piercing,
        catalog: catalog({
          street: StudentTerrainAdaptationRank.Ss,
          outdoor: StudentTerrainAdaptationRank.D,
          indoor: StudentTerrainAdaptationRank.S,
        }),
      }),
    ];
    const state: StudentDirectoryFilterState = {
      ...defaultStudentDirectoryFilterState,
      attackTypes: [Attack.Explosive, Attack.Piercing],
      terrain: { street: ["SS", "S"], outdoor: [], indoor: ["A"] },
    };

    expect(filterAndSortStudentDirectory(students, state, signedOut).map(({ uid }) => uid)).toEqual(["match"]);
  });

  it("searches Korean names, family names, and aliases", () => {
    const students = [
      student({ uid: "name", name: "아루" }),
      student({ uid: "family", name: "학생 A", familyName: "아루" }),
      student({ uid: "alias", name: "학생 B", altNames: ["아루 별칭"] }),
      student({ uid: "other", name: "시로코" }),
    ];
    const state = { ...defaultStudentDirectoryFilterState, search: "아루" };

    expect(filterAndSortStudentDirectory(students, state, signedOut).map(({ uid }) => uid)).toEqual(
      expect.arrayContaining(["name", "family", "alias"]),
    );
    expect(filterAndSortStudentDirectory(students, state, signedOut)).toHaveLength(3);
  });

  it("does not match unknown/null values to chips and distinguishes empty skill tags from null", () => {
    const students = [
      student({
        uid: "known",
        skillEffectTags: ["debuff"],
        canUseCover: true,
        acquisitionType: "limited",
        weaponType: "sg",
      }),
      student({
        uid: "empty-tags",
        skillEffectTags: [],
        canUseCover: false,
        acquisitionType: "unknown",
        weaponType: null,
      }),
      student({
        uid: "unknown-tags",
        skillEffectTags: null,
        canUseCover: null,
        acquisitionType: null,
        weaponType: null,
      }),
    ];
    const skillFilter: StudentDirectoryFilterState = {
      ...defaultStudentDirectoryFilterState,
      skillEffects: ["debuff"],
    };
    const coverFilter: StudentDirectoryFilterState = { ...defaultStudentDirectoryFilterState, cover: [true] };
    const acquisitionFilter: StudentDirectoryFilterState = {
      ...defaultStudentDirectoryFilterState,
      acquisitionTypes: ["limited"],
    };
    const weaponFilter: StudentDirectoryFilterState = { ...defaultStudentDirectoryFilterState, weaponTypes: ["sg"] };

    expect(filterAndSortStudentDirectory(students, skillFilter, signedOut).map(({ uid }) => uid)).toEqual(["known"]);
    expect(filterAndSortStudentDirectory(students, coverFilter, signedOut).map(({ uid }) => uid)).toEqual(["known"]);
    expect(filterAndSortStudentDirectory(students, acquisitionFilter, signedOut).map(({ uid }) => uid)).toEqual([
      "known",
    ]);
    expect(filterAndSortStudentDirectory(students, weaponFilter, signedOut).map(({ uid }) => uid)).toEqual(["known"]);
  });

  it("filters clubs by uid and treats a null club as the explicit unaffiliated option", () => {
    const students = [
      student({ uid: "club-match", club: { uid: "club-1", name: "게임개발부" } }),
      student({ uid: "unaffiliated", club: null }),
      student({ uid: "unknown-club", club: { uid: "", name: null } }),
    ];
    const byUid = { ...defaultStudentDirectoryFilterState, clubUids: ["club-1"] };
    const byNone = { ...defaultStudentDirectoryFilterState, unaffiliatedClub: true };

    expect(filterAndSortStudentDirectory(students, byUid, signedOut).map(({ uid }) => uid)).toEqual(["club-match"]);
    expect(filterAndSortStudentDirectory(students, byNone, signedOut).map(({ uid }) => uid)).toEqual(["unaffiliated"]);
  });

  it("does not create an unknown-value chip for invalid filter values", () => {
    const invalid = {
      ...defaultStudentDirectoryFilterState,
      schools: ["unmapped-school"],
      clubUids: ["missing-club"],
      weaponTypes: ["unknown-weapon"],
      skillEffects: ["unknown-effect"],
      acquisitionTypes: ["unknown"],
    };
    expect(getStudentDirectoryAppliedFilters([student()], invalid)).toEqual([]);
  });

  it("keeps the terrain rank in applied-filter accessibility data while separating its visible label", () => {
    const chips = getStudentDirectoryAppliedFilters([student()], {
      ...defaultStudentDirectoryFilterState,
      terrain: { street: [StudentTerrainAdaptationRank.Ss], outdoor: [], indoor: [] },
    });

    expect(chips).toContainEqual(
      expect.objectContaining({
        key: "terrain:street:SS",
        label: "시가지",
        ariaLabel: "시가지 적성 SS",
        terrainRank: "SS",
      }),
    );
  });

  it("sorts 최신순 and 과거순 by order, not by release date", () => {
    const students = [
      student({ uid: "first", order: 1, releaseAt: "2025-01-01T00:00:00.000Z" }),
      student({ uid: "third", order: 3, releaseAt: null }),
      student({ uid: "second", order: 2, releaseAt: "2021-01-01T00:00:00.000Z" }),
    ];
    const sort = (direction: "asc" | "desc") =>
      filterAndSortStudentDirectory(
        students,
        { ...defaultStudentDirectoryFilterState, sort: "release", direction },
        signedOut,
      ).map(({ uid }) => uid);

    expect(sort("desc")).toEqual(["third", "second", "first"]);
    expect(sort("asc")).toEqual(["first", "second", "third"]);
  });

  it("keeps unknown sort values last for either direction and breaks public ties by the newest order", () => {
    const students = [
      student({ uid: "unknown", school: "unmapped-school", order: 3 }),
      student({ uid: "older", school: "millennium", order: 1, releaseAt: "2024-01-01T00:00:00.000Z" }),
      student({ uid: "newer", school: "millennium", order: 2, releaseAt: "2022-01-01T00:00:00.000Z" }),
    ];
    const asc = filterAndSortStudentDirectory(
      students,
      { ...defaultStudentDirectoryFilterState, sort: "school", direction: "asc" },
      signedOut,
    );
    const desc = filterAndSortStudentDirectory(
      students,
      { ...defaultStudentDirectoryFilterState, sort: "school", direction: "desc" },
      signedOut,
    );
    const releaseTie = filterAndSortStudentDirectory(
      [students[1], students[2]],
      { ...defaultStudentDirectoryFilterState, sort: "initialTier", direction: "desc" },
      signedOut,
    );

    expect(asc.map(({ uid }) => uid).at(-1)).toBe("unknown");
    expect(desc.map(({ uid }) => uid).at(-1)).toBe("unknown");
    expect(releaseTie.map(({ uid }) => uid)).toEqual(["newer", "older"]);
  });

  it("sorts schools and clubs by their visible Korean names", () => {
    const schoolStudents = [
      student({ uid: "abydos", school: "abydos" }),
      student({ uid: "millennium", school: "millennium" }),
      student({ uid: "gehenna", school: "gehenna" }),
    ];
    const schoolSort = filterAndSortStudentDirectory(
      schoolStudents,
      { ...defaultStudentDirectoryFilterState, sort: "school", direction: "asc" },
      signedOut,
    );
    const clubStudents = [
      student({ uid: "da", club: { uid: "da", name: "다부" } }),
      student({ uid: "ga", club: { uid: "ga", name: "가부" } }),
      student({ uid: "na", club: { uid: "na", name: "나부" } }),
    ];
    const clubSort = filterAndSortStudentDirectory(
      clubStudents,
      { ...defaultStudentDirectoryFilterState, sort: "club", direction: "asc" },
      signedOut,
    );

    expect(schoolSort.map(({ uid }) => uid)).toEqual(["gehenna", "millennium", "abydos"]);
    expect(clubSort.map(({ uid }) => uid)).toEqual(["ga", "na", "da"]);
  });

  it("treats a missing terrain rank as unknown for labels, filters, and either sort direction", () => {
    const known = student({
      uid: "known",
      catalog: catalog({
        street: StudentTerrainAdaptationRank.A,
        outdoor: StudentTerrainAdaptationRank.B,
        indoor: StudentTerrainAdaptationRank.C,
      }),
    });
    const missing = student({ uid: "missing", catalog: null });
    const terrainFilter = {
      ...defaultStudentDirectoryFilterState,
      terrain: { street: ["A"], outdoor: [], indoor: [] },
    };

    expect(filterAndSortStudentDirectory([missing, known], terrainFilter, signedOut).map(({ uid }) => uid)).toEqual([
      "known",
    ]);
    expect(getStudentDirectoryLabel(missing, "sortValue", "street", signedOut)?.value).toBe("알 수 없음");
    for (const direction of ["asc", "desc"] as const) {
      expect(
        filterAndSortStudentDirectory(
          [missing, known],
          { ...defaultStudentDirectoryFilterState, sort: "street", direction },
          signedOut,
        ).map(({ uid }) => uid),
      ).toEqual(["known", "missing"]);
    }
  });

  it("keeps the terrain rank in the accessible label for both sort-value and display-value labels", () => {
    const known = student({
      catalog: catalog({
        street: StudentTerrainAdaptationRank.Ss,
        outdoor: StudentTerrainAdaptationRank.A,
        indoor: StudentTerrainAdaptationRank.B,
      }),
    });

    expect(getStudentDirectoryLabel(known, "sortValue", "street", signedOut)).toMatchObject({
      kind: "terrain",
      value: "SS",
      ariaLabel: "시가지 적성 SS",
    });
    expect(getStudentDirectoryLabel(known, "street", "release", signedOut)).toMatchObject({
      kind: "terrain",
      value: "SS",
      ariaLabel: "시가지 적성 SS",
    });
  });

  it("puts missing personal input before unrecruited and keeps both groups last in either direction", () => {
    const recruited = student({ uid: "recruited", studentVariant: { primaryStudent: { uid: "r" } } });
    const missing = student({ uid: "missing", studentVariant: { primaryStudent: { uid: "m" } } });
    const unrecruited = student({ uid: "unrecruited", studentVariant: { primaryStudent: { uid: "u" } } });
    const unknown = student({ uid: "unknown", studentVariant: null });
    const personal: StudentDirectoryPersonalState = {
      status: "loaded",
      byPrimaryUid: {
        r: { status: "recruited", tier: 7, level: 90, bondLevel: 20 },
        m: { status: "recruited", tier: null, level: null, bondLevel: null },
      },
    };
    const sort = (direction: "asc" | "desc") =>
      filterAndSortStudentDirectory(
        [unrecruited, unknown, missing, recruited],
        { ...defaultStudentDirectoryFilterState, sort: "myLevel", direction },
        personal,
      ).map(({ uid }) => uid);

    expect(sort("desc")).toEqual(["recruited", "missing", "unrecruited", "unknown"]);
    expect(sort("asc")).toEqual(["recruited", "missing", "unrecruited", "unknown"]);
    expect(getStudentDirectoryLabel(unknown, "sortValue", "myLevel", personal)?.value).toBe("알 수 없음");
  });

  it("masks saved personal criteria until records are loaded", () => {
    const saved = {
      ...defaultStudentDirectoryFilterState,
      sort: "myTier" as const,
      recruitment: ["unrecruited" as const],
    };
    expect(getStudentDirectoryVisibleState(saved, "signed-out")).toMatchObject({
      sort: "release",
      direction: "desc",
      recruitment: [],
    });
    expect(getStudentDirectoryVisibleState(saved, "failed")).toMatchObject({
      sort: "release",
      direction: "desc",
      recruitment: [],
    });
    expect(getStudentDirectoryVisibleState(saved, "loaded")).toBe(saved);
  });

  it("preserves public sort and direction when private records are unavailable", () => {
    const saved = {
      ...defaultStudentDirectoryFilterState,
      sort: "name" as const,
      direction: "desc" as const,
      recruitment: ["recruited" as const],
    };
    expect(getStudentDirectoryVisibleState(saved, "signed-out")).toMatchObject({
      sort: "name",
      direction: "desc",
      recruitment: [],
    });
    expect(getStudentDirectoryVisibleState(saved, "failed")).toMatchObject({
      sort: "name",
      direction: "desc",
      recruitment: [],
    });
  });

  it("groups unknown values last and labels release and personal states explicitly", () => {
    const known = student({
      uid: "known",
      school: "millennium",
      released: false,
      releaseAt: "2025-03-07T00:00:00.000Z",
    });
    const unknown = student({ uid: "unknown", school: "not-mapped" });
    expect(groupStudentDirectoryStudents([unknown, known], "school").map(({ label }) => label)).toEqual([
      "밀레니엄",
      "알 수 없음",
    ]);
    expect(getStudentDirectoryLabel(known, "sortValue", "release", signedOut)).toMatchObject({
      value: "예정",
      narrowValue: "예정",
      ariaLabel: "2025/03/07 출시 예정",
    });
    expect(getStudentDirectoryLabel(known, "sortValue", "name", signedOut)).toBeNull();
    expect(getStudentDirectoryLabel(student({ releaseAt: null }), "sortValue", "release", signedOut)?.value).toBe(
      "알 수 없음",
    );

    const personal: StudentDirectoryPersonalState = {
      status: "loaded",
      byPrimaryUid: { recruited: { status: "recruited", tier: null, level: null, bondLevel: null } },
    };
    expect(
      getStudentDirectoryLabel(
        student({ studentVariant: { primaryStudent: { uid: "recruited" } } }),
        "sortValue",
        "myLevel",
        personal,
      )?.value,
    ).toBe("미입력");
    expect(
      getStudentDirectoryLabel(
        student({ studentVariant: { primaryStudent: { uid: "absent" } } }),
        "sortValue",
        "myLevel",
        personal,
      )?.value,
    ).toBe("미모집");
  });

  it("hides card labels for every sort when display is none and keeps sortValue selectable", () => {
    const released = student({ releaseAt: "2025-03-07T00:00:00.000Z" });
    expect(defaultStudentDirectoryFilterState.displayBy).toBe("none");
    for (const sort of STUDENT_DIRECTORY_SORTS) {
      expect(getStudentDirectoryLabel(released, "none", sort, signedOut)).toBeNull();
    }
    expect(getStudentDirectoryLabel(released, "sortValue", "release", signedOut)?.value).toBe("2025/03/07");
  });

  it("formats release labels in the supplied display timezone", () => {
    const studentAtUtcAfternoon = student({ releaseAt: "2025-03-07T15:30:00.000Z" });
    const laterInstantSameLocalDate = student({ uid: "later", releaseAt: "2025-03-07T16:30:00.000Z" });

    expect(getStudentDirectoryLabel(studentAtUtcAfternoon, "sortValue", "release", signedOut, "UTC")?.value).toBe(
      "2025/03/07",
    );
    expect(
      getStudentDirectoryLabel(studentAtUtcAfternoon, "sortValue", "release", signedOut, "Asia/Seoul"),
    ).toMatchObject({
      value: "2025/03/08",
      narrowValue: "25/03/08",
      ariaLabel: "2025/03/08",
    });
    expect(
      getStudentDirectoryLabel(laterInstantSameLocalDate, "sortValue", "release", signedOut, "Asia/Seoul")?.value,
    ).toBe("2025/03/08");
  });
});
