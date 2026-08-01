export const COMMUNITY_WRITE_FREEZE_KEY = "ops::community-write-freeze::v1";

export const COMMUNITY_WRITE_MAINTENANCE_TITLE = "서비스 점검 중이에요";
export const COMMUNITY_WRITE_MAINTENANCE_DESCRIPTION =
  "일부 기능을 사용할 수 없어요. 조회성 기능은 정상적으로 이용할 수 있으니 잠시 후 다시 시도해주세요.";

export type CommunityWriteMaintenanceActionResult = {
  kind: "communityWriteMaintenance";
  expected: true;
};

export const COMMUNITY_WRITE_MAINTENANCE_RESULT = {
  kind: "communityWriteMaintenance",
  expected: true,
} as const satisfies CommunityWriteMaintenanceActionResult;

export function isCommunityWriteMaintenanceActionResult(
  value: unknown,
): value is CommunityWriteMaintenanceActionResult {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "communityWriteMaintenance" &&
    "expected" in value &&
    value.expected === true
  );
}
