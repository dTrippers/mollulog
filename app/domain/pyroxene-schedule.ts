import type { TimelineSourceType } from "~/domain/pyroxene-planner";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import type { RaidType } from "~/models/content.d";
import type { PyroxeneTimelineItem, PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";

export type PyroxeneScheduleContent =
  | {
      kind: "event";
      uid: string;
      name: string;
      since: UtcIsoString;
      until: UtcIsoString;
      rewardAt?: UtcIsoString;
      earnablePyroxene: number | null;
      tags: string[];
      recruitments: {
        recruitmentType: RecruitmentTypeEnum;
        pickup: boolean;
        rerun: boolean;
        until: UtcIsoString | null;
        student: { uid: string; name: string; initialTier: number } | null;
        // Set when this content merges recruitments from multiple events sharing one
        // recruitment group; identifies which event this particular recruitment belongs to,
        // since favorites are stored per-event rather than per-group.
        sourceContentUid?: string;
      }[];
      recruitmentPool?: {
        tier2Count: number;
        tier3Count: number;
      };
    }
  | {
      kind: "raid";
      uid: string;
      name: string;
      type: RaidType;
      since: UtcIsoString;
      until: UtcIsoString;
    };

export type PyroxeneScheduleFavoriteStudent = {
  contentUid: string;
  studentUid: string;
};

export type PyroxeneScheduleItem = {
  event?: {
    uid: string;
    name: string;
    since: UtcIsoString | Date;
    until: UtcIsoString | Date;
    rewardAt?: UtcIsoString | Date;
    earnablePyroxene: number | null;
    tags: string[];
    recruitments: {
      recruitmentType: RecruitmentTypeEnum;
      pickup: boolean;
      rerun: boolean;
      until: UtcIsoString | null;
      student: { uid: string; name: string; initialTier: number } | null;
      favorited: boolean;
      sourceContentUid?: string;
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
  description?: string;
};

export function buildPyroxeneScheduleItems(
  contents: PyroxeneScheduleContent[],
  favoritedStudents: PyroxeneScheduleFavoriteStudent[],
  timelineItems: PyroxeneTimelineItem[],
): PyroxeneScheduleItem[] {
  const favoritedStudentKeys = new Set(
    favoritedStudents.map(({ contentUid, studentUid }) => `${contentUid}:${studentUid}`),
  );
  const items: PyroxeneScheduleItem[] = contents.map((content) => {
    if (content.kind === "event") {
      return {
        event: {
          uid: content.uid,
          name: content.name,
          since: content.since,
          until: content.until,
          rewardAt: content.rewardAt,
          earnablePyroxene: content.earnablePyroxene ?? null,
          tags: content.tags,
          recruitmentPool: content.recruitmentPool,
          recruitments: content.recruitments.map((recruitment) => ({
            ...recruitment,
            favorited:
              recruitment.student !== null &&
              favoritedStudentKeys.has(`${recruitment.sourceContentUid ?? content.uid}:${recruitment.student.uid}`),
          })),
        },
      };
    }

    return {
      raid: {
        uid: content.uid,
        name: content.name,
        type: content.type,
        since: content.since,
        until: content.until,
      },
    };
  });

  for (const item of timelineItems) {
    appendTimelineScheduleItem(items, item);
  }

  return items;
}

function appendTimelineScheduleItem(items: PyroxeneScheduleItem[], item: PyroxeneTimelineItem) {
  if (item.source === "buy") {
    if (item.repeatType === "monthly_first") {
      items.push({
        repeatedGain: {
          uid: item.uid,
          source: "buy",
          description: item.description,
          date: new Date(item.eventAt),
          pyroxeneDelta: item.pyroxeneDelta,
          repeatType: item.repeatType,
          repeatCount: item.repeatCount ?? undefined,
        },
      });
      return;
    }

    items.push({
      onetimeGain: {
        uid: item.uid,
        source: "buy",
        description: item.description,
        date: new Date(item.eventAt),
        pyroxeneDelta: item.pyroxeneDelta,
      },
    });
    return;
  }

  if (item.source === "package_onetime" || item.source === "package_ap") {
    if (item.autoRepurchase && item.repeatIntervalDays) {
      items.push({
        repeatedGain: {
          uid: item.uid,
          source: item.source,
          description: item.description,
          date: new Date(item.eventAt),
          pyroxeneDelta: item.pyroxeneDelta,
          repeatType: item.repeatType,
          repeatIntervalDays: item.repeatIntervalDays,
          repeatCount: item.repeatCount ?? undefined,
          autoRepurchase: item.autoRepurchase,
        },
      });
      return;
    }

    items.push({
      onetimeGain: {
        uid: item.uid,
        source: item.source,
        description: item.description,
        date: new Date(item.eventAt),
        pyroxeneDelta: item.pyroxeneDelta,
        autoRepurchase: item.autoRepurchase,
      },
    });
    return;
  }

  if (item.source === "package_daily") {
    items.push({
      repeatedGain: {
        uid: item.uid,
        source: "package_daily",
        description: item.description,
        date: new Date(item.eventAt),
        pyroxeneDelta: item.pyroxeneDelta,
        repeatType: item.repeatType,
        repeatIntervalDays: item.repeatIntervalDays ?? 0,
        repeatCount: item.repeatCount ?? undefined,
        autoRepurchase: item.autoRepurchase,
      },
    });
    return;
  }

  if (item.source === "attendance") {
    items.push({
      repeatedGain: {
        uid: item.uid,
        source: "attendance",
        description: item.description,
        date: new Date(item.eventAt),
        pyroxeneDelta: item.pyroxeneDelta,
        repeatType: item.repeatType,
        repeatIntervalDays: item.repeatIntervalDays ?? 0,
      },
    });
    return;
  }

  items.push({
    onetimeGain: {
      uid: item.uid,
      source: item.source,
      description: item.description,
      date: new Date(item.eventAt),
      pyroxeneDelta: item.pyroxeneDelta,
      oneTimeTicketDelta: item.oneTimeTicketDelta,
      tenTimeTicketDelta: item.tenTimeTicketDelta,
    },
  });
}
