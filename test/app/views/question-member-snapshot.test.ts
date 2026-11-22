import { describe, expect, it, jest } from "@jest/globals";
import type { RecruitmentPlanCheckEvent } from "~/domain/pyroxene-recruitment-plan-check";
import { buildQuestionMemberSnapshot, type QuestionMemberSnapshotBase } from "~/models/question-member-snapshot.server";
import { getQuestionMemberSnapshot, mapQuestionSnapshotRecruitmentCheck } from "~/views/question-member-snapshot";
import { getRecruitmentPlanCheck } from "~/views/recruitment-plan-check";

jest.mock("~/models/question-member-snapshot.server", () => ({ buildQuestionMemberSnapshot: jest.fn() }));
jest.mock("~/views/recruitment-plan-check", () => ({ getRecruitmentPlanCheck: jest.fn() }));

const mockedBuildSnapshot = buildQuestionMemberSnapshot as jest.MockedFunction<typeof buildQuestionMemberSnapshot>;
const mockedGetCheck = getRecruitmentPlanCheck as jest.MockedFunction<typeof getRecruitmentPlanCheck>;

const checkEvent: RecruitmentPlanCheckEvent = {
  eventUid: "5th-fes",
  name: "페스 모집",
  since: "2026-11-24T02:00:00.000Z",
  until: "2026-12-01T02:00:00.000Z",
  basis: "average",
  basisOverridden: false,
  pulls: 182,
  pullRange: { low: 90, high: 300 },
  freePulls: 10,
  pyroxeneBefore: 72_305,
  pyroxeneBeforeRange: { low: 57_000, high: 83_000 },
  spent: { pyroxene: 18_360, oneTimeTicket: 2, tenTimeTicket: 0 },
  pyroxeneAfter: 53_945,
  pyroxeneAfterRange: { low: 37_025, high: 68_225 },
  shortfall: 0,
  surplus: 53_945,
  status: "enough",
  ownedApplied: true,
  targets: [
    { studentUid: "s1", name: "학생", targetTier: 5, owned: { tier: 4, eleph: 30 }, remainingEleph: 90, copies: 1 },
  ],
};

describe("mapQuestionSnapshotRecruitmentCheck", () => {
  it("passes the planner's numbers under the contract's names and drops student names", () => {
    const mapped = mapQuestionSnapshotRecruitmentCheck({
      status: "available",
      resourcesInputAt: "2026-11-10T00:00:00.000Z",
      events: [checkEvent],
    });
    expect(mapped).toEqual({
      status: "available",
      resourcesInputAt: "2026-11-10T00:00:00.000Z",
      events: [
        {
          plannerEventUid: "5th-fes",
          eventName: "페스 모집",
          startAt: "2026-11-24T02:00:00.000Z",
          endAt: "2026-12-01T02:00:00.000Z",
          basis: "average",
          pulls: 182,
          pullRange: { low: 90, high: 300 },
          freePulls: 10,
          pyroxeneBefore: 72_305,
          pyroxeneBeforeRange: { low: 57_000, high: 83_000 },
          spent: { pyroxene: 18_360, oneTimeTicket: 2, tenTimeTicket: 0 },
          pyroxeneAfter: 53_945,
          pyroxeneAfterRange: { low: 37_025, high: 68_225 },
          shortfall: 0,
          surplus: 53_945,
          status: "enough",
          ownedApplied: true,
          targets: [{ studentUid: "s1", targetTier: 5, owned: { tier: 4, eleph: 30 }, remainingEleph: 90, copies: 1 }],
        },
      ],
    });
  });

  it("keeps input_required and hides the failed stage", () => {
    expect(mapQuestionSnapshotRecruitmentCheck({ status: "input_required" })).toEqual({ status: "input_required" });
    expect(mapQuestionSnapshotRecruitmentCheck({ status: "failed", stage: "calculation" })).toEqual({
      status: "failed",
    });
  });
});

describe("getQuestionMemberSnapshot", () => {
  it("adds the check to the snapshot and keeps the snapshot when the check fails", async () => {
    const base = { schemaVersion: 2 } as unknown as QuestionMemberSnapshotBase;
    mockedBuildSnapshot.mockResolvedValue(base);
    mockedGetCheck.mockResolvedValue({ status: "failed", stage: "load" });
    const now = new Date("2026-11-12T00:00:00.000Z");

    const env = {} as Env;
    const snapshot = await getQuestionMemberSnapshot(env, 7, now);
    expect(snapshot).toEqual({ schemaVersion: 2, recruitmentCheck: { status: "failed" } });
    expect(mockedBuildSnapshot).toHaveBeenCalledWith(env, 7);
    expect(mockedGetCheck).toHaveBeenCalledWith(env, 7, now, undefined);
  });
});
