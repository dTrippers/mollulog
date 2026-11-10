import { describe, expect, it } from "@jest/globals";
import { getPickupRecordIssues } from "../../../app/routes/$username.pickups._components/pickup-record-validation";

const valid = {
  eventUid: "event-1",
  totalCount: 100,
  tier3Count: 2,
  tier3StudentCount: 2,
  skipTier3StudentList: false,
  exchangedStudentCount: 0,
};

describe("getPickupRecordIssues", () => {
  it("has no issue for a complete record", () => {
    expect(getPickupRecordIssues(valid)).toEqual([]);
  });

  it("asks for the event, total count and tier3 count when they are missing", () => {
    expect(
      getPickupRecordIssues({ ...valid, eventUid: null, totalCount: undefined, tier3Count: undefined }).map(
        (issue) => issue.message,
      ),
    ).toEqual(["모집 이벤트를 선택해주세요.", "총 모집 횟수를 입력해주세요.", "모집한 ★3 횟수를 입력해주세요."]);
  });

  it("rejects a total count of zero", () => {
    expect(getPickupRecordIssues({ ...valid, totalCount: 0 })).toContainEqual({
      field: "totalCount",
      message: "총 모집 횟수를 입력해주세요.",
    });
  });

  it("rejects more tier3 results than total recruits without also asking for students", () => {
    const issues = getPickupRecordIssues({ ...valid, totalCount: 10, tier3Count: 11, tier3StudentCount: 0 });
    expect(issues).toEqual([{ field: "tier3Count", message: "모집한 ★3 횟수는 총 모집 횟수보다 클 수 없어요." }]);
  });

  it("requires the selected student count to match the tier3 count unless the list is skipped", () => {
    expect(getPickupRecordIssues({ ...valid, tier3StudentCount: 1 })).toEqual([
      { field: "tier3Students", message: "모집한 ★3 학생을 2명 선택해주세요. 현재 1명이 선택됐어요." },
    ]);
    expect(getPickupRecordIssues({ ...valid, tier3StudentCount: 0, skipTier3StudentList: true })).toEqual([]);
  });

  it("limits exchanged students to one per 200 recruits", () => {
    expect(getPickupRecordIssues({ ...valid, totalCount: 199, exchangedStudentCount: 1 })).toContainEqual({
      field: "exchangedStudents",
      message: "모집 포인트 교환 학생은 최대 0명까지 선택할 수 있어요.",
    });
    expect(getPickupRecordIssues({ ...valid, totalCount: 200, exchangedStudentCount: 1 })).toEqual([]);
  });
});
