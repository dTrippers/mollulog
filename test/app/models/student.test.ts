import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { Attack, Defense, RoleEnum } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import {
  getAllStudents,
  getAllStudentsMap,
  getPrimaryStudentUid,
  getStudentForms,
  getStudentSkillItemsBatch,
  getStudentWeaponAvailability,
  syncRawStudents,
} from "~/models/student";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;

describe("student weapon availability", () => {
  it("maps returned students without a weapon to false and keeps omitted requested students absent", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: {
        students: [
          { uid: "with-weapon", catalog: { weapon: { name: "Weapon" } } },
          { uid: "without-weapon", catalog: null },
        ],
      },
      error: undefined,
    } as never);

    const result = await getStudentWeaponAvailability({ DISABLE_CACHE: "true" } as unknown as Env, [
      "with-weapon",
      "without-weapon",
      "omitted",
    ]);

    expect(result).toEqual(
      new Map([
        ["with-weapon", true],
        ["without-weapon", false],
      ]),
    );
    expect(result.has("omitted")).toBe(false);
  });
});

describe("student skill items", () => {
  it("fails instead of returning students without skill items when the query fails", async () => {
    mockedRunQuery.mockResolvedValueOnce({ data: undefined, error: new Error("baql down") } as never);

    await expect(getStudentSkillItemsBatch({ DISABLE_CACHE: "true" } as unknown as Env, ["arona"])).rejects.toThrow(
      "baql down",
    );
  });
});

describe("student catalog source validation", () => {
  const env = { DISABLE_CACHE: "true" } as unknown as Env;

  it("rejects a GraphQL error instead of returning an empty catalog", async () => {
    mockedRunQuery.mockResolvedValue({ data: undefined, error: new Error("GraphQL failure") } as never);

    await expect(syncRawStudents(env)).rejects.toThrow("GraphQL failure");
  });

  it("rejects a response without the required student list", async () => {
    mockedRunQuery.mockResolvedValue({ data: {}, error: undefined } as never);

    await expect(getAllStudents(env)).rejects.toThrow("missing students");
  });

  it("accepts a valid empty student list", async () => {
    mockedRunQuery.mockResolvedValue({ data: { students: [] }, error: undefined } as never);

    await expect(getAllStudents(env)).resolves.toEqual([]);
  });
});

describe("student forms", () => {
  it("maps every record of a multiclass variant to its representative and in-game form number", async () => {
    const swimsuitShunForm = (uid: string, name: string) => ({
      uid,
      name,
      attackType: Attack.Sonic,
      defenseType: Defense.Light,
      role: RoleEnum.Striker,
    });
    mockedRunQuery.mockResolvedValueOnce({
      data: {
        students: [
          {
            studentVariant: {
              isMulticlass: true,
              primaryStudent: { uid: "10143" },
              students: [swimsuitShunForm("10143", "슌(수영복)"), swimsuitShunForm("10144", "슈에링(수영복)")],
            },
          },
          {
            studentVariant: {
              isMulticlass: false,
              primaryStudent: { uid: "10011" },
              students: [swimsuitShunForm("10011", "슌")],
            },
          },
        ],
      },
      error: undefined,
    } as never);

    const forms = await getStudentForms({ DISABLE_CACHE: "true" } as unknown as Env);

    expect(forms).toEqual({
      "10143": { ...swimsuitShunForm("10143", "슌(수영복)"), primaryUid: "10143", formIndex: 1 },
      "10144": { ...swimsuitShunForm("10144", "슈에링(수영복)"), primaryUid: "10143", formIndex: 2 },
    });
  });
});

