import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetStudentGrowthWithMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRelationshipLevel = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitedStudents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetAllStudentsMap = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetStudentGearData = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/models/student-growth", () => ({
  getStudentGrowthWithMetadata: mockGetStudentGrowthWithMetadata,
  getStudentGrowthsWithMetadata: jest.fn(),
}));
jest.mock("~/models/relationship-level", () => ({
  getRelationshipLevel: mockGetRelationshipLevel,
  getRelationshipLevels: jest.fn(),
}));
jest.mock("~/models/recruited-student", () => ({ getRecruitedStudents: mockGetRecruitedStudents }));
jest.mock("~/models/student", () => ({ getAllStudentsMap: mockGetAllStudentsMap }));
jest.mock("~/models/growth-resource", () => ({
  getStudentGearData: mockGetStudentGearData,
  getStudentGrowthResourceRequirements: jest.fn(),
}));

import { loadStudentRow } from "~/routes/utils.growth._components/growth-data.server";

describe("growth planner nullable relationship row", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStudentGrowthWithMetadata.mockResolvedValue(null);
    mockGetRelationshipLevel.mockResolvedValue({ currentLevel: null, targetLevel: null });
    mockGetRecruitedStudents.mockResolvedValue([]);
    mockGetAllStudentsMap.mockResolvedValue({ "student-a": { uid: "student-a", name: "Student A", order: 1 } });
    mockGetStudentGearData.mockResolvedValue(new Map());
  });

  it("passes missing current and target relationship ranks through as empty values", async () => {
    const row = await loadStudentRow({} as Env, 1, "student-a");

    expect(row).toMatchObject({ relationshipCurrentLevel: null, relationshipTargetLevel: null });
  });
});
