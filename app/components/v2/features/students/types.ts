import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { Role } from "~/models/content.d";
import type { RecruitmentCompletionMeta } from "~/models/recruitment-result";

// One recruited student in one recruitment group, with the viewer's state for the quick panel.
export type FutureStudentEntry = {
  favoriteKey: string;
  studentUid: string | null;
  // Full recruitment name, including the variant in parentheses.
  studentName: string;
  attackType?: Attack;
  defenseType?: Defense;
  role?: Role;
  recruitmentLabel: string;
  recruitmentType: RecruitmentTypeEnum;
  pickup: boolean;
  rerun: boolean;
  since: UtcIsoString;
  until: UtcIsoString | null;
  favoritedCount: number;
  favorited: boolean;
  completed: boolean;
  canComplete: boolean;
  // True while the viewer's own state (favorites, results) is still loading. Own-state labels and actions wait for it.
  viewerPending: boolean;
  // True when the viewer's own state failed to load. Own-state icons stay neutral and own-state actions stay off.
  viewerUnavailable: boolean;
  completionMeta: RecruitmentCompletionMeta;
  // Result edit link of this recruitment group. Null when the viewer has no result for it.
  resultEditLink: string | null;
  onToggleFavorite: (favorited: boolean) => void;
  onToggleComplete: (completed: boolean) => void;
};
