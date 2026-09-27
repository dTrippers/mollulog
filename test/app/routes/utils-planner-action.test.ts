import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PlannerStateRevisionConflictError } from "~/db/postgres/planner-states";
import { PLANNER_STATE_REVISION_CONFLICT_MESSAGE } from "~/models/planner-state";

const mockGetActiveSensei = jest.fn<() => Promise<{ id: number } | null>>();
const mockCreateBuyPyroxene = jest.fn<(...args: unknown[]) => Promise<void>>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/models/pyroxene-planner", () => ({ createBuyPyroxene: mockCreateBuyPyroxene }));
jest.mock("~/models/integrated-planner", () => ({ saveIntegratedPlannerRecruitmentPlan: jest.fn() }));
jest.mock("~/views/pyroxene", () => ({ getPyroxenePlannerContents: jest.fn() }));
jest.mock("~/views/integrated-planner", () => ({ getIntegratedPlannerData: jest.fn() }));

import { action } from "~/routes/planner";

const env = {} as Env;
const ctx = {} as ExecutionContext;

function actionArgs() {
  const formData = new FormData();
  formData.set("intent", "create");
  formData.set("kind", "buy");
  formData.set("dateInstant", "2026-08-08T00:00:00.000Z");
  formData.set("quantity", "100");
  formData.set("submissionId", "submission-1");
  return {
    context: { cloudflare: { env, ctx } },
    request: new Request("https://mollulog.test/planner", { method: "POST", body: formData }),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 7 });
  mockCreateBuyPyroxene.mockResolvedValue(undefined);
});

describe("integrated planner action", () => {
  it("returns the shared revision conflict message and HTTP 409 for planner writes", async () => {
    mockCreateBuyPyroxene.mockRejectedValue(new PlannerStateRevisionConflictError());

    const result = await action(actionArgs());

    expect(result).toMatchObject({
      data: {
        success: false,
        submissionId: "submission-1",
        error: PLANNER_STATE_REVISION_CONFLICT_MESSAGE,
        revisionConflict: true,
      },
      init: { status: 409 },
    });
  });
});
