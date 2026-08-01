import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  COMMUNITY_WRITE_FREEZE_KEY,
  COMMUNITY_WRITE_MAINTENANCE_DESCRIPTION,
  COMMUNITY_WRITE_MAINTENANCE_RESULT,
  COMMUNITY_WRITE_MAINTENANCE_TITLE,
} from "~/domain/community-write-freeze";
import { getLogger } from "~/lib/observability.server";

jest.mock("~/lib/observability.server", () => ({
  getLogger: jest.fn(() => ({
    error: jest.fn(),
  })),
}));

import {
  communityWriteMaintenanceResponse,
  getCommunityWriteFreezeDecision,
} from "~/lib/community-write-freeze.server";

const mockedGetLogger = getLogger as jest.MockedFunction<typeof getLogger>;

function createEnv(get: (key: string) => Promise<string | null>) {
  return { KV_CACHE: { get: jest.fn(get) } } as unknown as Env;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("community write freeze", () => {
  it("uses the repository key segment convention", () => {
    expect(COMMUNITY_WRITE_FREEZE_KEY).toBe("ops::community-write-freeze::v1");
  });

  it("keeps the approved maintenance copy stable", () => {
    expect(COMMUNITY_WRITE_MAINTENANCE_TITLE).toBe("서비스 점검 중이에요");
    expect(COMMUNITY_WRITE_MAINTENANCE_DESCRIPTION).toBe(
      "일부 기능을 사용할 수 없어요. 조회성 기능은 정상적으로 이용할 수 있으니 잠시 후 다시 시도해주세요.",
    );
  });

  it("keeps writes enabled when the key is absent", async () => {
    const env = createEnv(async () => null);

    await expect(getCommunityWriteFreezeDecision(env)).resolves.toEqual({ frozen: false, readFailed: false });
  });

  it("freezes writes when the key is present", async () => {
    const get = jest.fn(async (key: string) => {
      expect(key).toBe(COMMUNITY_WRITE_FREEZE_KEY);
      return "enabled";
    });

    await expect(getCommunityWriteFreezeDecision(createEnv(get))).resolves.toEqual({
      frozen: true,
      readFailed: false,
    });
  });

  it("fails closed and logs when KV cannot be read", async () => {
    const logger = { error: jest.fn() };
    mockedGetLogger.mockReturnValue(logger as unknown as ReturnType<typeof getLogger>);

    await expect(
      getCommunityWriteFreezeDecision(
        createEnv(async () => {
          throw new Error("KV unavailable");
        }),
      ),
    ).resolves.toEqual({ frozen: true, readFailed: true });

    expect(logger.error).toHaveBeenCalledWith(
      "Community write freeze KV read failed; failing closed",
      expect.any(Error),
      expect.objectContaining({ key: COMMUNITY_WRITE_FREEZE_KEY }),
    );
  });

  it("returns the typed maintenance response", async () => {
    const response = communityWriteMaintenanceResponse();

    expect(response.init?.status).toBe(503);
    expect(response.data).toEqual(COMMUNITY_WRITE_MAINTENANCE_RESULT);
  });
});
