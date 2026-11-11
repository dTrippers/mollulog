import { describe, expect, it, jest } from "@jest/globals";
import type { Party } from "~/models/party.server";
import {
  buildQuestionMemberSnapshot,
  mapQuestionSnapshotFavorites,
  mapQuestionSnapshotFormations,
  mapQuestionSnapshotRecruitmentPlans,
  mapQuestionSnapshotResources,
  mapQuestionSnapshotStudents,
} from "~/models/question-member-snapshot.server";
import type { RecruitedStudent } from "~/models/recruited-student";
import type { RelationshipLevel } from "~/models/relationship-level";

const student = (tier: number, studentUid: string): RecruitedStudent => ({
  uid: `recruited-${studentUid}`,
  studentUid,
  tier,
  level: null,
  skillEx: 5,
  skillNormal: null,
  skillEnhanced: 7,
  skillSub: null,
  equip1: 8,
  equip2: null,
  equip3: 6,
  equipSpecial: null,
  weaponLevel: null,
  abilityHp: null,
  abilityAtk: null,
  abilityHeal: null,
});

const relationship = (studentId: string, currentLevel: number | null): RelationshipLevel => ({
  uid: `relationship-${studentId}`,
  studentId,
  currentLevel,
  currentExp: null,
  targetLevel: null,
  items: {},
});

const unenteredPlanner = async () => ({ pyroxene: { resources: null, eventData: {} }, ap: null });
const noInventory = async () => ({});

