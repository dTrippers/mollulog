import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createDefaultEventShopState } from "~/domain/event-shop-state";

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
  it("merges detailed-screen edits with fields changed in the account since load", async () => {
    const base = {
      ...createDefaultEventShopState([], []),
      existingPaymentItemQuantities: { "currency-1": 10 },
    };
    const submitted = { ...base, itemQuantities: { "item-1": 3 } };
    const latest = { ...base, existingPaymentItemQuantities: { "currency-1": 42 } };
    mockGetEventShopState.mockResolvedValue(latest);

    const result = await action(actionArgs("timeline-1", { save: submitted, base }));

    expect(result).toEqual({ success: true });
    expect(mockGetEventShopState).toHaveBeenCalledWith(env, 7, "canonical-shop-1");
    expect(mockUpsertEventShopState).toHaveBeenCalledWith(env, 7, "canonical-shop-1", {
      ...submitted,
      existingPaymentItemQuantities: { "currency-1": 42 },
    });
  });

  it("replaces the whole account plan only for an explicit import request", async () => {
    const guestPlan = { ...createDefaultEventShopState([], []), itemQuantities: { "item-1": 9 } };
    const result = await action(actionArgs("timeline-1", { save: guestPlan, replace: true }));

    expect(result).toEqual({ success: true });
    expect(mockGetEventShopState).not.toHaveBeenCalled();
    expect(mockUpsertEventShopState).toHaveBeenCalledWith(env, 7, "canonical-shop-1", guestPlan);
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
