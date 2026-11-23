import { describe, expect, it } from "@jest/globals";
import {
  createEmptyGuestPyroxenePlanner,
  type GuestPyroxeneRecord,
  guestPyroxeneRecordToTimelineItems,
  hasGuestPyroxenePlannerData,
  parseGuestPyroxenePlanner,
  pyroxeneTimelineItemFingerprint,
} from "~/domain/guest-pyroxene-planner";
import type { PyroxeneTimelineItem } from "~/models/pyroxene-planner";

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

  it("구매·직접 등록은 레코드를 만든 시각으로 변환해, 언제 다시 변환해도 같은 시각이 나온다", () => {
    const record: GuestPyroxeneRecord = {
      kind: "other",
      recordId: "other-record-id",
      createdAt: "2026-11-17T12:15:00.000Z", // 21:15 KST on 11/17
      resources: { pyroxene: 1118, oneTimeTicket: 0, tenTimeTicket: 0 },
      description: "점검 보상",
      date: "2026-11-16T15:00:00.000Z", // 11/17 picked in the dialog
    };

    expect(guestPyroxeneRecordToTimelineItems(record)[0].eventAt).toBe("2026-11-17T12:15:00.000Z");
    expect(
      guestPyroxeneRecordToTimelineItems({ ...record, date: "2026-11-17T15:00:00.000Z" })[0].eventAt, // 11/18 picked
    ).toBe("2026-11-17T19:00:00.000Z");
    expect(
      guestPyroxeneRecordToTimelineItems({
        kind: "buy",
        recordId: "buy-record-id",
        createdAt: "2026-11-17T12:15:00.000Z",
        quantity: 600,
        date: "2026-11-16T15:00:00.000Z",
        repeatType: "fixed_days",
        monthlyCount: 1,
      })[0].eventAt,
    ).toBe("2026-11-17T12:15:00.000Z");
  });

  it("구매·직접 등록은 같은 내용인지 게임일 기준으로 비교한다", () => {
    const item = (overrides: Partial<PyroxeneTimelineItem>): PyroxeneTimelineItem => ({
      uid: "item",
      userId: 0,
      eventAt: "2026-11-16T19:00:00.000Z",
      source: "buy",
      description: "청휘석 구매",
      pyroxeneDelta: 6600,
      oneTimeTicketDelta: 0,
      tenTimeTicketDelta: 0,
      repeatType: "fixed_days",
      repeatIntervalDays: null,
      repeatCount: null,
      autoRepurchase: false,
      ...overrides,
    });
    const fingerprint = (overrides: Partial<PyroxeneTimelineItem>) => pyroxeneTimelineItemFingerprint(item(overrides));

    // 04:00 and 21:15 KST on 11/17 are the same game day.
    expect(fingerprint({ eventAt: "2026-11-17T12:15:00.000Z" })).toBe(fingerprint({}));
    expect(fingerprint({ eventAt: "2026-11-17T19:00:00.000Z" })).not.toBe(fingerprint({}));
    expect(fingerprint({ source: "package_onetime", eventAt: "2026-11-17T12:15:00.000Z" })).not.toBe(
      fingerprint({ source: "package_onetime" }),
    );
  });
});
