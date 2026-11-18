import { afterEach, describe, expect, it, jest } from "@jest/globals";
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
    releaseAt: null,
    attackType: "explosive",
    defenseType: "light",
    position: "front",
    tacticRole: "attacker",
    birthday: null,
    role: "striker",
    equipments: ["hat", "bag", "shoes"],
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
        releaseAt: null,
        catalog: {
          profile: { age: "17세", schoolYear: "2학년", height: "159.7cm" },
          terrainAdaptations: { street: "SS", outdoor: "A", indoor: "B" },
        },
      }),
    ]);
  });

  it.each([
    ["wire string", "2025-03-07T15:30:00.000Z"],
    ["Date", new Date("2025-03-07T15:30:00.000Z")],
  ])("normalizes a BAQL release timestamp supplied as a %s to UTC ISO", async (_shape, releaseAt) => {
    mockedRunQuery.mockResolvedValueOnce({
      data: { students: [rawStudent({ releaseAt })] },
      error: undefined,
    } as never);

    await expect(getStudentDirectoryStudents(env, true)).resolves.toEqual([
      expect.objectContaining({ releaseAt: "2025-03-07T15:30:00.000Z" }),
    ]);
  });

  it("filters students not released by their release time only when the caller requests the public released list", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: {
        students: [
          rawStudent({ releaseAt: "2025-03-07T15:30:00.000Z" }),
          rawStudent({ uid: "student-b", releaseAt: "2999-01-01T00:00:00.000Z" }),
          rawStudent({ uid: "student-c", releaseAt: null }),
        ],
      },
      error: undefined,
    } as never);

    await expect(getStudentDirectoryStudents(env)).resolves.toEqual([
      expect.objectContaining({ uid: "student-a", released: true }),
    ]);
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

describe("student directory release state", () => {
  const releaseAt = "2026-11-17T02:00:00.000Z";
  const releaseTime = Date.parse(releaseAt);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("lists a student whose release time passes after the cache was written, without refreshing the cache", async () => {
    const store = new Map<string, string>();
    const kvEnv = {
      KV_CACHE: {
        get: jest.fn(async (key: string) => store.get(key) ?? null),
        put: jest.fn(async (key: string, value: string) => {
          store.set(key, value);
        }),
        delete: jest.fn(async () => undefined),
        list: jest.fn(async () => ({ keys: [], list_complete: true })),
      },
    } as unknown as Env;
    mockedRunQuery.mockReset();
    mockedRunQuery.mockResolvedValue({
      data: {
        students: [
          rawStudent({ uid: "new-fes", releaseAt }),
          rawStudent({ uid: "later", releaseAt: "2026-12-01T00:00:00.000Z" }),
        ],
      },
      error: undefined,
    } as never);
    const now = jest.spyOn(Date, "now");

    now.mockReturnValue(releaseTime - 10 * 60 * 1000);
    await expect(syncStudentDirectory(kvEnv)).resolves.toEqual([
      expect.objectContaining({ uid: "new-fes", released: false }),
      expect.objectContaining({ uid: "later", released: false }),
    ]);
    await expect(getStudentDirectoryStudents(kvEnv)).resolves.toEqual([]);

    now.mockReturnValue(releaseTime + 11 * 60 * 1000);
    await expect(getStudentDirectoryStudents(kvEnv)).resolves.toEqual([
      expect.objectContaining({ uid: "new-fes", released: true }),
    ]);
    expect(mockedRunQuery).toHaveBeenCalledTimes(1);

    const cached = JSON.parse(store.get("source::student-directory::v3::all") as string).data;
    expect(cached[0]).not.toHaveProperty("released");
  });
});