describe("question member snapshot student and favorite mapping", () => {
  it("maps student and weapon stars and preserves unentered values as null", () => {
    expect(
      mapQuestionSnapshotStudents(
        [student(4, "four-star"), student(8, "weapon-three")],
        [relationship("four-star", null)],
      ),
    ).toEqual([
      {
        studentUid: "four-star",
        star: 4,
        weaponStar: 0,
        level: null,
        skills: { ex: 5, normal: null, enhanced: 7, sub: null },
        equipmentTiers: [8, null, 6],
        equipSpecial: null,
        relationshipLevel: null,
        eleph: null,
      },
      {
        studentUid: "weapon-three",
        star: 5,
        weaponStar: 3,
        level: null,
        skills: { ex: 5, normal: null, enhanced: 7, sub: null },
        equipmentTiers: [8, null, 6],
        equipSpecial: null,
        relationshipLevel: null,
        eleph: null,
      },
    ]);
  });

  it("maps per-content favorites without adding unverified fields", () => {
    expect(
      mapQuestionSnapshotFavorites([
        { uid: "favorite-1", studentId: "student-a", contentId: "pickup-a" },
        { uid: "favorite-2", studentId: "student-b", contentId: "pickup-b" },
      ]),
    ).toEqual([
      { studentUid: "student-a", contentId: "pickup-a" },
      { studentUid: "student-b", contentId: "pickup-b" },
    ]);
  });

  it("maps saved formations only, keeps null raid references, and omits memo", () => {
    const parties: Party[] = [
      {
        uid: "private-party",
        name: "Private formation",
        studentIds: [
          ["student-a", null],
          [null, "student-b"],
        ],
        raidType: null,
        seasonIndex: null,
        memo: "private memo must not be serialized",
        showAsRaidTip: false,
      },
      {
        uid: "guide-without-party-block",
        name: "Guide",
        studentIds: [],
        raidType: " 총력전 ",
        seasonIndex: 20,
        memo: "not a formation",
        showAsRaidTip: true,
      },
    ];

    expect(mapQuestionSnapshotFormations(parties)).toEqual([
      {
        name: "Private formation",
        raidType: null,
        seasonIndex: null,
        studentUids: [
          ["student-a", null],
          [null, "student-b"],
        ],
      },
    ]);
  });

  it("builds the exact v2 snapshot shape and requests private parties by account id", async () => {
    const getUserPartiesByUserId = jest.fn(
      async (_env: Env, userId: number, options?: { includePrivate?: boolean }) => {
        expect(userId).toBe(7);
        expect(options?.includePrivate).toBe(true);
        return [
          {
            uid: "private-party",
            name: "Private formation",
            studentIds: [["weapon-three", null]],
            raidType: null,
            seasonIndex: null,
            memo: "never copied",
            showAsRaidTip: false,
          },
        ];
      },
    );

    const snapshot = await buildQuestionMemberSnapshot({} as Env, 7, {
      getRecruitedStudents: async () => [student(8, "weapon-three")],
      getRelationshipLevels: async () => [relationship("weapon-three", 32)],
      getUserFavoritedStudents: async () => [{ uid: "f1", studentId: "weapon-three", contentId: "pickup-1" }],
      getUserPartiesByUserId,
      getPlannerState: unenteredPlanner,
      getUserResourceInventoryMapByItemUids: noInventory,
    });

    expect(snapshot).toEqual({
      version: 2,
      students: [
        {
          studentUid: "weapon-three",
          star: 5,
          weaponStar: 3,
          level: null,
          skills: { ex: 5, normal: null, enhanced: 7, sub: null },
          equipmentTiers: [8, null, 6],
          equipSpecial: null,
          relationshipLevel: 32,
          eleph: null,
        },
      ],
      favorites: [{ studentUid: "weapon-three", contentId: "pickup-1" }],
      formations: [
        {
          name: "Private formation",
          raidType: null,
          seasonIndex: null,
          studentUids: [["weapon-three", null]],
        },
      ],
      resources: null,
      recruitmentPlans: [],
      accountLevel: null,
    });
    expect(Object.keys(snapshot).sort()).toEqual([
      "accountLevel",
      "favorites",
      "formations",
      "recruitmentPlans",
      "resources",
      "students",
      "version",
    ]);
    expect(Object.keys(snapshot.formations[0]).sort()).toEqual(["name", "raidType", "seasonIndex", "studentUids"]);
    expect(getUserPartiesByUserId).toHaveBeenCalledTimes(1);
  });

  it("loads formations by immutable session account id after rename and username reuse", async () => {
    const olderSession = { id: 7, username: "old-name" };
    const storedFormations = [
      {
        ownerId: 7,
        ownerUsername: "new-name",
        party: {
          uid: "renamed-account-party",
          name: "Renamed account formation",
          studentIds: [["student-a"]],
          raidType: null,
          seasonIndex: null,
          memo: null,
          showAsRaidTip: false,
        },
      },
      {
        ownerId: 99,
        ownerUsername: "old-name",
        party: {
          uid: "reused-username-party",
          name: "Other account formation",
          studentIds: [["student-b"]],
          raidType: null,
          seasonIndex: null,
          memo: null,
          showAsRaidTip: false,
        },
      },
    ];
    const getUserPartiesByUserId = jest.fn(async (_env: Env, userId: number, _options?: { includePrivate?: boolean }) =>
      storedFormations.filter(({ ownerId }) => ownerId === userId).map(({ party }) => party),
    );

    const snapshot = await buildQuestionMemberSnapshot({} as Env, olderSession.id, {
      getRecruitedStudents: async () => [],
      getRelationshipLevels: async () => [],
      getUserFavoritedStudents: async () => [],
      getUserPartiesByUserId,
      getPlannerState: unenteredPlanner,
      getUserResourceInventoryMapByItemUids: noInventory,
    });

    expect(getUserPartiesByUserId).toHaveBeenCalledWith({} as Env, olderSession.id, { includePrivate: true });
    expect(snapshot.formations).toEqual([
      {
        name: "Renamed account formation",
        raidType: null,
        seasonIndex: null,
        studentUids: [["student-a"]],
      },
    ]);
  });

  it("carries entered resources, plans, eleph, and account level, and asks only for owned students' eleph", async () => {
    const getUserResourceInventoryMapByItemUids = jest.fn(async (_env: Env, _userId: number, itemUids: string[]) => {
      expect(itemUids).toEqual(["owned-a", "owned-b"]);
      return { "owned-a": 0 };
    });
    const snapshot = await buildQuestionMemberSnapshot({} as Env, 7, {
      getRecruitedStudents: async () => [student(3, "owned-a"), student(9, "owned-b")],
      getRelationshipLevels: async () => [],
      getUserFavoritedStudents: async () => [],
      getUserPartiesByUserId: async () => [],
      getPlannerState: async () => ({
        pyroxene: {
          resources: {
            inputAt: "2026-11-11T12:00:00.000Z",
            pyroxene: 24000,
            oneTimeTicket: 3,
            tenTimeTicket: 0,
            recruitmentStacks: { regular: 40, limited: 0 },
          },
          eventData: {
            "dive-into-ocean": { completed: false, expectedTrials: null },
            "5-5th-fes": { completed: false, expectedTrials: 200, targetTiers: { "owned-b": 7 } },
          },
        },
        ap: { accountLevel: 90 },
      }),
      getUserResourceInventoryMapByItemUids,
    });

    expect(snapshot.students.map(({ studentUid, eleph }) => ({ studentUid, eleph }))).toEqual([
      { studentUid: "owned-a", eleph: 0 },
      { studentUid: "owned-b", eleph: null },
    ]);
    expect(snapshot.resources).toEqual({
      inputAt: "2026-11-11T12:00:00.000Z",
      pyroxene: 24000,
      oneTimeTicket: 3,
      tenTimeTicket: 0,
      recruitmentStacks: { regular: 40, limited: 0 },
    });
    expect(snapshot.recruitmentPlans).toEqual([
      {
        plannerEventUid: "5-5th-fes",
        completed: false,
        expectedTrials: 200,
        targetTiers: [{ studentUid: "owned-b", targetTier: 7 }],
      },
      { plannerEventUid: "dive-into-ocean", completed: false, expectedTrials: null, targetTiers: [] },
    ]);
    expect(snapshot.accountLevel).toBe(90);
  });

  it("keeps unentered resources, stacks, and account level as null instead of zero", () => {
    expect(mapQuestionSnapshotResources(null)).toBeNull();
    expect(
      mapQuestionSnapshotResources({
        inputAt: "2026-08-23T21:00:17.635Z",
        pyroxene: 70250,
        oneTimeTicket: 0,
        tenTimeTicket: 0,
      }),
    ).toEqual({
      inputAt: "2026-08-23T21:00:17.635Z",
      pyroxene: 70250,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
      recruitmentStacks: null,
    });
    expect(mapQuestionSnapshotRecruitmentPlans({})).toEqual([]);
  });
});
