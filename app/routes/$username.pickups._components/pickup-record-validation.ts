// The six validation messages of the record editor. They are the product's existing copy, so keep the wording.
export type PickupRecordField = "event" | "totalCount" | "tier3Count" | "tier3Students" | "exchangedStudents";

export type PickupRecordIssue = { field: PickupRecordField; message: string };

export function getPickupRecordIssues({
  eventUid,
  totalCount,
  tier3Count,
  tier3StudentCount,
  skipTier3StudentList,
  exchangedStudentCount,
}: {
  eventUid: string | null;
  totalCount?: number;
  tier3Count?: number;
  tier3StudentCount: number;
  skipTier3StudentList: boolean;
  exchangedStudentCount: number;
}): PickupRecordIssue[] {
  const issues: PickupRecordIssue[] = [];
  if (!eventUid) {
    issues.push({ field: "event", message: "모집 이벤트를 선택해주세요." });
  }
  if (totalCount === undefined || totalCount <= 0) {
    issues.push({ field: "totalCount", message: "총 모집 횟수를 입력해주세요." });
  }
  if (tier3Count === undefined || tier3Count < 0) {
    issues.push({ field: "tier3Count", message: "모집한 ★3 횟수를 입력해주세요." });
  }
  if (totalCount !== undefined && totalCount > 0 && tier3Count !== undefined && tier3Count > totalCount) {
    issues.push({ field: "tier3Count", message: "모집한 ★3 횟수는 총 모집 횟수보다 클 수 없어요." });
  }
  if (
    tier3Count !== undefined &&
    tier3Count >= 0 &&
    !skipTier3StudentList &&
    tier3StudentCount !== tier3Count &&
    !(totalCount !== undefined && totalCount > 0 && tier3Count > totalCount)
  ) {
    issues.push({
      field: "tier3Students",
      message: `모집한 ★3 학생을 ${tier3Count}명 선택해주세요. 현재 ${tier3StudentCount}명이 선택됐어요.`,
    });
  }
  if (totalCount !== undefined && totalCount > 0) {
    const maxExchangedStudentCount = Math.floor(totalCount / 200);
    if (exchangedStudentCount > maxExchangedStudentCount) {
      issues.push({
        field: "exchangedStudents",
        message: `모집 포인트 교환 학생은 최대 ${maxExchangedStudentCount}명까지 선택할 수 있어요.`,
      });
    }
  }
  return issues;
}
