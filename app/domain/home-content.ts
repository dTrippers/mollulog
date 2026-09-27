import type { TimelineContent } from "~/domain/timeline-content";
import { compareInstantAsc, isInstantAfter, type UtcIsoString } from "~/lib/date-time";
import { campaignCategoryLocale, drillTypeLocale } from "~/locales/ko";

export type HomeCampaign = {
  uid: string;
  category: string[];
  multiplier: number;
  startAt: UtcIsoString;
  endAt: UtcIsoString;
};

export type HomeCampaignSummary = {
  uid: string;
  categoryLabel: string;
  multiplier: number;
  endAt: UtcIsoString;
};

export type HomeCampaignSelection = { status: "success"; campaigns: HomeCampaignSummary[] } | { status: "error" };

export function selectHomeCampaigns(campaigns: HomeCampaign[], now: UtcIsoString): HomeCampaignSelection {
  const ongoingCampaigns = campaigns
    .filter(({ startAt, endAt }) => !isInstantAfter(startAt, now) && isInstantAfter(endAt, now))
    .sort((a, b) => compareInstantAsc(a.endAt, b.endAt));

  const campaignSummaries: HomeCampaignSummary[] = [];
  for (const campaign of ongoingCampaigns) {
    const categories = campaign.category.map((category) => campaignCategoryLocale[category]);
    if (categories.length === 0 || categories.some((category) => !category)) {
      return { status: "error" };
    }

    campaignSummaries.push({
      uid: campaign.uid,
      categoryLabel: categories.join(" · "),
      multiplier: campaign.multiplier,
      endAt: campaign.endAt,
    });
  }

  return { status: "success", campaigns: campaignSummaries };
}

export type HomeJointFiringDrill = {
  season: number;
  drillType: string;
  schedules: {
    region: string;
    startAt: UtcIsoString;
    endAt: UtcIsoString | null;
  }[];
};

export type HomeJointFiringDrillSelection =
  | { kind: "ongoing"; season: number; drillTypeLabel: string; endAt: UtcIsoString }
  | { kind: "upcoming"; season: number; drillTypeLabel: string; startAt: UtcIsoString }
  | { kind: "none" }
  | { kind: "error" };

export function selectHomeJointFiringDrill(
  drills: HomeJointFiringDrill[],
  now: UtcIsoString,
): HomeJointFiringDrillSelection {
  const glSchedules = drills.flatMap((drill) =>
    drill.schedules
      .filter(({ region }) => region === "gl")
      .map((schedule) => ({ ...schedule, season: drill.season, drillType: drill.drillType })),
  );

  const ongoing = glSchedules
    .filter(({ startAt, endAt }) => !isInstantAfter(startAt, now) && (!endAt || isInstantAfter(endAt, now)))
    .sort((a, b) => {
      if (!a.endAt) return b.endAt ? 1 : 0;
      if (!b.endAt) return -1;
      return compareInstantAsc(a.endAt, b.endAt);
    });

  if (ongoing.length > 0) {
    const schedule = ongoing[0];
    const drillTypeLabel = drillTypeLocale[schedule.drillType];
    if (!schedule.endAt || !drillTypeLabel) {
      return { kind: "error" };
    }
    return { kind: "ongoing", season: schedule.season, drillTypeLabel, endAt: schedule.endAt };
  }

  const upcoming = glSchedules
    .filter(({ startAt }) => isInstantAfter(startAt, now))
    .sort((a, b) => compareInstantAsc(a.startAt, b.startAt));
  if (upcoming.length === 0) {
    return { kind: "none" };
  }

  const schedule = upcoming[0];
  const drillTypeLabel = drillTypeLocale[schedule.drillType];
  if (!drillTypeLabel) {
    return { kind: "error" };
  }
  return { kind: "upcoming", season: schedule.season, drillTypeLabel, startAt: schedule.startAt };
}

export function selectHomeMainStory(content: TimelineContent | null, now: UtcIsoString) {
  return content && !isInstantAfter(content.startAt, now) ? content : null;
}
