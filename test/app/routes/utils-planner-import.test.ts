import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createEmptyGuestEventShopPlanner } from "~/domain/guest-event-shop-planner";
import {
  createEmptyGuestPlanner,
  createGuestPlannerConflictEnvelope,
  createGuestPlannerFromLegacySources,
  createGuestPlannerLegacyMirror,
  type GuestPlannerLegacyConflict,
  mergeGuestPlannerLegacyChanges,
} from "~/domain/guest-planner";
import { createEmptyGuestPyroxenePlanner, type GuestPyroxeneRecord } from "~/domain/guest-pyroxene-planner";

type AsyncMock = (...args: unknown[]) => Promise<unknown>;
const mockGetActiveSensei = jest.fn<AsyncMock>();
const mockFavoriteStudent = jest.fn<AsyncMock>();
const mockImportGuestPlannerState = jest.fn<AsyncMock>();
const mockGetUserFavoritedStudents = jest.fn<AsyncMock>();
const mockGetPyroxeneUserState = jest.fn<AsyncMock>();
const mockGetPyroxenePlannerContents = jest.fn<AsyncMock>();

jest.mock("~/auth/authenticator.server", () => ({ getActiveSensei: mockGetActiveSensei }));
jest.mock("~/components/features/futures", () => ({ useGuestPlanner: jest.fn() }));
jest.mock("~/models/favorite-students", () => ({
  favoriteStudent: mockFavoriteStudent,
  getUserFavoritedStudents: mockGetUserFavoritedStudents,
}));
jest.mock("~/models/guest-pyroxene-import", () => ({ importGuestPlannerState: mockImportGuestPlannerState }));
jest.mock("~/models/pyroxene-planner", () => ({ getPyroxeneUserState: mockGetPyroxeneUserState }));
jest.mock("~/views/pyroxene", () => ({ getPyroxenePlannerContents: mockGetPyroxenePlannerContents }));

import {
  action,
  buildSources,
  countSourceItems,
  describeTimelineGroup,
  formatStudents,
  getGuestPlannerImportDisplayState,
  getMissingGuestCollectedSourceKeys,
  guestPyroxeneRecordsById,
  guestTimelineRecordGroupsById,
  initialSelection,
  ResourceConflictComparison,
} from "~/routes/planner_.import";

const env = {} as Env;
const ctx = {} as ExecutionContext;

function actionArgs(request: Request) {
  return { context: { cloudflare: { env, ctx } }, request } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetActiveSensei.mockResolvedValue({ id: 7 });
  mockFavoriteStudent.mockResolvedValue(undefined);
  mockImportGuestPlannerState.mockResolvedValue({ verified: [], failed: [], revisionConflict: false });
});

function createPlannerWithGuestRecords() {
  const records: GuestPyroxeneRecord[] = [
    {
      recordId: "buyrecord001",
      createdAt: "2026-01-01T03:00:00.000Z",
      kind: "buy",
      quantity: 2,
      date: "2026-02-08T03:00:00.000Z",
      repeatType: "fixed_days",
      monthlyCount: 1,
    },
    {
      recordId: "fullpack0001",
      createdAt: "2026-01-01T03:00:00.000Z",
      kind: "monthlyPackage",
      startDate: "2026-02-01T03:00:00.000Z",
      packageType: "full",
      autoRepurchase: false,
    },
    {
      recordId: "halfpack0001",
      createdAt: "2026-01-01T03:00:00.000Z",
      kind: "monthlyPackage",
      startDate: "2026-02-03T03:00:00.000Z",
      packageType: "half",
      autoRepurchase: false,
    },
    {
      recordId: "apackage0001",
      createdAt: "2026-01-01T03:00:00.000Z",
      kind: "apPackage",
      startDate: "2026-02-04T03:00:00.000Z",
      autoRepurchase: false,
    },
    {
      recordId: "attendance01",
      createdAt: "2026-01-01T03:00:00.000Z",
      kind: "attendance",
      startDate: "2026-02-02T03:00:00.000Z",
    },
    {
      recordId: "otherrec0001",
      createdAt: "2026-01-01T03:00:00.000Z",
      kind: "other",
      description: "",
      date: "2026-02-09T03:00:00.000Z",
      resources: { pyroxene: 10, oneTimeTicket: 0, tenTimeTicket: 0 },
    },
    {
      recordId: "otherrec0002",
      createdAt: "2026-01-01T03:00:00.000Z",
      kind: "other",
      description: "이벤트 보상",
      date: "2026-02-10T03:00:00.000Z",
      resources: { pyroxene: 10, oneTimeTicket: 0, tenTimeTicket: 0 },
    },
  ];
  const pyroxene = createEmptyGuestPyroxenePlanner();
  pyroxene.data.records = records;
  const eventShops = createEmptyGuestEventShopPlanner();
  const envelope = createGuestPlannerFromLegacySources({ pyroxene, eventShops });
  envelope.legacyMirror = createGuestPlannerLegacyMirror(envelope, { pyroxene, eventShops });
  return { records, pyroxene, eventShops, envelope };
}

