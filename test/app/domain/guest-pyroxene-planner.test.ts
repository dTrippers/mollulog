import { describe, expect, it } from "@jest/globals";
import {
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

  it("기존 게스트 옵션에서 빠진 AP 충전 예외를 빈 목록으로 정규화한다", () => {
    const envelope = createEmptyGuestPyroxenePlanner();
    const oldShape = JSON.parse(JSON.stringify(envelope)) as typeof envelope;
    const storedOptions = oldShape.data.options as unknown as {
      consumption: { apChargeExceptions?: unknown };
    };
    delete storedOptions.consumption.apChargeExceptions;

    const parsed = parseGuestPyroxenePlanner(JSON.stringify(oldShape));

    expect(parsed?.data.options.consumption.apChargeExceptions).toEqual([]);
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
