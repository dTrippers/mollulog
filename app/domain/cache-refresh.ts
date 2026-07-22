export const SOURCE_CACHE_REFRESH_TASK_NAMES = [
  "syncYoutubeCommunityPosts",
  "syncRawStudents",
  "warmRecruitmentCache",
  "warmRaidCache",
  "getMainStories",
  "getAllStudentsFavoriteItems",
  "syncAllTimelineContentsMeta",
  "syncEventContentsList",
  "warmStudentSkillItems",
  "warmStudentGearData",
  "warmActiveUpcomingEventContent",
  "getItemCatalogResources",
  "getCampaignFarmingStages",
] as const;

export const ROUTE_CACHE_REFRESH_TASK_NAMES = [
  "getEventList",
  "getIndexContents",
  "getFutureContents",
  "getNavigationBarContentsRaw",
] as const;

export const CACHE_REFRESH_TASK_NAMES = [
  ...SOURCE_CACHE_REFRESH_TASK_NAMES,
  ...ROUTE_CACHE_REFRESH_TASK_NAMES,
] as const;

export type CacheRefreshTaskName = (typeof CACHE_REFRESH_TASK_NAMES)[number];
export type CacheRefreshJobStatus = "queued" | "running" | "completed" | "partial_failure" | "failed";
export type CacheRefreshTaskStatus = "pending" | "succeeded" | "failed" | "skipped";

export type CacheRefreshTaskResult = {
  status: CacheRefreshTaskStatus;
  durationMs: number | null;
  error: string | null;
};

export type CacheRefreshTaskResults = Record<CacheRefreshTaskName, CacheRefreshTaskResult>;

export type CacheRefreshJob = {
  uid: string;
  requestedBy: number;
  status: CacheRefreshJobStatus;
  currentTask: CacheRefreshTaskName | null;
  completedCount: number;
  totalCount: number;
  taskResults: CacheRefreshTaskResults;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CacheRefreshWorkflowParams = {
  requestedBy: number;
};

export type CacheRefreshWorkflowOutput = {
  status: Extract<CacheRefreshJobStatus, "completed" | "partial_failure">;
  taskResults: CacheRefreshTaskResults;
};

export const CACHE_REFRESH_TASK_LABELS: Record<CacheRefreshTaskName, string> = {
  syncYoutubeCommunityPosts: "YouTube 커뮤니티 동기화",
  syncRawStudents: "학생 원본 데이터",
  warmRecruitmentCache: "모집 캐시",
  warmRaidCache: "총력전 캐시",
  getMainStories: "메인 스토리",
  getAllStudentsFavoriteItems: "학생 선물 데이터",
  syncAllTimelineContentsMeta: "타임라인 메타데이터",
  syncEventContentsList: "이벤트 콘텐츠 목록",
  warmStudentSkillItems: "학생 스킬 재료",
  warmStudentGearData: "학생 장비 데이터",
  warmActiveUpcomingEventContent: "진행·예정 이벤트",
  getItemCatalogResources: "아이템 카탈로그",
  getCampaignFarmingStages: "캠페인 파밍 스테이지",
  getEventList: "이벤트 목록 화면",
  getIndexContents: "홈 화면",
  getFutureContents: "미래시 화면",
  getNavigationBarContentsRaw: "내비게이션",
};

export function createPendingCacheRefreshTaskResults(): CacheRefreshTaskResults {
  return Object.fromEntries(
    CACHE_REFRESH_TASK_NAMES.map((name) => [name, { status: "pending", durationMs: null, error: null }]),
  ) as CacheRefreshTaskResults;
}

export function isCacheRefreshJobActive(status: CacheRefreshJobStatus): boolean {
  return status === "queued" || status === "running";
}

export function isCacheRefreshTaskName(value: string): value is CacheRefreshTaskName {
  return CACHE_REFRESH_TASK_NAMES.includes(value as CacheRefreshTaskName);
}

export function countCompletedCacheRefreshTasks(results: CacheRefreshTaskResults): number {
  return CACHE_REFRESH_TASK_NAMES.filter((name) => results[name].status !== "pending").length;
}
