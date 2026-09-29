import { describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { getStudentDirectoryStudents, syncStudentDirectory } from "~/models/student-directory";

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const env = { DISABLE_CACHE: "true" } as unknown as Env;

function rawStudent(overrides: Record<string, unknown> = {}) {
  return {
    uid: "student-a",
    name: "학생",
    familyName: "성",
    altNames: ["별칭"],
    school: "millennium",
    initialTier: 3,
    order: 10,
    attackType: "explosive",
    defenseType: "light",
    position: "front",
    tacticRole: "attacker",
    birthday: null,
    role: "striker",
    equipments: ["hat", "bag", "shoes"],
    released: true,
    catalog: {
      profile: { age: "17세", schoolYear: "2학년", height: "159.7cm" },
      terrainAdaptations: { street: "SS", outdoor: "A", indoor: "B" },
    },
    ...overrides,
  };
}

describe("student directory source", () => {
  it("normalizes only the compact public projection and preserves source strings", async () => {
    mockedRunQuery.mockResolvedValueOnce({ data: { students: [rawStudent()] }, error: undefined } as never);

    await expect(getStudentDirectoryStudents(env, true)).resolves.toEqual([
      expect.objectContaining({
        uid: "student-a",
        familyName: "성",
        altNames: ["별칭"],
        catalog: {
          profile: { age: "17세", schoolYear: "2학년", height: "159.7cm" },
          terrainAdaptations: { street: "SS", outdoor: "A", indoor: "B" },
        },
      }),
    ]);
  });

  it("filters unreleased students only when the caller requests the public released list", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: {
        students: [rawStudent(), rawStudent({ uid: "student-b", released: false })],
      },
      error: undefined,
    } as never);

    await expect(getStudentDirectoryStudents(env)).resolves.toHaveLength(1);
  });

  it("keeps an explicit null catalog for students without compact public data", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: { students: [rawStudent({ catalog: null })] },
      error: undefined,
    } as never);

    await expect(getStudentDirectoryStudents(env, true)).resolves.toEqual([expect.objectContaining({ catalog: null })]);
  });

  it("rejects upstream errors and malformed student responses", async () => {
    mockedRunQuery.mockResolvedValueOnce({ data: undefined, error: new Error("GraphQL failure") } as never);
    await expect(syncStudentDirectory(env)).rejects.toThrow("GraphQL failure");

    mockedRunQuery.mockResolvedValueOnce({ data: {}, error: undefined } as never);
    await expect(getStudentDirectoryStudents(env, true)).rejects.toThrow("missing students");
  });
});