describe("primary student uid", () => {
  const env = { DISABLE_CACHE: "true" } as unknown as Env;

  it("reads the primary form from BAQL instead of the cached form list", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: { student: { uid: "10144", studentVariant: { primaryStudent: { uid: "10143" } } } },
      error: undefined,
    } as never);

    await expect(getPrimaryStudentUid(env, "10144")).resolves.toBe("10143");
    expect(mockedRunQuery).toHaveBeenLastCalledWith(expect.anything(), { uid: "10144" });
  });

  it("returns null for a student BAQL does not have", async () => {
    mockedRunQuery.mockResolvedValueOnce({ data: { student: null }, error: undefined } as never);

    await expect(getPrimaryStudentUid(env, "missing")).resolves.toBeNull();
  });

  it("fails instead of treating the uid as its own primary when BAQL fails", async () => {
    mockedRunQuery.mockResolvedValueOnce({ data: undefined, error: new Error("baql down") } as never);

    await expect(getPrimaryStudentUid(env, "10144")).rejects.toThrow("baql down");
  });
});

describe("student release state", () => {
  const releaseAt = "2026-11-17T02:00:00.000Z";
  const releaseTime = Date.parse(releaseAt);

  function createKvEnv() {
    const store = new Map<string, string>();
    return {
      KV_CACHE: {
        get: jest.fn(async (key: string) => store.get(key) ?? null),
        put: jest.fn(async (key: string, value: string) => {
          store.set(key, value);
        }),
        delete: jest.fn(async (key: string) => {
          store.delete(key);
        }),
        list: jest.fn(async () => ({ keys: [], list_complete: true })),
      },
    } as unknown as Env;
  }

  function baqlStudent(uid: string, studentReleaseAt: string | Date | null) {
    return {
      uid,
      name: uid,
      familyName: null,
      altNames: [],
      school: "trinity",
      initialTier: 3,
      order: 1,
      attackType: Attack.Explosive,
      defenseType: Defense.Light,
      position: "back",
      tacticRole: "dealer",
      birthday: null,
      role: RoleEnum.Striker,
      equipments: [],
      weaponType: null,
      releaseAt: studentReleaseAt,
    };
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("lists a student whose release time passes after the cache was written, without refreshing the cache", async () => {
    mockedRunQuery.mockReset();
    mockedRunQuery.mockResolvedValue({
      data: {
        students: [
          baqlStudent("released-earlier", "2026-01-01T00:00:00.000Z"),
          baqlStudent("new-fes", releaseAt),
          baqlStudent("later", "2026-12-01T00:00:00.000Z"),
          baqlStudent("no-release-time", null),
        ],
      },
      error: undefined,
    } as never);
    const env = createKvEnv();
    const now = jest.spyOn(Date, "now");

    // The cron writes the cache ten minutes before the release, as it did for 5-5th-fes.
    now.mockReturnValue(releaseTime - 10 * 60 * 1000);
    await expect(getAllStudents(env)).resolves.toEqual([expect.objectContaining({ uid: "released-earlier" })]);

    now.mockReturnValue(releaseTime + 11 * 60 * 1000);
    const students = await getAllStudents(env);
    expect(students.map(({ uid }) => uid)).toEqual(["released-earlier", "new-fes"]);
    expect(Object.keys(await getAllStudentsMap(env))).toEqual(["released-earlier", "new-fes"]);
    expect(mockedRunQuery).toHaveBeenCalledTimes(1);

    const all = await getAllStudents(env, true);
    expect(all.map(({ uid, released }) => [uid, released])).toEqual([
      ["released-earlier", true],
      ["new-fes", true],
      ["later", false],
      ["no-release-time", false],
    ]);
    expect(all[0]).not.toHaveProperty("releaseAt");
  });

  it("caches the release time as a UTC ISO string instead of the release state", async () => {
    mockedRunQuery.mockReset();
    mockedRunQuery.mockResolvedValue({
      data: { students: [baqlStudent("new-fes", new Date(releaseAt))] },
      error: undefined,
    } as never);
    const env = createKvEnv();

    await syncRawStudents(env);

    const put = (env.KV_CACHE.put as jest.Mock).mock.calls.find(([key]) => key === "source::student::v3::all");
    expect(put).toBeDefined();
    const cached = JSON.parse(put?.[1] as string).data;
    expect(cached).toEqual([expect.objectContaining({ uid: "new-fes", releaseAt })]);
    expect(cached[0]).not.toHaveProperty("released");
  });
});
