import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { d1MaintenanceResult } from "~/domain/d1-cutover";

const mockGetActiveSensei = jest.fn<() => Promise<{ id: number } | null>>();
type AsyncMock = (...args: unknown[]) => Promise<unknown>;
const mockD1MaintenanceActionResult = jest.fn<AsyncMock>();
const mockGetEventMetadata = jest.fn<AsyncMock>();
const mockUpsertEventShopState = jest.fn<AsyncMock>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/lib/d1-cutover.server", () => ({
  d1MaintenanceActionResult: mockD1MaintenanceActionResult,
}));
jest.mock("~/models/event-content", () => ({ getEventMetadata: mockGetEventMetadata }));
jest.mock("~/models/event-shop-state", () => ({ upsertEventShopState: mockUpsertEventShopState }));

import { action } from "~/routes/api.events.$eventUid.shop-state";

const env = { HYPERDRIVE: { connectionString: "postgres://test" } } as unknown as Env;
const ctx = {} as ExecutionContext;

function actionArgs(request: Request) {
  return {
    context: { cloudflare: { env, ctx } },
    params: { eventUid: "event-1" },
    request,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 1 });
  mockD1MaintenanceActionResult.mockResolvedValue(null);
  mockGetEventMetadata.mockResolvedValue(null);
  mockUpsertEventShopState.mockResolvedValue(undefined);
});

describe("event shop state maintenance", () => {
  it("returns the typed maintenance response before parsing or writing", async () => {
    const maintenanceResponse = { data: d1MaintenanceResult, init: { status: 503 } };
    mockD1MaintenanceActionResult.mockResolvedValue(maintenanceResponse);

    const response = await action(
      actionArgs(
        new Request("https://mollulog.test/api/events/event-1/shop-state", {
          method: "POST",
          body: "not-json",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    expect(response).toBe(maintenanceResponse);
    expect(mockD1MaintenanceActionResult).toHaveBeenCalledWith(env, {
      ctx,
      operation: "api.events.shop-state.action",
    });
    expect(mockGetEventMetadata).not.toHaveBeenCalled();
    expect(mockUpsertEventShopState).not.toHaveBeenCalled();
  });

  it("continues to the action when maintenance is absent", async () => {
    await expect(
      action(
        actionArgs(
          new Request("https://mollulog.test/api/events/event-1/shop-state", {
            method: "POST",
            body: JSON.stringify({}),
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    ).resolves.toEqual({ success: false });
    expect(mockGetEventMetadata).toHaveBeenCalled();
  });
});
