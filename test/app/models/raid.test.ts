import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { runQuery } from "~/lib/baql";
import { getAllRaidSchedules } from "../../../app/models/raid";

jest.mock("~/lib/baql", () => ({
  runQuery: jest.fn(),
}));

const mockedRunQuery = runQuery as jest.MockedFunction<typeof runQuery>;

function createEnv(): Env {
  return {
    DISABLE_CACHE: "true",
    KV_CACHE: {
      get: jest.fn(async () => null),
      put: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      list: jest.fn(async () => ({ keys: [], list_complete: true })),
    },
  } as unknown as Env;
}

afterEach(() => {
  jest.restoreAllMocks();
  mockedRunQuery.mockReset();
});

describe("getAllRaidSchedules", () => {
  it("does not pass an endAfter bound so historical raid routes stay linkable", async () => {
    mockedRunQuery.mockResolvedValueOnce({
      data: { raidSchedules: { nodes: [] } },
      error: undefined,
    } as Awaited<ReturnType<typeof runQuery>>);

    await expect(getAllRaidSchedules(createEnv(), true)).resolves.toEqual([]);

    expect(runQuery).toHaveBeenCalledWith(expect.anything(), {
      region: "gl",
      endAfter: null,
    });
  });
});
