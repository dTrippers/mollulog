import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockGetActiveSensei = jest.fn<(...args: unknown[]) => Promise<{ id: number } | null>>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));

import { action } from "~/routes/api.planner.janken";

const env = {} as Env;
const ctx = {} as ExecutionContext;

function actionArgs(entry: unknown) {
  return {
    context: { cloudflare: { env, ctx } },
    request: new Request("https://mollulog.test/api/planner/janken", {
      method: "POST",
      body: JSON.stringify({ shopStateUid: "shop-1", base: null, entry }),
      headers: { "Content-Type": "application/json" },
    }),
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 7 });
});

describe("janken planner API", () => {
  it("returns invalid normalized entries as HTTP 400 with the public validation copy", async () => {
    const result = await action(actionArgs({ progress: { currentTier: 0 }, goals: {} }));

    expect(result).toMatchObject({
      data: { success: false, error: "계획 내용을 확인해 주세요." },
      init: { status: 400 },
    });
    expect(result).not.toMatchObject({ data: { error: expect.stringContaining("가위바위보") } });
  });
});
