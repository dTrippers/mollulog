import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RecruitmentPoolSnapshot } from "~/domain/recruitment-simulator";

const mockGetTimelineContent = jest.fn<(env: unknown, uid: string, options?: unknown) => Promise<unknown>>();
const mockGetRecruitmentGroupByUid = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetRecruitmentPoolStudents = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const mockBuildSnapshot = jest.fn<(...args: unknown[]) => RecruitmentPoolSnapshot>();

jest.mock("~/models/timeline-content.server", () => ({ getTimelineContent: mockGetTimelineContent }));
jest.mock("~/models/recruitment", () => ({
  getRecruitmentGroupByUid: mockGetRecruitmentGroupByUid,
  getRecruitmentPoolStudents: mockGetRecruitmentPoolStudents,
}));
jest.mock("~/domain/recruitment-simulator", () => ({
  ...jest.requireActual<typeof import("~/domain/recruitment-simulator")>("~/domain/recruitment-simulator"),
  buildRecruitmentPoolSnapshotFromBaql: mockBuildSnapshot,
}));

import { CALL_CHARGE_ANCHOR_TIMELINE_UID } from "~/domain/recruitment-cost";
import { loader } from "~/routes/events.$uid.recruitment-simulator";

const env = {} as Env;
const ctx = {} as ExecutionContext;
const ANCHOR_START = "2026-11-10T02:00:00.000Z";

let anchor: { startAt: string } | null;
let eventContent: unknown;

function snapshot(startAt: string, recruitmentType = "usual"): RecruitmentPoolSnapshot {
  return {
    recruitmentGroupUid: "group-1",
    recruitmentType: "usual" as RecruitmentPoolSnapshot["recruitmentType"],
    startAt,
    pickupStudents: [
      {
        uid: "kisaki",
        name: "키사키(수영복)",
        initialTier: 3,
        attackType: "explosive" as never,
        defenseType: "heavy_armor" as never,
        role: "striker" as never,
        recruitmentType: recruitmentType as never,
      },
    ],
    nonPickupStudentsByTier: { tier1: [], tier2: [], tier3: [] },
  };
}

function runLoader() {
  return loader({
    params: { uid: "event-1" },
    context: { cloudflare: { env, ctx } },
    request: new Request("https://mollulog.test/events/event-1/recruitment-simulator"),
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  anchor = { startAt: ANCHOR_START };
  eventContent = { name: "이벤트", contentType: "event", recruitmentGroupUid: "group-1" };
  mockGetTimelineContent.mockImplementation(async (_env, uid) =>
    uid === CALL_CHARGE_ANCHOR_TIMELINE_UID ? anchor : eventContent,
  );
  mockGetRecruitmentGroupByUid.mockResolvedValue({ uid: "group-1" });
  mockGetRecruitmentPoolStudents.mockResolvedValue([]);
});

describe("recruitment simulator loader", () => {
  it.each([
    ["before the anchor", "2026-11-10T01:59:59.999Z", "legacy_points"],
    ["at the anchor", ANCHOR_START, "call_charge_v1"],
    ["after the anchor", "2026-11-17T02:00:00.000Z", "call_charge_v1"],
  ])("selects the rule set for a period starting %s", async (_label, startAt, ruleSet) => {
    mockBuildSnapshot.mockReturnValue(snapshot(startAt));

    await expect(runLoader()).resolves.toMatchObject({ eventName: "이벤트", ruleSet });
    expect(mockGetTimelineContent).toHaveBeenCalledWith(env, CALL_CHARGE_ANCHOR_TIMELINE_UID, { ctx });
  });

  it("fails instead of guessing the rule set when the anchor timeline is missing", async () => {
    anchor = null;
    mockBuildSnapshot.mockReturnValue(snapshot(ANCHOR_START));

    await expect(runLoader()).rejects.toThrow(
      `call-charge anchor timeline is missing: ${CALL_CHARGE_ANCHOR_TIMELINE_UID}`,
    );
  });

  it("rejects a call-charge period whose pickup has no stack kind", async () => {
    mockBuildSnapshot.mockReturnValue(snapshot(ANCHOR_START, "archive"));

    await expect(runLoader()).rejects.toThrow("pickup kisaki has no call-charge scope for type archive");
  });

  it("accepts a pickup without a stack kind under the legacy rules", async () => {
    mockBuildSnapshot.mockReturnValue(snapshot("2026-01-01T00:00:00.000Z", "archive"));

    await expect(runLoader()).resolves.toMatchObject({ ruleSet: "legacy_points" });
  });

  it("propagates an upstream failure", async () => {
    mockGetRecruitmentPoolStudents.mockRejectedValue(new Error("upstream down"));

    await expect(runLoader()).rejects.toThrow("upstream down");
    expect(mockBuildSnapshot).not.toHaveBeenCalled();
  });

  it("responds 404 when the event has no recruitment period", async () => {
    eventContent = { name: "이벤트", contentType: "event", recruitmentGroupUid: null };

    const error = await runLoader().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(404);
  });
});
