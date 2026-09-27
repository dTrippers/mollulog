import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PlannerStateRevisionConflictError } from "~/db/postgres/planner-states";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<{ id: number } | null>>();
const mockGetEventMetadata = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetTimelineContent = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdateApPlannerState = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdatePyroxenePlannerOptions = jest.fn<(...args: unknown[]) => Promise<unknown>>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/models/event-content", () => ({ getEventMetadata: mockGetEventMetadata }));
jest.mock("~/models/timeline-content.server", () => ({ getTimelineContent: mockGetTimelineContent }));
jest.mock("~/models/planner-state", () => {
  const actual = jest.requireActual<typeof import("~/models/planner-state")>("~/models/planner-state");
  return { ...actual, updateApPlannerState: mockUpdateApPlannerState };
});
jest.mock("~/models/pyroxene-planner", () => {
  const actual = jest.requireActual<typeof import("~/models/pyroxene-planner")>("~/models/pyroxene-planner");
  return { ...actual, updatePyroxenePlannerOptions: mockUpdatePyroxenePlannerOptions };
});

import { action } from "~/routes/utils.ap";

const env = {} as Env;
const ctx = {} as ExecutionContext;
const eventContent = {
  startAt: "2026-09-30T02:00:00.000Z",
  endAt: "2026-10-13T01:59:00.000Z",
};
let accountApState = { accountLevel: null, cafeRank: null, comfort: null, eventPlans: {} };
let pyroxeneOptions = defaultPyroxenePlannerOptions;

function actionArgs(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return {
    context: { cloudflare: { env, ctx } },
    request: new Request("https://mollulog.test/utils/ap", { method: "POST", body }),
  } as never;
}

async function runAction(fields: Record<string, string>) {
  return (await action(actionArgs(fields))) as {
    data: { success: boolean; error?: string; revisionConflict?: boolean };
    init: { status: number };
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  accountApState = { accountLevel: null, cafeRank: null, comfort: null, eventPlans: {} };
  pyroxeneOptions = defaultPyroxenePlannerOptions;
  mockGetActiveSensei.mockResolvedValue({ id: 1 });
  mockGetEventMetadata.mockResolvedValue({ contentType: "event", shopAvailable: true });
  mockGetTimelineContent.mockResolvedValue(eventContent);
  mockUpdateApPlannerState.mockImplementation(async (...args: unknown[]) => {
    const update = args[2] as (
      transaction: unknown,
      current: typeof accountApState | null,
    ) => Promise<{ state: typeof accountApState; result: unknown }>;
    const result = await update({}, accountApState);
    accountApState = result.state;
    return result.result;
  });
  mockUpdatePyroxenePlannerOptions.mockImplementation(async (...args: unknown[]) => {
    const update = args[2] as (current: typeof defaultPyroxenePlannerOptions) => {
      options: typeof defaultPyroxenePlannerOptions;
      result: unknown;
    };
    const result = update(pyroxeneOptions);
    pyroxeneOptions = result.options;
    return result.result;
  });
});

describe("AP planner action", () => {
  it.each([
    ["accountLevel", "91"],
    ["cafeRank", "11"],
    ["apChargeCount", "21"],
    ["comfort", "5501"],
  ])("rejects out-of-range %s values", async (field, value) => {
    const response = await runAction({ intent: "save-condition", field, value });

    expect(response.init.status).toBe(400);
    expect(response.data.success).toBe(false);
    expect(mockUpdateApPlannerState).not.toHaveBeenCalled();
    expect(mockUpdatePyroxenePlannerOptions).not.toHaveBeenCalled();
  });

  it("rejects comfort updates until the cafe rank is set", async () => {
    const response = await runAction({ intent: "save-condition", field: "comfort", value: "1000" });

    expect(response.init.status).toBe(400);
    expect(response.data.error).toBe("카페 랭크를 먼저 입력해주세요.");
  });

  it("rejects an access time outside the event date range", async () => {
    const response = await runAction({
      intent: "save-access-time",
      eventUid: "event-1",
      accessAt: "2026-09-30T01:00:00.000Z",
    });

    expect(response.init.status).toBe(400);
    expect(response.data.error).toBe("이벤트 시작 이후 종료 전 시각을 입력해주세요.");
    expect(mockUpdateApPlannerState).not.toHaveBeenCalled();
  });

  it("rejects access-time saves when the event has no AP plan", async () => {
    const response = await runAction({
      intent: "save-access-time",
      eventUid: "event-1",
      accessAt: "2026-09-30T03:00:00.000Z",
    });

    expect(response.init.status).toBe(400);
    expect(response.data.error).toBe("먼저 AP 모으기 계획에 추가해주세요.");
  });

  it("returns 404 when adding a plan for an event without a shop", async () => {
    mockGetEventMetadata.mockResolvedValue({ contentType: "event", shopAvailable: false });
    const response = await runAction({ intent: "add-plan", eventUid: "recruitment-only-event" });

    expect(response.init.status).toBe(404);
    expect(response.data.error).toBe("이벤트 상점 정보를 확인할 수 없어요.");
    expect(mockUpdateApPlannerState).not.toHaveBeenCalled();
  });

  it("maps overlapping refill exceptions to a 409 response", async () => {
    pyroxeneOptions = {
      ...defaultPyroxenePlannerOptions,
      consumption: {
        ...defaultPyroxenePlannerOptions.consumption,
        apChargeExceptions: [{ uid: "existing", startDate: "2026-09-30", endDate: "2026-10-02", count: 2 }],
      },
    };
    const response = await runAction({
      intent: "apply-charge-exception",
      uid: "suggested",
      startDate: "2026-10-02",
      endDate: "2026-10-03",
      count: "3",
    });

    expect(response.init.status).toBe(409);
    expect(response.data.error).toBe(
      "기간이 기존 AP 충전 예외와 겹쳐 적용하지 못했어요. 청휘석 플래너에서 기존 예외를 먼저 수정해주세요.",
    );
  });

  it("returns the revision-conflict flag and message", async () => {
    mockUpdateApPlannerState.mockRejectedValue(new PlannerStateRevisionConflictError());
    const response = await runAction({ intent: "save-condition", field: "accountLevel", value: "85" });

    expect(response.init.status).toBe(409);
    expect(response.data).toMatchObject({
      success: false,
      revisionConflict: true,
      error: "다른 탭이나 기기에서 플래너가 바뀌었어요. 최신 내용을 확인한 뒤 다시 시도해주세요.",
    });
  });

  it("maps generic failures without exposing raw errors", async () => {
    mockUpdateApPlannerState.mockRejectedValue(new Error("sensitive database failure"));
    const response = await runAction({ intent: "save-condition", field: "accountLevel", value: "85" });

    expect(response.init.status).toBe(500);
    expect(response.data.error).toBe("플레이 조건을 저장하지 못했어요. 다시 시도해주세요.");
    expect(JSON.stringify(response)).not.toContain("sensitive database failure");
  });
});
