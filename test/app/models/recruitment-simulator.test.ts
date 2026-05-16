import { describe, expect, it } from "@jest/globals";
import { Attack, Defense, RecruitmentTypeEnum } from "../../../app/graphql/graphql";
import {
  buildRecruitmentPoolSnapshot,
  createDefaultRecruitmentRateTable,
  drawRecruitmentTenPull,
} from "../../../app/models/recruitment-simulator";

type PoolStudent = Parameters<typeof buildRecruitmentPoolSnapshot>[0]["students"][number];

function student(
  uid: string,
  {
    initialTier = 3,
    releaseAt = "2026-01-01T02:00:00.000Z",
    archiveAt = null,
    recruitments = [{ recruitmentType: RecruitmentTypeEnum.Usual }],
  }: Partial<Pick<PoolStudent, "initialTier" | "releaseAt" | "archiveAt" | "recruitments">> = {},
): PoolStudent {
  return {
    uid,
    name: `학생 ${uid}`,
    initialTier,
    attackType: Attack.Explosive,
    defenseType: Defense.Light,
    role: "striker",
    releaseAt,
    archiveAt,
    recruitments,
  } as PoolStudent;
}

describe("buildRecruitmentPoolSnapshot", () => {
  it("includes usual students released before the recruitment group and excludes future or archived students", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [],
      },
      students: [
        student("released"),
        student("future", { releaseAt: "2026-06-01T02:00:00.000Z" }),
        student("archived", { archiveAt: "2026-04-01T02:00:00.000Z" }),
        student("archive-starts-now", { archiveAt: "2026-05-01T02:00:00.000Z" }),
      ],
    });

    expect(snapshot.nonPickupStudentsByTier.tier3.map((s) => s.uid)).toEqual(["released"]);
  });

  it("excludes students with no recruitment history or only given recruitments", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [],
      },
      students: [
        student("usual"),
        student("none", { recruitments: [] }),
        student("given-only", { recruitments: [{ recruitmentType: RecruitmentTypeEnum.Given }] }),
        student("limited-only", { recruitments: [{ recruitmentType: RecruitmentTypeEnum.Limited }] }),
        student("fes-only", { recruitments: [{ recruitmentType: RecruitmentTypeEnum.Fes }] }),
      ],
    });

    expect(snapshot.nonPickupStudentsByTier.tier3.map((s) => s.uid)).toEqual(["usual"]);
  });

  it("includes released tier 1 students as the base low-rarity pool even without recruitment history", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [],
      },
      students: [student("tier-1", { initialTier: 1, recruitments: [] }), student("tier-3", { recruitments: [] })],
    });

    expect(snapshot.nonPickupStudentsByTier.tier1.map((s) => s.uid)).toEqual(["tier-1"]);
    expect(snapshot.nonPickupStudentsByTier.tier3).toEqual([]);
  });

  it("includes inactive pickup students in the non-pickup pool regardless of recruitment type", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [
          {
            recruitmentType: RecruitmentTypeEnum.Usual,
            pickup: true,
            studentName: "학생 A",
            student: {
              uid: "A",
              name: "학생 A",
              initialTier: 3,
              attackType: Attack.Explosive,
              defenseType: Defense.Light,
              role: "striker",
            },
          },
          {
            recruitmentType: RecruitmentTypeEnum.Usual,
            pickup: true,
            studentName: "학생 B",
            student: {
              uid: "B",
              name: "학생 B",
              initialTier: 3,
              attackType: Attack.Explosive,
              defenseType: Defense.Light,
              role: "striker",
            },
          },
          {
            recruitmentType: RecruitmentTypeEnum.Limited,
            pickup: true,
            studentName: "학생 C",
            student: {
              uid: "C",
              name: "학생 C",
              initialTier: 3,
              attackType: Attack.Explosive,
              defenseType: Defense.Light,
              role: "striker",
            },
          },
          {
            recruitmentType: RecruitmentTypeEnum.Limited,
            pickup: true,
            studentName: "학생 D",
            student: {
              uid: "D",
              name: "학생 D",
              initialTier: 3,
              attackType: Attack.Explosive,
              defenseType: Defense.Light,
              role: "striker",
            },
          },
        ],
      },
      students: [
        student("A"),
        student("B"),
        student("C", { recruitments: [{ recruitmentType: RecruitmentTypeEnum.Limited }] }),
        student("D", { recruitments: [{ recruitmentType: RecruitmentTypeEnum.Limited }] }),
        student("normal"),
      ],
    });

    expect(snapshot.pickupStudents.map((s) => s.uid)).toEqual(["A", "B", "C", "D"]);
    expect(snapshot.nonPickupStudentsByTier.tier3.map((s) => s.uid)).toEqual(["A", "B", "normal", "C", "D"]);
  });

  it("includes explicit non-pickup students from the current recruitment group even without history", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [
          {
            recruitmentType: RecruitmentTypeEnum.Usual,
            pickup: false,
            studentName: "학생 explicit",
            student: {
              uid: "explicit",
              name: "학생 explicit",
              initialTier: 2,
              attackType: Attack.Explosive,
              defenseType: Defense.Light,
              role: "striker",
            },
          },
        ],
      },
      students: [student("explicit", { initialTier: 2, recruitments: [] })],
    });

    expect(snapshot.nonPickupStudentsByTier.tier2.map((s) => s.uid)).toEqual(["explicit"]);
  });

  it("groups non-pickup students by initial tier", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [],
      },
      students: [
        student("tier-1", { initialTier: 1 }),
        student("tier-2", { initialTier: 2 }),
        student("tier-3", { initialTier: 3 }),
      ],
    });

    expect(snapshot.nonPickupStudentsByTier.tier1.map((s) => s.uid)).toEqual(["tier-1"]);
    expect(snapshot.nonPickupStudentsByTier.tier2.map((s) => s.uid)).toEqual(["tier-2"]);
    expect(snapshot.nonPickupStudentsByTier.tier3.map((s) => s.uid)).toEqual(["tier-3"]);
  });
});

