import { nanoid } from "nanoid/non-secure";
import { applyPostgresTimelineAutoSyncPlan, getPostgresTimelineAutoSyncRows } from "~/db/postgres/timeline-contents";
import {
  planTimelineAutoSync,
  type TimelineAutoSyncCandidate,
  type TimelineAutoSyncExistingRow,
  type TimelineAutoSyncJpRaidSeasonReference,
  type TimelineAutoSyncUpdatePolicy,
} from "~/domain/timeline-auto-sync";
import type { RunType, TimelineContentType } from "~/domain/timeline-content";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { isInstantAfter, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import { campaignCategoryLocale, drillTypeLocale } from "~/locales/ko";

// BAQL names the Korean server's schedules "gl". The sync never falls back to another region's schedule.
const AUTO_SYNC_REGION = "gl";

type TimelineAutoSyncRejection = { contentUid: string; reason: string };

type TimelineAutoSyncFetchResult = {
  candidates: TimelineAutoSyncCandidate[];
  /** Source items that cannot become a row. The valid ones still sync, then the run fails to surface these. */
  rejected: TimelineAutoSyncRejection[];
  /** Raids: every returned GL schedule with a JP season, so a season's ambiguity counts the rejected ones too. */
  jpRaidSeasonReferences?: TimelineAutoSyncJpRaidSeasonReference[];
};

/** A content type whose schedule is reliable enough to write to the timeline without review. */
export type TimelineAutoSyncSource = {
  contentType: TimelineContentType;
  /** Defaults to touching only future rows and keeping a row's own end when the source knows none. */
  updatePolicy?: TimelineAutoSyncUpdatePolicy;
  /** `rows` holds every timeline row of the content type, whatever its period. */
  fetchCandidates(
    now: UtcIsoString,
    rows: readonly TimelineAutoSyncExistingRow[],
  ): Promise<TimelineAutoSyncFetchResult>;
};

const RUN_TYPES: readonly string[] = ["first", "rerun", "permanent"] satisfies RunType[];

function isRunType(value: string): value is RunType {
  return RUN_TYPES.includes(value);
}

/** The future rows an update-only source looks up at BAQL. Rows it cannot look up are rejected. */
function futureLinkedRows(
  rows: readonly TimelineAutoSyncExistingRow[],
  now: UtcIsoString,
  rejected: TimelineAutoSyncRejection[],
): Array<TimelineAutoSyncExistingRow & { contentUid: string; runType: RunType }> {
  const result: Array<TimelineAutoSyncExistingRow & { contentUid: string; runType: RunType }> = [];
  for (const row of rows) {
    if (row.contentUid === null || !isInstantAfter(row.startAt, now)) continue;
    if (!isRunType(row.runType)) {
      rejected.push({ contentUid: row.contentUid, reason: `row ${row.uid} has unknown run type: ${row.runType}` });
      continue;
    }
    result.push({ ...row, contentUid: row.contentUid, runType: row.runType });
  }
  return result;
}

/** Campaigns and drills keep the update rules they had before forecast schedules moved to MolluLog. */
const STARTED_ROWS_UPDATE_POLICY: TimelineAutoSyncUpdatePolicy = {
  updateStartedRows: true,
  keepOwnEndWithoutSourceEnd: false,
  matchBy: "content",
};

/** The schedule a row's occurrence points to, the way an admin's sync picks it: the n-th in start order. */
function selectByOccurrence<T>(sortedSchedules: readonly T[], occurrence: number | null): T | null {
  const index = occurrence && occurrence > 0 ? occurrence - 1 : 0;
  return sortedSchedules[index] ?? null;
}

function compareInstants(a: Date | string, b: Date | string): number {
  return Date.parse(toUtcIso(a)) - Date.parse(toUtcIso(b));
}

const timelineAutoSyncCampaignsQuery = graphql(`
  query TimelineAutoSyncCampaigns($region: String!, $endAfter: ISO8601DateTime) {
    campaigns(region: $region, endAfter: $endAfter) {
      uid
      category
      multiplier
      startAt
      endAt
    }
  }
`);

function buildCampaignName(categories: readonly string[], multiplier: number): string | null {
  const names = categories.map((category) => campaignCategoryLocale[category]);
  if (names.length === 0 || names.some((name) => !name)) return null;
  return `${names.join("/")} 보상량 ${multiplier}배`;
}

const campaignSource: TimelineAutoSyncSource = {
  contentType: "campaign",
  updatePolicy: STARTED_ROWS_UPDATE_POLICY,
  async fetchCandidates(now) {
    const { data, error } = await runQuery(timelineAutoSyncCampaignsQuery, {
      region: AUTO_SYNC_REGION,
      endAfter: new Date(now),
    });
    if (error || !data) {
      throw error ?? new Error("failed to fetch campaigns for timeline auto sync");
    }

    const result: TimelineAutoSyncFetchResult = { candidates: [], rejected: [] };
    for (const campaign of data.campaigns) {
      const name = buildCampaignName(campaign.category, campaign.multiplier);
      if (!name) {
        result.rejected.push({
          contentUid: campaign.uid,
          reason: `unknown campaign category: ${campaign.category.join(",")}`,
        });
        continue;
      }

      result.candidates.push({
        contentType: "campaign",
        contentUid: campaign.uid,
        runType: "first",
        occurrence: null,
        startAt: toUtcIso(campaign.startAt),
        contentEndAt: toUtcIso(campaign.endAt),
        // BAQL lists only confirmed campaigns.
        create: { uid: `campaign-${campaign.uid}`, nameI18n: { ko: name }, confirmed: true },
      });
    }
    return result;
  },
};

const timelineAutoSyncJointFiringDrillsQuery = graphql(`
  query TimelineAutoSyncJointFiringDrills($endAfter: ISO8601DateTime) {
    jointFiringDrills(endAfter: $endAfter) {
      uid
      season
      drillType
      schedules {
        region
        startAt
        endAt
      }
    }
  }
`);

const jointFiringDrillSource: TimelineAutoSyncSource = {
  contentType: "joint_firing_drill",
  updatePolicy: STARTED_ROWS_UPDATE_POLICY,
  async fetchCandidates(now) {
    const { data, error } = await runQuery(timelineAutoSyncJointFiringDrillsQuery, { endAfter: new Date(now) });
    if (error || !data) {
      throw error ?? new Error("failed to fetch joint firing drills for timeline auto sync");
    }

    const result: TimelineAutoSyncFetchResult = { candidates: [], rejected: [] };
    for (const drill of data.jointFiringDrills) {
      // `endAfter` matches a schedule in any region, so a drill can come back for another region only.
      const schedule = drill.schedules.find((item) => item.region === AUTO_SYNC_REGION);
      if (!schedule) continue;
      const contentEndAt = schedule.endAt ? toUtcIso(schedule.endAt) : null;
      if (contentEndAt !== null && !isInstantAfter(contentEndAt, now)) continue;

      const drillTypeName = drillTypeLocale[drill.drillType];
      if (!drillTypeName) {
        result.rejected.push({ contentUid: drill.uid, reason: `unknown drill type: ${drill.drillType}` });
        continue;
      }

      result.candidates.push({
        contentType: "joint_firing_drill",
        contentUid: drill.uid,
        runType: "first",
        occurrence: null,
        startAt: toUtcIso(schedule.startAt),
        contentEndAt,
        // BAQL lists drills before they are announced, and its `confirmed` is deprecated as not authoritative.
        // A new row stays unconfirmed until an admin confirms it; updates never change `confirmed`.
        create: {
          uid: `jfd-${drill.uid}`,
          nameI18n: { ko: `${drill.season}차: ${drillTypeName}시험` },
          confirmed: false,
        },
      });
    }
    return result;
  },
};

// `endAfter` leaves out a GL schedule without an end, and one that has already ended, so a row for either is reported
// as missing at source; a forecast row still dated in the future is then not corrected.
const timelineAutoSyncRaidSchedulesQuery = graphql(`
  query TimelineAutoSyncRaidSchedules($region: String!, $endAfter: ISO8601DateTime) {
    raidSchedules(region: $region, endAfter: $endAfter) {
      nodes {
        uid
        region
        raidType
        seasonIndex
        startAt
        endAt
        raidBoss {
          name
        }
        jpSchedule {
          raidType
          seasonIndex
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`);

/** Raid types whose missing future rows the sync creates. Rows of other types are only updated. */
const RAID_TYPES_CREATED_BY_SYNC: readonly string[] = ["total_assault", "elimination", "unlimit"];

const raidSource: TimelineAutoSyncSource = {
  contentType: "raid",
  // A GL raid schedule's uid carries a predicted GL season number, so its row is found by the JP season instead.
  updatePolicy: { updateStartedRows: false, keepOwnEndWithoutSourceEnd: true, matchBy: "jpRaidSeason" },
  async fetchCandidates(now) {
    const { data, error } = await runQuery(timelineAutoSyncRaidSchedulesQuery, {
      region: AUTO_SYNC_REGION,
      endAfter: new Date(now),
    });
    if (error || !data) {
      throw error ?? new Error("failed to fetch raid schedules for timeline auto sync");
    }
    // A partial list would report the rest as missing at source.
    if (data.raidSchedules.pageInfo.hasNextPage) {
      throw new Error("BAQL returned only the first page of raid schedules for timeline auto sync");
    }

    const result: TimelineAutoSyncFetchResult = { candidates: [], rejected: [] };
    const jpRaidSeasonReferences: TimelineAutoSyncJpRaidSeasonReference[] = [];
    result.jpRaidSeasonReferences = jpRaidSeasonReferences;
    for (const schedule of data.raidSchedules.nodes) {
      if (schedule.region !== AUTO_SYNC_REGION) continue;
      if (schedule.jpSchedule) {
        jpRaidSeasonReferences.push({
          contentUid: schedule.uid,
          jpRaidSeason: { raidType: schedule.jpSchedule.raidType, seasonIndex: schedule.jpSchedule.seasonIndex },
        });
      }
      if (!schedule.startAt) {
        result.rejected.push({ contentUid: schedule.uid, reason: "raid schedule has no start" });
        continue;
      }
      const startAt = toUtcIso(schedule.startAt);
      // A started schedule still updates its row while that row is dated in the future: BAQL's client data for a GL
      // season can arrive only once the season has started. Only a schedule that starts after now creates a row.
      const bossName = schedule.raidBoss.name.trim();
      const createsRow = RAID_TYPES_CREATED_BY_SYNC.includes(schedule.raidType) && isInstantAfter(startAt, now);
      if (createsRow && !bossName) {
        result.rejected.push({ contentUid: schedule.uid, reason: "raid boss has no name" });
        continue;
      }

      result.candidates.push({
        contentType: "raid",
        contentUid: schedule.uid,
        runType: "first",
        occurrence: null,
        startAt,
        contentEndAt: schedule.endAt ? toUtcIso(schedule.endAt) : null,
        // BAQL lists forecast schedules, so a new row stays unconfirmed until an admin confirms it.
        // The row uid must not carry the GL uid, whose season number is a prediction BAQL may renumber.
        create: createsRow ? { uid: `raid-${nanoid(16)}`, nameI18n: { ko: bossName }, confirmed: false } : null,
        jpRaidSeason: schedule.jpSchedule
          ? { raidType: schedule.jpSchedule.raidType, seasonIndex: schedule.jpSchedule.seasonIndex }
          : null,
        // Kept on the row so screens can show the season number once BAQL no longer lists a forecast GL schedule.
        glRaidSeasonIndex: schedule.seasonIndex,
      });
    }
    return result;
  },
};

const timelineAutoSyncEventContentsQuery = graphql(`
  query TimelineAutoSyncEventContents($uids: [String!]!) {
    eventContents(uids: $uids) {
      uid
      schedules {
        region
        runType
        startAt
        endAt
      }
    }
  }
`);

const eventSource: TimelineAutoSyncSource = {
  contentType: "event",
  async fetchCandidates(now, rows) {
    const result: TimelineAutoSyncFetchResult = { candidates: [], rejected: [] };
    const targets = futureLinkedRows(rows, now, result.rejected);
    if (targets.length === 0) return result;

    const { data, error } = await runQuery(timelineAutoSyncEventContentsQuery, {
      uids: [...new Set(targets.map((row) => row.contentUid))],
    });
    if (error || !data) {
      throw error ?? new Error("failed to fetch event contents for timeline auto sync");
    }

    const eventsByUid = new Map(data.eventContents.map((event) => [event.uid, event]));
    for (const row of targets) {
      const schedules = (eventsByUid.get(row.contentUid)?.schedules ?? [])
        .filter((schedule) => schedule.region === AUTO_SYNC_REGION && schedule.runType === row.runType)
        .sort((a, b) => compareInstants(a.startAt, b.startAt));
      const schedule = selectByOccurrence(schedules, row.occurrence);
      if (!schedule) continue;

      result.candidates.push({
        contentType: "event",
        contentUid: row.contentUid,
        runType: row.runType,
        occurrence: row.occurrence,
        startAt: toUtcIso(schedule.startAt),
        contentEndAt: schedule.endAt ? toUtcIso(schedule.endAt) : null,
        create: null,
      });
    }
    return result;
  },
};

const timelineAutoSyncMiniEventContentsQuery = graphql(`
  query TimelineAutoSyncMiniEventContents {
    miniEventContents {
      uid
      schedules {
        region
        occurrence
        startAt
        endAt
      }
    }
  }
`);

const miniEventSource: TimelineAutoSyncSource = {
  contentType: "mini_event",
  async fetchCandidates(now, rows) {
    const result: TimelineAutoSyncFetchResult = { candidates: [], rejected: [] };
    const targets = futureLinkedRows(rows, now, result.rejected);
    if (targets.length === 0) return result;

    const { data, error } = await runQuery(timelineAutoSyncMiniEventContentsQuery, {});
    if (error || !data) {
      throw error ?? new Error("failed to fetch mini events for timeline auto sync");
    }

    const miniEventsByUid = new Map(data.miniEventContents.map((miniEvent) => [miniEvent.uid, miniEvent]));
    for (const row of targets) {
      const schedules = (miniEventsByUid.get(row.contentUid)?.schedules ?? [])
        .filter((schedule) => schedule.region === AUTO_SYNC_REGION)
        .sort((a, b) => compareInstants(a.startAt, b.startAt));
      // A mini event numbers its own runs, so a row with an occurrence points to that run, as an admin's sync does.
      // A row without one can mean only the mini event's single run; with several, which one it means is unknown.
      if (row.occurrence === null && schedules.length > 1) {
        result.rejected.push({
          contentUid: row.contentUid,
          reason: `row ${row.uid} has no occurrence and the mini event has ${schedules.length} GL runs`,
        });
        continue;
      }
      const schedule =
        row.occurrence !== null
          ? (schedules.find((item) => item.occurrence === row.occurrence) ?? null)
          : (schedules[0] ?? null);
      if (!schedule) continue;

      result.candidates.push({
        contentType: "mini_event",
        contentUid: row.contentUid,
        runType: row.runType,
        occurrence: row.occurrence,
        startAt: toUtcIso(schedule.startAt),
        contentEndAt: toUtcIso(schedule.endAt),
        create: null,
      });
    }
    return result;
  },
};

const timelineAutoSyncMainStoriesQuery = graphql(`
  query TimelineAutoSyncMainStories {
    mainStories {
      chapters {
        parts {
          uid
          schedules {
            region
            releasedAt
          }
        }
      }
    }
  }
`);

const mainStorySource: TimelineAutoSyncSource = {
  contentType: "main_story",
  async fetchCandidates(now, rows) {
    const result: TimelineAutoSyncFetchResult = { candidates: [], rejected: [] };
    const targets = futureLinkedRows(rows, now, result.rejected);
    if (targets.length === 0) return result;

    const { data, error } = await runQuery(timelineAutoSyncMainStoriesQuery, {});
    if (error || !data) {
      throw error ?? new Error("failed to fetch main stories for timeline auto sync");
    }

    const partsByUid = new Map(
      data.mainStories.flatMap((volume) =>
        volume.chapters.flatMap((chapter) => chapter.parts.map((part) => [part.uid, part] as const)),
      ),
    );
    for (const row of targets) {
      const schedules = (partsByUid.get(row.contentUid)?.schedules ?? [])
        .filter((schedule) => schedule.region === AUTO_SYNC_REGION)
        .sort((a, b) => compareInstants(a.releasedAt, b.releasedAt));
      const schedule = selectByOccurrence(schedules, row.occurrence);
      if (!schedule) continue;

      result.candidates.push({
        contentType: "main_story",
        contentUid: row.contentUid,
        runType: row.runType,
        occurrence: row.occurrence,
        startAt: toUtcIso(schedule.releasedAt),
        contentEndAt: "release",
        create: null,
      });
    }
    return result;
  },
};

const timelineAutoSyncMiniStoriesQuery = graphql(`
  query TimelineAutoSyncMiniStories {
    miniStories {
      uid
      schedules {
        region
        releasedAt
      }
    }
  }
`);

const miniStorySource: TimelineAutoSyncSource = {
  contentType: "mini_story",
  async fetchCandidates(now, rows) {
    const result: TimelineAutoSyncFetchResult = { candidates: [], rejected: [] };
    const targets = futureLinkedRows(rows, now, result.rejected);
    if (targets.length === 0) return result;

    const { data, error } = await runQuery(timelineAutoSyncMiniStoriesQuery, {});
    if (error || !data) {
      throw error ?? new Error("failed to fetch mini stories for timeline auto sync");
    }

    const storiesByUid = new Map(data.miniStories.map((story) => [story.uid, story]));
    for (const row of targets) {
      const schedules = (storiesByUid.get(row.contentUid)?.schedules ?? [])
        .filter((schedule) => schedule.region === AUTO_SYNC_REGION)
        .sort((a, b) => compareInstants(a.releasedAt, b.releasedAt));
      const schedule = selectByOccurrence(schedules, row.occurrence);
      if (!schedule) continue;

      result.candidates.push({
        contentType: "mini_story",
        contentUid: row.contentUid,
        runType: row.runType,
        occurrence: row.occurrence,
        startAt: toUtcIso(schedule.releasedAt),
        contentEndAt: "release",
        create: null,
      });
    }
    return result;
  },
};

const TIMELINE_AUTO_SYNC_SOURCES: readonly TimelineAutoSyncSource[] = [
  campaignSource,
  jointFiringDrillSource,
  raidSource,
  eventSource,
  miniEventSource,
  mainStorySource,
  miniStorySource,
];

export async function syncTimelineContentsFromSources(
  env: Env,
  ctx?: ExecutionContext,
  sources: readonly TimelineAutoSyncSource[] = TIMELINE_AUTO_SYNC_SOURCES,
): Promise<void> {
  const logger = getLogger(env, ctx, { job: "timeline-auto-sync" });
  const now = toUtcIso(new Date());
  const errors: unknown[] = [];

  for (const source of sources) {
    try {
      const rowsOfType = await getPostgresTimelineAutoSyncRows(env, source.contentType, [], { ctx });
      const { candidates, rejected, jpRaidSeasonReferences } = await source.fetchCandidates(now, rowsOfType);

      // A new row's uid may be held by a row of another content type.
      const knownUids = new Set(rowsOfType.map((row) => row.uid));
      const newUids = candidates.flatMap((candidate) =>
        candidate.create && !knownUids.has(candidate.create.uid) ? [candidate.create.uid] : [],
      );
      const uidHolders =
        newUids.length > 0
          ? (await getPostgresTimelineAutoSyncRows(env, source.contentType, newUids, { ctx })).filter(
              (row) => !knownUids.has(row.uid),
            )
          : [];

      const plan = planTimelineAutoSync(
        source.contentType,
        candidates,
        [...rowsOfType, ...uidHolders],
        now,
        source.updatePolicy,
        jpRaidSeasonReferences,
      );
      const { createdUids, updatedUids, creationBlockedByUids } = await applyPostgresTimelineAutoSyncPlan(
        env,
        plan,
        now,
        { ctx },
      );
      const notWritten = (planned: readonly string[], written: readonly string[]) =>
        planned.filter((uid) => !written.includes(uid));

      logger.info("Timeline auto sync completed", {
        contentType: source.contentType,
        created: createdUids,
        updated: updatedUids,
        // Rows an admin added or changed after the read; the write left them as they were.
        createsSkippedAtWrite: notWritten(
          plan.creates.map((row) => row.uid),
          createdUids,
        ),
        updatesSkippedAtWrite: notWritten(
          plan.updates.map((row) => row.uid),
          updatedUids,
        ),
        conflicts: plan.conflictUids,
        duplicates: plan.duplicateUids,
        missingAtSource: plan.missingUids,
        withoutJpRaidSchedule: plan.withoutJpRaidSeasonContentUids,
        // Rows found at the read, and rows the write found again (or an admin added) before it would create rows.
        unlinkedRows: [...new Set([...plan.unlinkedUids, ...creationBlockedByUids])],
        ambiguousJpRaidSeason: plan.ambiguousJpRaidSeasonContentUids,
      });

      if (rejected.length > 0) {
        const rejectedError = new Error(
          `${source.contentType}: ${rejected.map((r) => `${r.contentUid} (${r.reason})`).join(", ")}`,
        );
        logger.error("Timeline auto sync rejected source items", rejectedError, { contentType: source.contentType });
        errors.push(rejectedError);
      }
    } catch (error) {
      // Log here because the logging serializer drops AggregateError.errors.
      logger.error("Timeline auto sync source failed", error, { contentType: source.contentType });
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more timeline auto sync sources failed");
  }
}
