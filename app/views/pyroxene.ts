import { buildRecruitmentPoolSnapshot } from "~/domain/recruitment-simulator";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import { compareInstantAsc, compareInstantDesc, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import type { RaidType } from "~/models/content.d";
import {
  formatMainStoryVolumeTitle,
  getMainStories,
  type MainStoryPart,
  type MainStoryVolume,
} from "~/models/main-story";
import { getRaidSchedule } from "~/models/raid";
import { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } from "~/models/recruitment";
import { getAllStudentsMap } from "~/models/student";
import type { TimelineContent, TimelineContentType } from "~/models/timeline-content";
import { getFutureRaidContents, getTimelineContents } from "~/models/timeline-content";

const EVENT_CONTENT_TYPES: TimelineContentType[] = ["event", "main_story", "pickup"];
const MAIN_STORY_REWARD_REGION = "gl";
const MAIN_STORY_PYROXENE_PER_EPISODE = 60;
const MAIN_STORY_REWARD_ACTIVE_MS = 24 * 60 * 60 * 1000;

export type PyroxenePlannerContent =
  | {
      kind: "event";
      uid: string;
      recruitmentGroupUid: string | null;
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

export function buildMainStoryRewardContents(volumes: MainStoryVolume[]): PyroxenePlannerContent[] {
  const contents: PyroxenePlannerContent[] = [];

  for (const volume of volumes) {
    const volumeTitle = formatMainStoryVolumeTitle(volume);
    for (const chapter of volume.chapters) {
      for (const part of chapter.parts) {
        const releasedAt = part.schedules.find((schedule) => schedule.region === MAIN_STORY_REWARD_REGION)?.releasedAt;
        const episodeCount = getMainStoryPartEpisodeCount(part);
        if (!releasedAt || episodeCount === null) {
          continue;
        }

        const rewardAt = toUtcIso(releasedAt);
        contents.push({
          kind: "event",
          uid: `main-story-reward:${part.uid}`,
          recruitmentGroupUid: null,
          name: formatMainStoryRewardName(volumeTitle, chapter.chapterNumber, chapter.name, part.name),
          since: rewardAt,
          until: toUtcIso(new Date(new Date(rewardAt).getTime() + MAIN_STORY_REWARD_ACTIVE_MS)),
          rewardAt,
          earnablePyroxene: episodeCount * MAIN_STORY_PYROXENE_PER_EPISODE,
          tags: ["main_story_reward"],
          recruitments: [],
        });
      }
    }
  }

  return contents.sort((a, b) => compareInstantAsc(a.since, b.since));
}

function getMainStoryPartEpisodeCount(part: MainStoryPart): number | null {
  if (part.episodeStart === null || part.episodeEnd === null || part.episodeEnd < part.episodeStart) {
    return null;
  }

  return part.episodeEnd - part.episodeStart + 1;
}

function formatMainStoryRewardName(
  volumeTitle: string,
  chapterNumber: number,
  chapterName: string | null,
  partName: string | null,
) {
  return [volumeTitle, `제${chapterNumber}장`, chapterName, partName].filter(Boolean).join(" ");
}

function getContentStartAt(content: TimelineContent | PyroxenePlannerContent) {
  return "kind" in content ? content.since : content.startAt;
}

function getContentRecruitmentGroupUid(content: TimelineContent | PyroxenePlannerContent) {
  if ("kind" in content) {
    return content.kind === "event" ? content.recruitmentGroupUid : null;
  }

  return content.recruitmentGroupUid;
}

export async function getPyroxenePlannerContents(env: Env, forceRefresh = false): Promise<PyroxenePlannerContent[]> {
  // Events require syncedAt (confirmed by BAQL); raids are fetched regardless of syncedAt
  const [eventContents, raidContents, mainStories] = await Promise.all([
    getTimelineContents(env),
    getFutureRaidContents(env, ["raid"]),
    getMainStories(env, forceRefresh),
  ]);
  const raidUids = new Set(raidContents.map((c) => c.uid));
  const mainStoryRewardContents = buildMainStoryRewardContents(mainStories);
  const allContents: (TimelineContent | PyroxenePlannerContent)[] = [
    ...eventContents.filter((c) => !raidUids.has(c.uid)),
    ...raidContents,
    ...mainStoryRewardContents,
  ].sort((a, b) => compareInstantAsc(getContentStartAt(a), getContentStartAt(b)));

  const recruitmentGroupUids = allContents.map(getContentRecruitmentGroupUid).filter((uid) => uid !== null) as string[];
  const [recruitmentGroups, studentsMap, recruitmentPoolStudents] = await Promise.all([
    getRecruitmentGroupsByUids(env, recruitmentGroupUids, forceRefresh),
    getAllStudentsMap(env, true),
    getRecruitmentPoolStudents(env, forceRefresh),
  ]);

  const recruitmentGroupMap = new Map(recruitmentGroups.map((g) => [g.uid, g]));
  const results = await Promise.all(
    allContents.map(async (content) => {
      if ("kind" in content) {
        return content;
      }

      if (EVENT_CONTENT_TYPES.includes(content.contentType)) {
        const group = content.recruitmentGroupUid ? recruitmentGroupMap.get(content.recruitmentGroupUid) : undefined;
        const recruitments = (group?.recruitments ?? []).map((r) => ({
          recruitmentType: r.recruitmentType,
          pickup: r.pickup,
          rerun: r.rerun,
          until: r.until ? toUtcIso(r.until) : null,
          student: r.student
            ? {
                uid: r.student.uid,
                name: r.student.name,
                initialTier: studentsMap[r.student.uid]?.initialTier ?? 0,
              }
            : null,
        }));
        const recruitmentPool = group
          ? (() => {
              const snapshot = buildRecruitmentPoolSnapshot({
                recruitmentGroup: group,
                students: recruitmentPoolStudents,
              });
              return {
                tier2Count: snapshot.nonPickupStudentsByTier.tier2.length,
                tier3Count: snapshot.nonPickupStudentsByTier.tier3.length,
              };
            })()
          : undefined;

        // Use the latest recruitment until date when endAt is missing.
        const until =
          content.endAt ??
          group?.recruitments.reduce<UtcIsoString | null>(
            (max, r) => (r.until ? (max && compareInstantDesc(max, r.until) < 0 ? max : toUtcIso(r.until)) : max),
            null,
          );
        if (!until) return null;

        return {
          kind: "event" as const,
          uid: content.uid,
          recruitmentGroupUid: content.recruitmentGroupUid,
          name: content.name,
          since: content.startAt,
          until,
          earnablePyroxene: content.contentType === "main_story" ? null : (content.earnablePyroxene ?? null),
          tags: content.tags,
          recruitments,
          recruitmentPool,
        };
      }
      if (content.contentType === "raid") {
        let raidName = content.name;
        let raidType = content.contentType as RaidType;
        let until: UtcIsoString | null = content.endAt;

        if (content.contentUid) {
          const schedule = await getRaidSchedule(env, content.contentUid, forceRefresh);
          if (schedule) {
            raidName = schedule.raidBoss.name;
            raidType = schedule.raidType as RaidType;
            until = until ?? schedule.endAt;
          }
        }

        if (!until) return null;

        return {
          kind: "raid" as const,
          uid: content.uid,
          name: raidName,
          type: raidType,
          since: content.startAt,
          until,
        };
      }
      return null;
    }),
  );

  return results.filter((r) => r !== null);
}
