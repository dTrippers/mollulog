import type { FutureMediaSource } from "~/domain/futures/futures-view-model";
import type { RecruitTimeline } from "~/domain/recruit-recommendation-timeline";
import type { UtcIsoString } from "~/lib/date-time";
import type { EventType, RaidType } from "~/models/content.d";

// The viewer's favorite state of one pickup student. The count is null when the public counts could not be read; the
// own state is pending while it loads and unavailable when it failed, and the button is off in both cases.
export type RecruitPickupFavorite = {
  count: number | null;
  favorited: boolean;
  ownState: "guest" | "pending" | "ready" | "unavailable";
  onToggle: (favorited: boolean) => void;
};

// One pickup student as the 모집 추천 screens show it.
export type RecruitPickupView = {
  favoriteKey: string;
  // Null while the student data is being prepared.
  studentUid: string | null;
  name: string;
  variant: string | null;
  recruitmentLabel: string;
  isNew: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
  favorite: RecruitPickupFavorite;
};

// One content of the timeline. A hidden spoiler shows neither its name nor its students until the viewer reveals it.
export type RecruitContentView = {
  uid: string;
  name: string;
  contentType: EventType | RaidType;
  runType: "first" | "rerun" | "permanent";
  since: UtcIsoString;
  until: UtcIsoString | null;
  endless: boolean;
  typeLabel: string;
  mediaSource: FutureMediaSource;
  link: string;
  linkable: boolean;
  // The recruitment period, when it differs from the content's own period.
  cautionText: string | null;
  hidden: boolean;
  pickups: RecruitPickupView[];
};

export type RecruitTimelineView = RecruitTimeline<RecruitContentView, RecruitPickupView>;
