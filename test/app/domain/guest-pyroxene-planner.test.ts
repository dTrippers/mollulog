import { describe, expect, it } from "@jest/globals";
import {
  clearVerifiedGuestPyroxeneImport,
  createEmptyGuestPyroxenePlanner,
  type GuestPyroxeneRecord,
  guestPyroxeneRecordToTimelineItems,
  hasGuestPyroxenePlannerData,
  parseGuestPyroxenePlanner,
} from "~/domain/guest-pyroxene-planner";

describe("guest pyroxene planner", () => {
  it("빈 데이터는 가져오기 대상으로 판단하지 않는다", () => {
    const envelope = createEmptyGuestPyroxenePlanner();

    expect(hasGuestPyroxenePlannerData(envelope.data)).toBe(false);
    expect(parseGuestPyroxenePlanner(JSON.stringify(envelope))).toEqual(envelope);
  });

  it("사용자 입력이 하나라도 있으면 가져오기 대상으로 판단한다", () => {
    const envelope = createEmptyGuestPyroxenePlanner();
    envelope.data.resources = {
      inputAt: "2026-07-19T01:00:00.000Z",
      pyroxene: 12_000,
      oneTimeTicket: 2,
      tenTimeTicket: 3,
    };

    expect(hasGuestPyroxenePlannerData(envelope.data)).toBe(true);
  });

  it("손상됐거나 제한을 벗어난 데이터는 거부한다", () => {
    const envelope = createEmptyGuestPyroxenePlanner();
    envelope.data.resources = {
      inputAt: "2026-07-19T01:00:00.000Z",
      pyroxene: -1,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };

    expect(parseGuestPyroxenePlanner("not-json")).toBeNull();
    expect(parseGuestPyroxenePlanner(JSON.stringify(envelope))).toBeNull();
  });

  it("일부 항목만 조용히 버리지 않고 전체를 손상 상태로 처리한다", () => {
    const envelope = createEmptyGuestPyroxenePlanner();
    envelope.data.favoriteStudents = [{ contentUid: "event", studentUid: "student" }];
    const parsed = JSON.parse(JSON.stringify(envelope)) as Record<string, unknown> & {
      data: { favoriteStudents: unknown[]; options: { event: { pickupChance: string } } };
    };
    parsed.data.favoriteStudents.push({ contentUid: "event" });

    expect(parseGuestPyroxenePlanner(JSON.stringify(parsed))).toBeNull();

    parsed.data.favoriteStudents.pop();
    parsed.data.options.event.pickupChance = "unknown";
    expect(parseGuestPyroxenePlanner(JSON.stringify(parsed))).toBeNull();
  });

  it("stable id에 와일드카드나 빈 문자열이 들어간 데이터는 거부한다", () => {
    const envelope = createEmptyGuestPyroxenePlanner();
    envelope.datasetId = "unsafe%id";
    expect(parseGuestPyroxenePlanner(JSON.stringify(envelope))).toBeNull();

    envelope.datasetId = "safe-dataset-id1";
    envelope.data.records = [
      {
        kind: "attendance",
        recordId: "",
        createdAt: "2026-07-19T01:00:00.000Z",
        startDate: "2026-07-19T01:00:00.000Z",
      },
    ];
    expect(parseGuestPyroxenePlanner(JSON.stringify(envelope))).toBeNull();
  });

  it("가져오기를 요청한 뒤 수정된 로컬 값은 이전 응답으로 지우지 않는다", () => {
    const submitted = createEmptyGuestPyroxenePlanner().data;
    submitted.resources = {
      inputAt: "2026-07-19T01:00:00.000Z",
      pyroxene: 12_000,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    submitted.optionsChanged = true;
    submitted.eventTrials = { event: 200 };

    const current = structuredClone(submitted);
    current.resources = {
      inputAt: "2026-07-19T02:00:00.000Z",
      pyroxene: 13_000,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    current.options = { ...current.options, consumption: { apChargeCount: 3 } };
    current.eventTrials.event = 300;

    const next = clearVerifiedGuestPyroxeneImport(current, submitted, {
      resources: true,
      options: true,
      recordIds: [],
      sourceKeys: [],
      eventUids: ["event"],
      favorites: [],
    });

    expect(next.resources).toEqual(current.resources);
    expect(next.options).toEqual(current.options);
    expect(next.optionsChanged).toBe(true);
    expect(next.eventTrials).toEqual({ event: 300 });
  });

  it("서버에서 확인된 항목만 로컬 데이터에서 정리한다", () => {
    const envelope = createEmptyGuestPyroxenePlanner();
    envelope.data.resources = {
      inputAt: "2026-07-19T01:00:00.000Z",
      pyroxene: 12_000,
      oneTimeTicket: 0,
      tenTimeTicket: 0,
    };
    envelope.data.eventTrials = { imported: 200, failed: 300 };
    envelope.data.collectedSourceKeys = ["imported", "failed"];

    const next = clearVerifiedGuestPyroxeneImport(envelope.data, envelope.data, {
      resources: true,
      options: false,
      recordIds: [],
      sourceKeys: ["imported"],
      eventUids: ["imported"],
      favorites: [],
    });

    expect(next.resources).toBeNull();
    expect(next.eventTrials).toEqual({ failed: 300 });
    expect(next.collectedSourceKeys).toEqual(["failed"]);
  });

  it("논리 레코드의 stable id를 계산 항목 uid로 사용한다", () => {
    const record: GuestPyroxeneRecord = {
      kind: "monthlyPackage",
      recordId: "stable-record-id",
      createdAt: "2026-07-19T01:00:00.000Z",
      startDate: "2026-07-19T01:00:00.000Z",
      packageType: "full",
      autoRepurchase: false,
    };

    expect(guestPyroxeneRecordToTimelineItems(record).map((item) => item.uid)).toEqual([
      "stable-record-id::onetime",
      "stable-record-id::daily",
    ]);
  });
});
