import { buildRecruitmentPoolSnapshot } from "~/domain/recruitment-simulator";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import { type UtcIsoString, compareInstantAsc, compareInstantDesc, toUtcIso } from "~/lib/date-time";
import type { RaidType } from "~/models/content.d";
import { getRaidSchedule } from "~/models/raid";
import { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } from "~/models/recruitment";
import { getAllStudentsMap } from "~/models/student";
import type { TimelineContentType } from "~/models/timeline-content";
import { getFutureRaidContents, getTimelineContents } from "~/models/timeline-content";

const EVENT_CONTENT_TYPES: TimelineContentType[] = ["event", "main_story", "pickup"];

export type PyroxenePlannerContent =
  | {
      kind: "event";
      uid: string;
      recruitmentGroupUid: string | null;
      name: string;
      since: UtcIsoString;
      until: UtcIsoString;
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

export async function getPyroxenePlannerContents(env: Env, forceRefresh = false): Promise<PyroxenePlannerContent[]> {
  // Events require syncedAt (confirmed by BAQL); raids are fetched regardless of syncedAt
  const [eventContents, raidContents] = await Promise.all([
    getTimelineContents(env),
    getFutureRaidContents(env, ["raid"]),
  ]);
  const raidUids = new Set(raidContents.map((c) => c.uid));
  const allContents = [...eventContents.filter((c) => !raidUids.has(c.uid)), ...raidContents].sort((a, b) =>
    compareInstantAsc(a.startAt, b.startAt),
  );

  const recruitmentGroupUids = allContents.map((c) => c.recruitmentGroupUid).filter((uid) => uid !== null) as string[];
  const [recruitmentGroups, studentsMap, recruitmentPoolStudents] = await Promise.all([
    getRecruitmentGroupsByUids(env, recruitmentGroupUids, forceRefresh),
    getAllStudentsMap(env, true),
    getRecruitmentPoolStudents(env, forceRefresh),
  ]);

  const recruitmentGroupMap = new Map(recruitmentGroups.map((g) => [g.uid, g]));
  const results = await Promise.all(
    allContents.map(async (content) => {
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
          earnablePyroxene: content.earnablePyroxene ?? null,
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