describe("createDefaultRecruitmentRateTable", () => {
  it("uses 3 percent tier3 rates for usual recruitment groups", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [],
      },
      students: [student("tier-1", { initialTier: 1 }), student("tier-2", { initialTier: 2 }), student("tier-3")],
    });

    expect(createDefaultRecruitmentRateTable(snapshot, null)).toEqual({
      normalSlot: { tier1: 0.785, tier2: 0.185, tier3: 0.03 },
      guaranteedSlot: { tier1: 0, tier2: 0.97, tier3: 0.03 },
      pickupRates: {},
    });
  });

  it("uses 6 percent tier3 rates for fes recruitment groups without doubling pickup rates", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Fes,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [
          {
            recruitmentType: RecruitmentTypeEnum.Fes,
            pickup: true,
            studentName: "학생 pickup",
            student: {
              uid: "pickup",
              name: "학생 pickup",
              initialTier: 3,
              attackType: Attack.Explosive,
              defenseType: Defense.Light,
              role: "striker",
            },
          },
        ],
      },
      students: [student("tier-1", { initialTier: 1 }), student("tier-2", { initialTier: 2 }), student("tier-3")],
    });

    expect(createDefaultRecruitmentRateTable(snapshot, "pickup")).toEqual({
      normalSlot: { tier1: 0.755, tier2: 0.185, tier3: 0.06 },
      guaranteedSlot: { tier1: 0, tier2: 0.94, tier3: 0.06 },
      pickupRates: { pickup: 0.007 },
    });
  });
});

describe("drawRecruitmentTenPull", () => {
  it("requires an explicit active pickup student uid", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [
          {
            recruitmentType: RecruitmentTypeEnum.Usual,
            pickup: true,
            studentName: "학생 pickup",
            student: {
              uid: "pickup",
              name: "학생 pickup",
              initialTier: 3,
              attackType: Attack.Explosive,
              defenseType: Defense.Light,
              role: "striker",
            },
          },
        ],
      },
      students: [student("tier-1", { initialTier: 1 }), student("tier-2", { initialTier: 2 }), student("tier-3")],
    });

    expect(() =>
      drawRecruitmentTenPull({ snapshot, activePickupStudentUid: undefined as unknown as string | null }),
    ).toThrow("activePickupStudentUid is required");
  });

  it("uses the guaranteed slot for the tenth result", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [],
      },
      students: [student("tier-1", { initialTier: 1 }), student("tier-2", { initialTier: 2 }), student("tier-3")],
    });
    const randomValues = [0.99, 0, 0.99, 0, 0.99, 0, 0.99, 0, 0.99, 0, 0.99, 0, 0.99, 0, 0.99, 0, 0.99, 0, 0.5, 0];

    const results = drawRecruitmentTenPull({
      snapshot,
      activePickupStudentUid: null,
      random: () => randomValues.shift() ?? 0,
    });

    expect(results.slice(0, 9).map((result) => result.rarity)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(results[9].rarity).toBe(2);
    expect(results[9].student.uid).toBe("tier-2");
  });

  it("can draw a pickup student by its individual pickup rate", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [
          {
            recruitmentType: RecruitmentTypeEnum.Usual,
            pickup: true,
            studentName: "학생 pickup",
            student: {
              uid: "pickup",
              name: "학생 pickup",
              initialTier: 3,
              attackType: Attack.Explosive,
              defenseType: Defense.Light,
              role: "striker",
            },
          },
        ],
      },
      students: [student("tier-1", { initialTier: 1 }), student("tier-2", { initialTier: 2 }), student("tier-3")],
    });

    const [result] = drawRecruitmentTenPull({
      snapshot,
      activePickupStudentUid: "pickup",
      random: () => 0.001,
    });

    expect(result.student.uid).toBe("pickup");
    expect(result.pickup).toBe(true);
    expect(result.rarity).toBe(3);
  });

  it("normalizes rates away from empty rarity pools", () => {
    const snapshot = buildRecruitmentPoolSnapshot({
      recruitmentGroup: {
        uid: "group-1",
        recruitmentType: RecruitmentTypeEnum.Usual,
        startAt: "2026-05-01T02:00:00.000Z",
        recruitments: [],
      },
      students: [student("tier-2", { initialTier: 2 }), student("tier-3")],
    });

    const [result] = drawRecruitmentTenPull({
      snapshot,
      activePickupStudentUid: null,
      random: () => 0.01,
    });

    expect(result.rarity).toBe(3);
    expect(result.student.uid).toBe("tier-3");
  });
});
