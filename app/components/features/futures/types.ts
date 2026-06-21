import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { RaidType } from "~/models/content.d";
import type { PyroxeneTimelineRepeatType, TimelineSourceType } from "~/models/pyroxene-planner";

export type PyroxeneScheduleItem = {
  event?: {
    uid: string;
    name: string;
    since: UtcIsoString | Date;
    until: UtcIsoString | Date;
    earnablePyroxene: number | null;
    tags: string[];
    recruitments: {
      recruitmentType: RecruitmentTypeEnum;
      pickup: boolean;
      rerun: boolean;
      until: UtcIsoString | null;
      student: { uid: string; name: string; initialTier: number } | null;
      favorited: boolean;
    }[];
    recruitmentPool?: {
      tier2Count: number;
      tier3Count: number;
    };
  };
  raid?: {
    uid: string;
    type: RaidType;
    name: string;
    since: UtcIsoString | Date;
    until: UtcIsoString | Date;
  };

  onetimeGain?: {
    uid?: string;
    source: TimelineSourceType;
    date: Date;
    description: string;
    pyroxeneDelta?: number;
    oneTimeTicketDelta?: number;
    tenTimeTicketDelta?: number;
    autoRepurchase?: boolean;
  };
  repeatedGain?: {
    uid?: string;
    source: TimelineSourceType;
    date: Date;
    description: string;
    pyroxeneDelta?: number;
    oneTimeTicketDelta?: number;
    tenTimeTicketDelta?: number;
    repeatType?: PyroxeneTimelineRepeatType;
    repeatIntervalDays?: number;
    repeatCount?: number;
    autoRepurchase?: boolean;
  };
};

export type PyroxeneCollectedSourceCandidate = {
  sourceKey: string;
  title: string;
  description: string;
};
