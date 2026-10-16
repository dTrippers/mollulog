import type { RecruitmentPeriod } from "~/domain/recruitment-period-notice";
import type { Attack, Defense, Terrain } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { ContentCommentSummary } from "~/models/content";
import type { EventType, RaidType } from "~/models/content.d";
import type { FutureStudentEntry } from "../students/types";

export type FutureBannerId = "student-analysis" | "pending-student-favorite";

export type FutureRaidView = {
  raidType: RaidType;
  seasonIndex?: number;
  boss: string;
  name: string;
  terrain: Terrain;
  attackType: Attack | null;
  defenseTypes: { defenseType: Defense; difficulty: string | null }[];
};

export type FutureOpinionState = {
  // Undefined while the summary loads. Null when it could not be loaded.
  summary: ContentCommentSummary | null | undefined;
};

// One content as the 2.0 views render it. The route builds it from the loader data and the viewer's local state.
export type FutureViewContent = {
  uid: string;
  name: string;
  contentType: EventType | RaidType;
  runType: "first" | "rerun" | "permanent";
  since: UtcIsoString;
  until: UtcIsoString | null;
  endless: boolean;
  confirmed: boolean;
  isSpoiler: boolean;
  tags: string[];
  minigameType: string | null;
  // Content uid of the event logo. Raids use the boss image instead.
  logoContentUid: string | null;
  raid: FutureRaidView | null;
  link: string;
  linkable: boolean;
  navigationState: unknown;
  recruitmentGroupUid: string | null;
  recruitmentPeriod: RecruitmentPeriod | null;
  students: FutureStudentEntry[];
  // Null when the content has no recruitment and is not an opinion-enabled type.
  opinion: FutureOpinionState | null;
  // Recruitment group result edit link for a content with completed students. Null otherwise.
  resultEditLink: string | null;
  studentAnalysisFavoriteKey: string | null;
  pendingFavoriteKey: string | null;
};
