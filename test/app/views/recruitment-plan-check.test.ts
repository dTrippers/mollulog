import { describe, expect, it, jest } from "@jest/globals";

const mockGetPyroxenePlannerContents = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLoadPyroxenePlannerAccount = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLogError = jest.fn();

jest.mock("~/views/pyroxene", () => ({ getPyroxenePlannerContents: mockGetPyroxenePlannerContents }));
jest.mock("~/views/pyroxene-planner-account", () => ({ loadPyroxenePlannerAccount: mockLoadPyroxenePlannerAccount }));
jest.mock("~/lib/observability.server", () => ({ getLogger: () => ({ error: mockLogError }) }));

import { getRecruitmentPlanCheck } from "~/views/recruitment-plan-check";

describe("getRecruitmentPlanCheck", () => {
  it("fails at the load stage when the account's owned state cannot be read, instead of planning it as unowned", async () => {
    mockGetPyroxenePlannerContents.mockResolvedValue([]);
    mockLoadPyroxenePlannerAccount.mockRejectedValue(new Error("read failed"));

    await expect(getRecruitmentPlanCheck({} as Env, 1, new Date("2026-11-22T00:00:00.000Z"))).resolves.toEqual({
      status: "failed",
      stage: "load",
    });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});