function recordGroups(envelope: ReturnType<typeof createPlannerWithGuestRecords>["envelope"]) {
  const guestRecordsById = guestPyroxeneRecordsById(envelope);
  return guestTimelineRecordGroupsById(envelope.document.pyroxene.records, guestRecordsById);
}

describe("unified planner import action", () => {
  it("uses each guest record's own name and date for current and old-version records", () => {
    const { records, pyroxene, envelope } = createPlannerWithGuestRecords();
    const conflict: GuestPlannerLegacyConflict = {
      id: "legacy-conflict-test",
      pyroxene,
      eventShops: null,
      keys: {
        pyroxene: {
          resources: false,
          records: records.map((record) => record.recordId),
          options: false,
          eventTrials: [],
          favorites: [],
          collectedSourceKeys: [],
        },
        eventShopUids: [],
        removed: {
          resources: false,
          records: [],
          eventTrials: [],
          favorites: [],
          collectedSourceKeys: [],
          eventShopUids: [],
        },
      },
    };
    const conflictEnvelope = createGuestPlannerConflictEnvelope(conflict, "pyroxene");
    if (!conflictEnvelope) throw new Error("Conflict fixture did not create a pyroxene source.");
    const expected = [
      "청휘석 구매 · 02/08",
      "월정액 · 02/01",
      "반정액 · 02/03",
      "AP 패키지 · 02/04",
      "출석 시작일 · 02/02",
      "기타 수급 · 02/09",
      "이벤트 보상 · 02/10",
    ];
    const labels = (sourceEnvelope: typeof envelope) => {
      const byId = guestPyroxeneRecordsById(sourceEnvelope);
      return [...recordGroups(sourceEnvelope)].map(([_recordId, group]) => describeTimelineGroup(group, byId));
    };

    expect(labels(envelope)).toEqual(expected);
    expect(labels(conflictEnvelope)).toEqual(expected);
  });

  it("defaults attendance checked only when the account has no attendance, matching the old import screen", () => {
    const { records, envelope } = createPlannerWithGuestRecords();
    const source = buildSources({
      status: "ready",
      envelope,
      legacySources: {
        pyroxene: null,
        eventShops: null,
        pyroxeneSignature: null,
        eventShopsSignature: null,
        pyroxeneCorrupt: false,
        eventShopsCorrupt: false,
      },
    })[0];
    const attendance = envelope.document.pyroxene.records.find((record) => record.source === "attendance");
    if (!source || !attendance) throw new Error("Attendance fixture is missing.");
    const attendanceRecordId = records.find((record) => record.kind === "attendance")?.recordId;
    if (!attendanceRecordId) throw new Error("Attendance guest record is missing.");
    const account = {
      resources: null,
      records: [],
      sourceKeys: [],
      eventData: [],
      favorites: [],
    };
    const withoutAccountAttendance = initialSelection(source, account);
    const withDifferentAccountAttendance = initialSelection(source, {
      ...account,
      records: [{ ...attendance, eventAt: "2026-03-01T03:00:00.000Z" }],
    });

    expect(withoutAccountAttendance.recordUids).toContain(attendanceRecordId);
    expect(withDifferentAccountAttendance.recordUids).not.toContain(attendanceRecordId);
  });

  it("uses the established source labels and keeps the account resource choice selected", () => {
    const markup = renderToStaticMarkup(
      createElement(ResourceConflictComparison, {
        selected: "account",
        guestResources: null,
        legacyResources: null,
        accountResources: null,
        onChange: () => undefined,
      }),
    );

    expect(markup).toContain("비로그인 시 등록한 값");
    expect(markup).toContain("이전 버전 화면에서 저장한 값");
    expect(markup).toContain("계정에 저장된 값");
    expect(markup.match(/<input[^>]*checked=""/g)).toHaveLength(1);
  });

  it("hides a received-rewards section when every guest key already exists in the account", () => {
    const envelope = createEmptyGuestPlanner();
    envelope.document.pyroxene.collectedSourceKeys = ["reward-1", "reward-2"];
    const accountKeys = new Set(["reward-1", "reward-2"]);

    expect(getMissingGuestCollectedSourceKeys(envelope.document.pyroxene.collectedSourceKeys, accountKeys)).toEqual([]);
    expect(countSourceItems(envelope, accountKeys)).toBe(0);
  });

  it("offers only the conflicting legacy value as a separately labeled import source", () => {
    const oldPyroxene = createEmptyGuestPyroxenePlanner();
    oldPyroxene.data.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    const oldShops = createEmptyGuestEventShopPlanner();
    const base = createGuestPlannerFromLegacySources({ pyroxene: oldPyroxene, eventShops: oldShops });
    const baseResources = base.document.pyroxene.resources;
    const submittedResources = oldPyroxene.data.resources;
    if (!baseResources || !submittedResources) throw new Error("Fixture resources are missing.");
    base.legacyMirror = createGuestPlannerLegacyMirror(base, { pyroxene: oldPyroxene, eventShops: oldShops });
    const current = {
      ...base,
      document: {
        ...base.document,
        pyroxene: {
          ...base.document.pyroxene,
          resources: { ...baseResources, pyroxene: 2400 },
        },
      },
    };
    const oldTabWrite = {
      ...oldPyroxene,
      revision: oldPyroxene.revision + 1,
      data: { ...oldPyroxene.data, resources: { ...submittedResources, pyroxene: 1800 } },
    };
    const merged = mergeGuestPlannerLegacyChanges(current, oldTabWrite, oldShops);
    const sources = buildSources({
      status: "ready",
      envelope: merged.envelope,
      legacySources: {
        pyroxene: null,
        eventShops: null,
        pyroxeneSignature: null,
        eventShopsSignature: null,
        pyroxeneCorrupt: false,
        eventShopsCorrupt: false,
      },
    });
    const oldSource = sources.find((source) => source.kind === "legacyConflict");

    expect(oldSource?.label).toBe("이전 버전 화면에서 저장한 값");
    expect(oldSource?.envelope.document.pyroxene.resources?.pyroxene).toBe(1800);
    expect(oldSource?.envelope.document.pyroxene.records).toEqual([]);
    expect(oldSource?.envelope.document.eventShops).toEqual({});
    expect(merged.envelope.document.pyroxene.resources?.pyroxene).toBe(2400);
  });

  it("keeps the save result and footer after a successful import clears the last guest section", () => {
    expect(
      getGuestPlannerImportDisplayState({
        sourceCount: 0,
        totalCount: 0,
        isComparing: false,
        compareError: null,
        hasStorageError: false,
        hasLegacyError: false,
        successfulSave: true,
      }),
    ).toEqual({ showNoDataCallout: false, showFooter: true });
  });

  it("shows event-resolvable bonus names and summarizes non-bonus uids once", () => {
    const catalog = {
      studentNamesByUid: { kotama: "코타마", swimsuitMiyu: "미유(수영복)" },
    } as never;
    const line = formatStudents(
      ["kotama", "swimsuitMiyu", ...Array.from({ length: 250 }, (_, index) => `unrelated-${index}`)],
      catalog,
    );

    expect(line).toBe("코타마 · 미유(수영복) · 이벤트 보너스 대상이 아닌 선택 250명");
    expect(line).not.toContain("학생 이름을 확인할 수 없어요");
  });

  it("shows one explicit state when the event student catalog is unavailable", () => {
    expect(
      formatStudents(
        Array.from({ length: 250 }, (_, index) => `student-${index}`),
        null,
      ),
    ).toBe("이벤트 상점 학생 정보를 확인할 수 없어요.");
  });

  it("sends the selected document and favorite command through one import operation", async () => {
    const envelope = createEmptyGuestPlanner();
    envelope.document.pyroxene.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 1200,
      oneTimeTicket: 1,
      tenTimeTicket: 2,
    };
    const favorite = { contentUid: "content-1", studentUid: "student-1" };
    envelope.favorites = [favorite];
    mockImportGuestPlannerState.mockImplementationOnce(async (...args: unknown[]) => {
      const plan = args[2] as { favorites: Array<{ run: () => Promise<void> }> };
      await plan.favorites[0]?.run();
      return {
        verified: [
          { sourceId: "current", datasetId: envelope.datasetId, type: "favorite", key: "content-1\u0000student-1" },
        ],
        failed: [{ sourceId: "current", datasetId: envelope.datasetId, type: "resources", key: "current" }],
        revisionConflict: true,
      };
    });

    const result = await action(
      actionArgs(
        new Request("https://mollulog.test/planner/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources: [
              {
                id: "current",
                envelope,
                selection: {
                  resources: true,
                  options: false,
                  recordUids: [],
                  sourceKeys: [],
                  eventUids: [],
                  eventShopUids: [],
                  favorites: [favorite],
                },
              },
            ],
          }),
        }),
      ),
    );

    expect(mockImportGuestPlannerState).toHaveBeenCalledTimes(1);
    expect(mockFavoriteStudent).toHaveBeenCalledWith(env, 7, "student-1", "content-1", { ctx });
    expect(result).toMatchObject({
      success: false,
      verified: 1,
      failedLabels: ["현재 보유 재화"],
      revisionConflict: true,
      successfulSections: { current: ["recruitment"] },
    });
  });

  it("rejects a selected item that is not present in its submitted guest envelope", async () => {
    const envelope = createEmptyGuestPlanner();
    const result = await action(
      actionArgs(
        new Request("https://mollulog.test/planner/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources: [
              {
                id: "current",
                envelope,
                selection: {
                  resources: false,
                  options: false,
                  recordUids: [],
                  sourceKeys: ["missing-source"],
                  eventUids: [],
                  eventShopUids: [],
                  favorites: [],
                },
              },
            ],
          }),
        }),
      ),
    );

    expect(result).toMatchObject({
      data: { success: false, failedLabels: ["선택한 항목이 원본 데이터와 일치하지 않아요"] },
      init: { status: 400 },
    });
    expect(mockImportGuestPlannerState).not.toHaveBeenCalled();
  });

  it("accepts a reappeared legacy key as a separate import source", async () => {
    const legacy = createEmptyGuestPyroxenePlanner();
    legacy.data.resources = {
      inputAt: "2026-09-01T00:00:00.000Z",
      pyroxene: 900,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    const envelope = createGuestPlannerFromLegacySources({ pyroxene: legacy, eventShops: null });
    mockImportGuestPlannerState.mockImplementationOnce(async (...args: unknown[]) => {
      const plan = args[2] as { sources: Array<{ sourceId: string; datasetId: string }> };
      expect(plan.sources[0]).toMatchObject({ sourceId: "legacy-pyroxene", datasetId: legacy.datasetId });
      return {
        verified: [{ sourceId: "legacy-pyroxene", datasetId: legacy.datasetId, type: "resources", key: "current" }],
        failed: [],
        revisionConflict: false,
      };
    });

    const result = await action(
      actionArgs(
        new Request("https://mollulog.test/planner/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sources: [
              {
                id: "legacy-pyroxene",
                envelope,
                selection: {
                  resources: true,
                  options: false,
                  recordUids: [],
                  sourceKeys: [],
                  eventUids: [],
                  eventShopUids: [],
                  favorites: [],
                },
              },
            ],
          }),
        }),
      ),
    );

    expect(result).toMatchObject({
      success: true,
      verified: 1,
      successfulSections: { "legacy-pyroxene": ["resources"] },
    });
  });
});
