import type { TimelineContentNameI18n } from "~/domain/timeline-content-name-i18n";
import { selectTimelineContentName } from "~/domain/timeline-content-name-i18n";
import type { UtcIsoString } from "~/lib/date-time";

export type TimelineContentType =
  | "live"
  | "event"
  | "mini_event"
  | "pickup"
  | "main_story"
  | "mini_story"
  | "campaign"
  | "joint_firing_drill"
  | "raid"
  | "total_assault"
  | "elimination"
  | "unlimit"
  | "allied"; // 하위 호환

export type RunType = "first" | "rerun" | "permanent";

export type TimelineContentVideo = {
  title: string;
  youtube: string;
  start: number | null;
};

export type TimelineContent = {
  uid: string;
  name: string;
  nameI18n: TimelineContentNameI18n;
  startAt: UtcIsoString;
  endAt: UtcIsoString | null;
  endless: boolean;
  imageUrl: string | null;
  videos: TimelineContentVideo[];
  contentType: TimelineContentType;
  runType: RunType;
  occurrence: number | null;
  contentUid: string | null;
  shopContentUid: string | null;
  recruitmentGroupUid: string | null;
  // null = 그룹의 모든 학생 노출(하위호환 기본값). 값이 있으면 이 이벤트 페이지엔 해당 uid의 학생만 필터링해서 보여줌.
  recruitmentStudentUids: string[] | null;
  confirmed: boolean;
  isSpoiler: boolean;
  tags: string[];
  earnablePyroxene: number | null;
  syncedAt: UtcIsoString | null;
};

export type RawTimelineContent = Omit<TimelineContent, "name">;

export function toTimelineContent(raw: RawTimelineContent): TimelineContent {
  const name = selectTimelineContentName(raw.nameI18n);
  if (!name) {
    throw new Error(
      `timeline content name is missing: uid=${raw.uid}, contentType=${raw.contentType}, contentUid=${raw.contentUid ?? "null"}`,
    );
  }

  return { ...raw, name };
}
