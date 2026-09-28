import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createDefaultEventShopState } from "~/domain/event-shop-state";
import { PLANNER_STATE_REVISION_CONFLICT_MESSAGE } from "~/models/planner-state";

const mockGetActiveSensei = jest.fn<() => Promise<{ id: number } | null>>();
const mockGetEventMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdateOwnedQuantities = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetEventShopState = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpsertEventShopState = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/models/event-content", () => ({ getEventMetadata: mockGetEventMetadata }));
jest.mock("~/models/event-shop-state", () => ({
  getEventShopState: mockGetEventShopState,
  upsertEventShopState: mockUpsertEventShopState,
}));
jest.mock("~/views/event-shop-state", () => ({ updateEventShopOwnedQuantities: mockUpdateOwnedQuantities }));

import { action } from "~/routes/api.events.$eventUid.shop-state";

const env = {} as Env;
const ctx = {} as ExecutionContext;

function actionArgs(eventUid: string, payload: unknown) {
  return {
    context: { cloudflare: { env, ctx } },
    params: { eventUid },
    request: new Request(`https://mollulog.test/api/events/${eventUid}/shop-state`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    }),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 7 });
  mockGetEventMetadata.mockResolvedValue({
    name: "Event",
    contentType: "event",
    runType: "first",
    since: "2026-09-01T00:00:00.000Z",
    until: "2026-09-30T00:00:00.000Z",
    contentUid: "content-1",
    shopContentUid: "canonical-shop-1",
  });
  mockUpdateOwnedQuantities.mockResolvedValue({ status: "saved" });
  mockGetEventShopState.mockResolvedValue(null);
  mockUpsertEventShopState.mockResolvedValue(undefined);
});

describe("event shop full-plan save", () => {
  it("passes base and submitted plans to the locked storage update", async () => {
    const base = {
      ...createDefaultEventShopState([], []),
      existingPaymentItemQuantities: { "currency-1": 10 },
    };
    const submitted = { ...base, itemQuantities: { "item-1": 3 } };

    const result = await action(actionArgs("timeline-1", { save: submitted, base }));

    expect(result).toEqual({ success: true });
    expect(mockGetEventShopState).not.toHaveBeenCalled();
    expect(mockUpsertEventShopState).toHaveBeenCalledWith(env, 7, "canonical-shop-1", submitted, {
      baseState: base,
      fallbackEventUid: "timeline-1",
      replace: false,
      ctx,
    });
  });

  it("replaces the whole account plan only for an explicit import request", async () => {
    const guestPlan = { ...createDefaultEventShopState([], []), itemQuantities: { "item-1": 9 } };
    const result = await action(actionArgs("timeline-1", { save: guestPlan, replace: true }));

    expect(result).toEqual({ success: true });
    expect(mockGetEventShopState).not.toHaveBeenCalled();
    expect(mockUpsertEventShopState).toHaveBeenCalledWith(env, 7, "canonical-shop-1", guestPlan, {
      baseState: null,
      fallbackEventUid: "timeline-1",
      replace: true,
      ctx,
    });
  });

  it("returns the approved revision conflict message for a stale account write", async () => {
    const conflict = new Error("database-specific details");
    conflict.name = "PlannerStateRevisionConflictError";
    mockUpsertEventShopState.mockRejectedValue(conflict);

    const result = await action(actionArgs("timeline-1", { save: createDefaultEventShopState([], []), replace: true }));

    expect(result).toMatchObject({
      data: { success: false, error: PLANNER_STATE_REVISION_CONFLICT_MESSAGE, revisionConflict: true },
      init: { status: 409 },
    });
  });
});

describe("event shop owned currency update", () => {
  it("passes a validated currency-only patch to the event shop view", async () => {
    const result = await action(actionArgs("timeline-1", { updateOwnedQuantities: { "currency-1": 0 } }));

    expect(result).toEqual({ success: true });
    expect(mockUpdateOwnedQuantities).toHaveBeenCalledWith(env, 7, "timeline-1", { "currency-1": 0 }, ctx);
    expect(mockUpsertEventShopState).not.toHaveBeenCalled();
  });

  it("returns explicit validation errors for malformed bodies and values", async () => {
    const invalidBody = {
      context: { cloudflare: { env, ctx } },
      params: { eventUid: "timeline-1" },
      request: new Request("https://mollulog.test/api/events/timeline-1/shop-state", {
        method: "POST",
        body: JSON.stringify([]),
        headers: { "Content-Type": "application/json" },
      }),
    } as never;

    const bodyResult = await action(invalidBody);
    const valueResult = await action(actionArgs("timeline-1", { updateOwnedQuantities: { "currency-1": -1 } }));

    expect(bodyResult).toMatchObject({ data: { success: false, error: "요청 내용을 확인해주세요" } });
    expect(valueResult).toMatchObject({ data: { success: false, error: "보유 재화 입력을 확인해주세요" } });
    expect(mockUpdateOwnedQuantities).not.toHaveBeenCalled();
  });
});
