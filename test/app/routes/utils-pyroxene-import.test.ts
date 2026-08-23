import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { pyroxeneMaintenanceResult } from "~/domain/pyroxene-cutover";

const mockGetActiveSensei = jest.fn<() => Promise<{ id: number } | null>>();
type AsyncMock = (...args: unknown[]) => Promise<unknown>;
const mockPyroxeneMaintenanceActionResult = jest.fn<AsyncMock>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/components/features/futures", () => ({ useGuestPyroxenePlanner: jest.fn() }));
jest.mock("~/lib/d1-session", () => ({ withD1Session: jest.fn() }));
jest.mock("~/lib/pyroxene-cutover.server", () => ({
  pyroxeneMaintenanceActionResult: mockPyroxeneMaintenanceActionResult,
}));
jest.mock("~/models/favorite-students", () => ({
  favoriteStudent: jest.fn(),
  getUserFavoritedStudents: jest.fn(),
}));
jest.mock("~/models/guest-pyroxene-import", () => ({
  hasGuestImportReceipt: jest.fn(),
  importGuestRecord: jest.fn(),
  importGuestResources: jest.fn(),
  markGuestImportReceipt: jest.fn(),
}));
jest.mock("~/models/pyroxene-planner", () => ({
  ensureCollectedSource: jest.fn(),
  getAllPyroxeneEventData: jest.fn(),
  getCollectedSourceKeys: jest.fn(),
  getLatestPyroxeneOwnedResource: jest.fn(),
  getPyroxenePlannerOptions: jest.fn(),
  getPyroxeneTimelineItems: jest.fn(),
  upsertPyroxeneEventData: jest.fn(),
  upsertPyroxenePlannerOptions: jest.fn(),
}));
jest.mock("~/views/pyroxene", () => ({ getPyroxenePlannerContents: jest.fn() }));

import { action } from "~/routes/utils.pyroxene_.import";

const env = {} as Env;
const ctx = {} as ExecutionContext;

function actionArgs(request: Request) {
  return {
    context: { cloudflare: { env, ctx } },
    request,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 1 });
  mockPyroxeneMaintenanceActionResult.mockResolvedValue(null);
});

describe("Pyroxene import maintenance", () => {
  it("returns maintenance before parsing the import envelope", async () => {
    const maintenanceResponse = {
      data: pyroxeneMaintenanceResult,
      init: { status: 503 },
    };
    mockPyroxeneMaintenanceActionResult.mockResolvedValue(maintenanceResponse);

    const response = await action(
      actionArgs(
        new Request("https://mollulog.test/utils/pyroxene/import", {
          method: "POST",
          body: "not-json",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    expect(response).toBe(maintenanceResponse);
    expect(mockPyroxeneMaintenanceActionResult).toHaveBeenCalledWith(env, {
      ctx,
      operation: "utils.pyroxene.import.action",
    });
  });

  it("keeps the guard after authentication for signed-out requests", async () => {
    mockGetActiveSensei.mockResolvedValue(null);

    const response = await action(
      actionArgs(
        new Request("https://mollulog.test/utils/pyroxene/import", {
          method: "POST",
          body: "not-json",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    expect(response).toMatchObject({
      data: { success: false, failedLabels: ["로그인이 필요해요"] },
      init: { status: 401 },
    });
    expect(mockPyroxeneMaintenanceActionResult).not.toHaveBeenCalled();
  });
});
