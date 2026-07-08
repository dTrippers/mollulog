import { filterRecruitmentsByStudentUids } from "~/domain/recruitment-identity";
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
import { getRecruitmentGroupsByUids, getRecruitmentPoolStudents, type RecruitmentGroup } from "~/models/recruitment";
import { getAllStudentsMap } from "~/models/student";
import type { TimelineContent, TimelineContentType } from "~/models/timeline-content";
import {
  findEventsForRecruitmentStudent,
  getFutureRaidContents,
  getTimelineContents,
  groupTimelineContentsByRecruitmentGroupUid,
} from "~/models/timeline-content";

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
        // Which event this recruitment "belongs to" when its group is shared by multiple
        // events. Only set on the merged recruitment entry (see buildGroupRecruitmentContent);
        // absent elsewhere, where recruitment.uid === content.uid already disambiguates.
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

type PyroxeneEventVariant = Extract<PyroxenePlannerContent, { kind: "event" }>;
type PyroxeneRecruitmentDetail = PyroxeneEventVariant["recruitments"][number];

function toRecruitmentDetail(
  recruitment: RecruitmentGroup["recruitments"][number],
  studentsMap: Awaited<ReturnType<typeof getAllStudentsMap>>,
  sourceContentUid?: string,
): PyroxeneRecruitmentDetail {
  return {
    recruitmentType: recruitment.recruitmentType,
    pickup: recruitment.pickup,
    rerun: recruitment.rerun,
    until: recruitment.until ? toUtcIso(recruitment.until) : null,
    student: recruitment.student
      ? {
          uid: recruitment.student.uid,
          name: recruitment.student.name,
          initialTier: studentsMap[recruitment.student.uid]?.initialTier ?? 0,
        }
      : null,
    ...(sourceContentUid ? { sourceContentUid } : {}),
  };
}

function buildRecruitmentPoolInfo(
  group: RecruitmentGroup,
  recruitmentPoolStudents: Awaited<ReturnType<typeof getRecruitmentPoolStudents>>,
): PyroxeneEventVariant["recruitmentPool"] {
  const snapshot = buildRecruitmentPoolSnapshot({ recruitmentGroup: group, students: recruitmentPoolStudents });
  return {
    tier2Count: snapshot.nonPickupStudentsByTier.tier2.length,
    tier3Count: snapshot.nonPickupStudentsByTier.tier3.length,
  };
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
  const eventsByRecruitmentGroupUid = groupTimelineContentsByRecruitmentGroupUid(eventContents);
  // Multiple events can share one BAQL recruitment group (e.g. a rerun and its permanent
  // counterpart). Each event still gets its own reward-only entry (earnablePyroxene is tied
  // to that specific event, not the recruitment), but the group's recruitments are only
  // surfaced once, as a separate merged entry, so pickup cost isn't double-counted.
  const emittedGroupRecruitmentUids = new Set<string>();

  const results = await Promise.all(
    allContents.map(async (content): Promise<PyroxenePlannerContent[]> => {
      if ("kind" in content) {
        return [content];
      }

      if (EVENT_CONTENT_TYPES.includes(content.contentType)) {
        const group = content.recruitmentGroupUid ? recruitmentGroupMap.get(content.recruitmentGroupUid) : undefined;

        // Use the latest recruitment until date when endAt is missing.
        const until =
          content.endAt ??
          group?.recruitments.reduce<UtcIsoString | null>(
            (max, r) => (r.until ? (max && compareInstantDesc(max, r.until) < 0 ? max : toUtcIso(r.until)) : max),
            null,
          );
        if (!until) return [];

        const earnablePyroxene = content.contentType === "main_story" ? null : (content.earnablePyroxene ?? null);
        const siblingEvents = content.recruitmentGroupUid
          ? (eventsByRecruitmentGroupUid.get(content.recruitmentGroupUid) ?? [])
          : [];

        if (siblingEvents.length <= 1) {
          const recruitments = filterRecruitmentsByStudentUids(
            group?.recruitments ?? [],
            content.recruitmentStudentUids,
          ).map((r) => toRecruitmentDetail(r, studentsMap));

          return [
            {
              kind: "event" as const,
              uid: content.uid,
              recruitmentGroupUid: content.recruitmentGroupUid,
              name: content.name,
              since: content.startAt,
              until,
              earnablePyroxene,
              tags: content.tags,
              recruitments,
              recruitmentPool: group ? buildRecruitmentPoolInfo(group, recruitmentPoolStudents) : undefined,
            },
          ];
        }

        const rewardOnlyEntry: PyroxenePlannerContent = {
          kind: "event" as const,
          uid: content.uid,
          recruitmentGroupUid: content.recruitmentGroupUid,
          name: content.name,
          since: content.startAt,
          until,
          earnablePyroxene,
          tags: content.tags,
          recruitments: [],
        };

        const recruitmentGroupUid = content.recruitmentGroupUid as string;
        if (emittedGroupRecruitmentUids.has(recruitmentGroupUid)) {
          return [rewardOnlyEntry];
        }
        emittedGroupRecruitmentUids.add(recruitmentGroupUid);

        const sortedSiblings = [...siblingEvents].sort((a, b) => compareInstantAsc(a.startAt, b.startAt));
        const mergedRecruitments = (group?.recruitments ?? []).map((r) =>
          toRecruitmentDetail(
            r,
            studentsMap,
            findEventsForRecruitmentStudent(siblingEvents, r.student?.uid ?? null)[0]?.uid,
          ),
        );

        return [
          rewardOnlyEntry,
          {
            kind: "event" as const,
            uid: `group:${recruitmentGroupUid}`,
            recruitmentGroupUid,
            name: sortedSiblings.map((sibling) => sibling.name).join(" / "),
            since: group?.startAt ? toUtcIso(group.startAt) : content.startAt,
            until: group?.endAt ? toUtcIso(group.endAt) : until,
            earnablePyroxene: null,
            tags: [...new Set(sortedSiblings.flatMap((sibling) => sibling.tags))],
            recruitments: mergedRecruitments,
            recruitmentPool: group ? buildRecruitmentPoolInfo(group, recruitmentPoolStudents) : undefined,
          },
        ];
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

        if (!until) return [];

        return [
          {
            kind: "raid" as const,
            uid: content.uid,
            name: raidName,
            type: raidType,
            since: content.startAt,
            until,
          },
        ];
      }
      return [];
    }),
  );

  return results.flat();
}
