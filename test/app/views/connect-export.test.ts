import { describe, expect, it, jest } from "@jest/globals";
import { getConnectExportData } from "~/views/connect-export.server";

jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: jest.fn() }));
jest.mock("~/models/relationship-level", () => ({ getRelationshipLevels: jest.fn() }));
jest.mock("~/models/student", () => ({ getAllStudents: jest.fn() }));
jest.mock("~/models/student-growth", () => ({ getStudentGrowths: jest.fn() }));
jest.mock("~/models/sync-draft", () => ({ listPendingSyncDrafts: jest.fn() }));

describe("connect export view", () => {
  it("composes the export sources and builds a student catalog", async () => {
    const { getRecruitedStudents } =
      jest.requireMock<typeof import("~/models/recruited-student")>("~/models/recruited-student");
    const { getRelationshipLevels } =
      jest.requireMock<typeof import("~/models/relationship-level")>("~/models/relationship-level");
    const { getAllStudents } = jest.requireMock<typeof import("~/models/student")>("~/models/student");
    const { getStudentGrowths } = jest.requireMock<typeof import("~/models/student-growth")>("~/models/student-growth");
    const { listPendingSyncDrafts } = jest.requireMock<typeof import("~/models/sync-draft")>("~/models/sync-draft");

    (getRecruitedStudents as jest.Mock).mockResolvedValue([{ studentUid: "student-1", tier: 5 }] as never);
    (getRelationshipLevels as jest.Mock).mockResolvedValue([
      { studentId: "student-1", currentLevel: 10, targetLevel: 20 },
    ] as never);
    (getAllStudents as jest.Mock).mockResolvedValue([
      { uid: "student-1", name: "학생 1", order: 3 },
      { uid: "student-2", name: "학생 2", order: 4 },
    ] as never);
    (getStudentGrowths as jest.Mock).mockResolvedValue([{ studentUid: "student-1", level: 80 }] as never);
    (listPendingSyncDrafts as jest.Mock).mockResolvedValue([{ uid: "draft-1" }, { uid: "draft-2" }] as never);

    await expect(getConnectExportData({} as Env, 7)).resolves.toEqual({
      pendingDraftCount: 2,
      recruitedStudents: [{ studentUid: "student-1", tier: 5 }],
      studentGrowths: [{ studentUid: "student-1", level: 80 }],
      relationshipLevels: [{ studentId: "student-1", currentLevel: 10, targetLevel: 20 }],
      studentCatalog: {
        "student-1": { name: "학생 1", order: 3 },
        "student-2": { name: "학생 2", order: 4 },
      },
    });

    expect(getRecruitedStudents).toHaveBeenCalledWith({} as Env, 7);
    expect(getAllStudents).toHaveBeenCalledWith({} as Env, true);
  });
});
