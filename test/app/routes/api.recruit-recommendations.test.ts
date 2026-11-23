import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getActiveSensei } from "~/auth/authenticator.server";
import { captureServerError } from "~/lib/observability.server";
import { getRecruitGoal, setRecruitGoal } from "~/models/recruit-recommendation-profile";
import { action, loader } from "~/routes/api.recruit-recommendations";
import { getFutureContents } from "~/views/futures";
import { loadRecruitMarks, loadRecruitRecommendations } from "~/views/recruit-recommendations.server";

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: jest.fn() }));
jest.mock("~/models/recruit-recommendation-profile", () => ({ getRecruitGoal: jest.fn(), setRecruitGoal: jest.fn() }));
jest.mock("~/views/futures", () => ({ getFutureContents: jest.fn() }));
jest.mock("~/views/recruit-recommendations.server", () => ({
  loadRecruitMarks: jest.fn(),
  loadRecruitRecommendations: jest.fn(),
}));
jest.mock("~/lib/observability.server", () => ({
  captureServerError: jest.fn(),
  getLogger: () => ({ error: jest.fn() }),
}));

const env = {} as Env;
const mockedGetActiveSensei = getActiveSensei as jest.MockedFunction<typeof getActiveSensei>;
const mockedGetRecruitGoal = getRecruitGoal as jest.MockedFunction<typeof getRecruitGoal>;
const mockedSetRecruitGoal = setRecruitGoal as jest.MockedFunction<typeof setRecruitGoal>;
const mockedGetFutureContents = getFutureContents as jest.MockedFunction<typeof getFutureContents>;
const mockedLoadRecruitMarks = loadRecruitMarks as jest.MockedFunction<typeof loadRecruitMarks>;
const mockedLoadRecruitRecommendations = loadRecruitRecommendations as jest.MockedFunction<
  typeof loadRecruitRecommendations
>;
const mockedCaptureServerError = captureServerError as jest.MockedFunction<typeof captureServerError>;

type DataResult = { type: "DataWithResponseInit"; data: unknown; init: ResponseInit | null };

function loaderArgs(search: string): Parameters<typeof loader>[0] {
  return {
    request: new Request(`https://mollulog.net/api/recruit-recommendations${search}`),
    context: { cloudflare: { env, ctx: {} } },
    params: {},
  } as never;
}

function actionArgs(body: string, method = "POST"): Parameters<typeof action>[0] {
  return {
    request: new Request("https://mollulog.net/api/recruit-recommendations", { method, body }),
    context: { cloudflare: { env, ctx: {} } },
    params: {},
  } as never;
}

async function run(result: Promise<unknown>) {
  const value = (await result) as DataResult;
  return { data: value.data, status: value.init?.status ?? 200 };
}

const answerView = {
  status: "ok" as const,
  answer: { goal: "top" as const, computedAt: "2026-11-24T00:00:00.000Z", students: [], pickups: [] },
  recruited: "guest" as const,
  recruitedStudentUids: [],
  substituteNames: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetActiveSensei.mockResolvedValue(null);
  mockedGetFutureContents.mockResolvedValue([]);
  mockedLoadRecruitRecommendations.mockResolvedValue(answerView);
  mockedLoadRecruitMarks.mockResolvedValue({ status: "ok", marks: [] });
});

describe("recruit recommendations API", () => {
  it("answers a guest for the goal it sends", async () => {
    await expect(run(loader(loaderArgs("?goal=platinum")))).resolves.toEqual({
      data: { ...answerView, goal: "platinum" },
      status: 200,
    });
    expect(mockedLoadRecruitRecommendations).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ goal: "platinum", userId: null }),
    );
  });

  it("uses a signed-in Sensei's saved goal, and says when there is none", async () => {
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedGetRecruitGoal.mockResolvedValue("top");
    await expect(run(loader(loaderArgs("")))).resolves.toMatchObject({ data: { goal: "top" }, status: 200 });
    expect(mockedLoadRecruitRecommendations).toHaveBeenCalledWith(env, expect.objectContaining({ userId: 7 }));

    mockedGetRecruitGoal.mockResolvedValue(null);
    await expect(run(loader(loaderArgs("")))).resolves.toEqual({ data: { status: "no_goal" }, status: 200 });
    await expect(run(loader(loaderArgs("?view=marks")))).resolves.toEqual({ data: { status: "no_goal" }, status: 200 });
  });

  it("rejects an unknown goal", async () => {
    await expect(run(loader(loaderArgs("?goal=casual")))).resolves.toEqual({
      data: { status: "unavailable" },
      status: 400,
    });
    await expect(run(loader(loaderArgs("?view=marks&goal=casual")))).resolves.toEqual({
      data: { status: "hidden" },
      status: 400,
    });
  });

  it("reports a failed service answer as unavailable", async () => {
    mockedLoadRecruitRecommendations.mockResolvedValue({ status: "unavailable" });

    await expect(run(loader(loaderArgs("?goal=top")))).resolves.toEqual({
      data: { status: "unavailable" },
      status: 503,
    });
    expect(mockedCaptureServerError).toHaveBeenCalledTimes(1);
  });

  it("gives 미래시 the marks alone", async () => {
    mockedLoadRecruitMarks.mockResolvedValue({
      status: "ok",
      marks: [{ studentUid: "10001", startAt: "2026-11-25T02:00:00.000Z" }],
    });

    await expect(run(loader(loaderArgs("?view=marks&goal=newbie")))).resolves.toEqual({
      data: { status: "ok", marks: [{ studentUid: "10001", startAt: "2026-11-25T02:00:00.000Z" }] },
      status: 200,
    });
    expect(mockedLoadRecruitRecommendations).not.toHaveBeenCalled();
  });

  it("hides the marks when the contents cannot be read", async () => {
    mockedGetFutureContents.mockRejectedValue(new Error("down"));

    await expect(run(loader(loaderArgs("?view=marks&goal=top")))).resolves.toEqual({
      data: { status: "hidden" },
      status: 503,
    });
  });
});

describe("recruit goal API", () => {
  it("saves a signed-in Sensei's goal", async () => {
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);

    await expect(run(action(actionArgs(JSON.stringify({ goal: "newbie" }))))).resolves.toEqual({
      data: { ok: true, goal: "newbie" },
      status: 200,
    });
    expect(mockedSetRecruitGoal).toHaveBeenCalledWith(env, 7, "newbie", expect.anything());
  });

  it("refuses a guest, a bad body, and an unknown goal", async () => {
    await expect(run(action(actionArgs(JSON.stringify({ goal: "top" }))))).resolves.toEqual({
      data: { ok: false },
      status: 401,
    });
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    await expect(run(action(actionArgs("{")))).resolves.toEqual({ data: { ok: false }, status: 400 });
    await expect(run(action(actionArgs(JSON.stringify({ goal: "casual" }))))).resolves.toEqual({
      data: { ok: false },
      status: 400,
    });
    expect(mockedSetRecruitGoal).not.toHaveBeenCalled();
  });

  it("says so when the goal cannot be saved", async () => {
    mockedGetActiveSensei.mockResolvedValue({ id: 7 } as never);
    mockedSetRecruitGoal.mockRejectedValue(new Error("db down"));

    await expect(run(action(actionArgs(JSON.stringify({ goal: "top" }))))).resolves.toEqual({
      data: { ok: false },
      status: 500,
    });
  });
});
