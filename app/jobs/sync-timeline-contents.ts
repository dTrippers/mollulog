import dayjs from "dayjs";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { getLogger } from "~/lib/observability.server";
import { upsertTimelineContent } from "~/models/timeline-content";
import type { RunType, TimelineContentType } from "~/models/timeline-content";

// ============================================================
// Campaign
// ============================================================

/**
 * Step 1: List query — fetches uid for campaigns whose endAt is after the given date.
 * The server-side `endAfter` filter eliminates the need for local date comparison.
 */
const campaignsListQuery = graphql(`
  query CampaignsList($endAfter: ISO8601DateTime!) {
    campaigns(region: "gl", endAfter: $endAfter) { uid }
  }
`);

/**
 * Step 2: Detail query — fetches full campaign data for a single uid.
 * Called for each campaign that passes the future filter.
 */
const campaignDetailQuery = graphql(`
  query CampaignDetail($uid: String!) {
    campaign(uid: $uid) { uid startAt endAt category multiplier }
  }
`);

/**
 * Syncs campaign data from BAQL into the timeline_contents D1 table.
 *
 * Flow:
 * 1. Query `campaigns(endAfter: now)` (list) to get uids of campaigns ending in the future.
 *    The server-side filter handles date comparison — no local filtering needed.
 * 2. For each returned uid, query `campaign(uid:)` to get full details.
 * 3. Upsert each campaign into timeline_contents:
 *    - On uid conflict: update startAt, endAt, updatedAt.
 *    - On new uid: insert with contentType="campaign", runType="first".
 */
async function syncCampaigns(env: Env, ctx?: ExecutionContext): Promise<void> {
  const logger = getLogger(env, ctx, {
    job: "sync-timeline-contents",
    contentType: "campaign",
  });
  // Step 1: Fetch campaign list filtered by endAfter=now
  const { data: listData, error: listError } = await runQuery(campaignsListQuery, { endAfter: new Date() });
  if (listError || !listData?.campaigns) {
    logger.error("Failed to fetch campaigns list", listError);
    return;
  }

  logger.info("Found future campaigns", {
    count: listData.campaigns.length,
  });

  // Step 2 & 3: Fetch details and upsert
  await Promise.all(
    listData.campaigns.map(async (campaign) => {
      const { data: detailData, error: detailError } = await runQuery(campaignDetailQuery, { uid: campaign.uid });
      if (detailError || !detailData?.campaign) {
        logger.error("Failed to fetch campaign detail", detailError, {
          uid: campaign.uid,
        });
        return;
      }

      const detail = detailData.campaign;

      await upsertTimelineContent(env, {
        uid: `campaign-${detail.uid}`,
        startAt: dayjs(detail.startAt).toDate(),
        endAt: dayjs(detail.endAt).toDate(),
        endless: false,
        imageUrl: null,
        videos: [],
        contentType: "campaign",
        runType: "first",
        occurrence: null,
        contentUid: detail.uid,
        recruitmentGroupUid: null,
        confirmed: true,
        tags: [],
      });
    }),
  );
}

// ============================================================
// Joint Firing Drills (종합전술시험)
// ============================================================

/**
 * Step 1: List query — fetches uid for drills whose endAt is after the given date.
 */
const jointFiringDrillsListQuery = graphql(`
  query JointFiringDrillsList($endAfter: ISO8601DateTime!) {
    jointFiringDrills(endAfter: $endAfter) { uid }
  }
`);

/**
 * Step 2: Detail query — fetches full drill data for a single uid.
 */
const jointFiringDrillDetailQuery = graphql(`
  query JointFiringDrillDetail($uid: String!) {
    jointFiringDrill(uid: $uid) {
      uid season drillType confirmed
      schedules { region startAt endAt }
    }
  }
`);

/**
 * Syncs joint firing drill data from BAQL into the timeline_contents D1 table.
 *
 * Flow:
 * 1. Query `jointFiringDrills(endAfter: now)` (list) to get uids of drills ending in the future.
 * 2. For each returned uid, query `jointFiringDrill(uid:)` to get full details.
 * 3. Pick the "gl" region schedule for startAt/endAt.
 * 4. Upsert each drill into timeline_contents:
 *    - contentType = "joint_firing_drill", runType = "first".
 *    - confirmed is taken directly from the BAQL response.
 *    - Name is derived at runtime from BAQL (season + drillType), not stored.
 */
async function syncJointFiringDrills(env: Env, ctx?: ExecutionContext): Promise<void> {
  const logger = getLogger(env, ctx, {
    job: "sync-timeline-contents",
    contentType: "joint-firing-drill",
  });
  const { data: listData, error: listError } = await runQuery(jointFiringDrillsListQuery, { endAfter: new Date() });
  if (listError || !listData?.jointFiringDrills) {
    logger.error("Failed to fetch joint firing drills list", listError);
    return;
  }

  logger.info("Found future joint firing drills", {
    count: listData.jointFiringDrills.length,
  });

  await Promise.all(
    listData.jointFiringDrills.map(async (drill) => {
      const { data: detailData, error: detailError } = await runQuery(jointFiringDrillDetailQuery, { uid: drill.uid });
      if (detailError || !detailData?.jointFiringDrill) {
        logger.error("Failed to fetch drill detail", detailError, {
          uid: drill.uid,
        });
        return;
      }

      const detail = detailData.jointFiringDrill;
      const glSchedule = detail.schedules.find((s) => s.region === "gl");
      if (!glSchedule) {
        logger.warn("No gl schedule for drill, skipping", {
          uid: detail.uid,
        });
        return;
      }

      await upsertTimelineContent(env, {
        uid: `joint-firing-drill-${detail.uid}`,
        startAt: dayjs(glSchedule.startAt).toDate(),
        endAt: glSchedule.endAt ? dayjs(glSchedule.endAt).toDate() : null,
        endless: false,
        imageUrl: null,
        videos: [],
        contentType: "joint_firing_drill",
        runType: "first",
        occurrence: null,
        contentUid: detail.uid,
        recruitmentGroupUid: null,
        confirmed: detail.confirmed,
        tags: [],
      });
    }),
  );
}

// ============================================================
// Raids
// ============================================================

/**
 * Step 1: List query — fetches uid for raids whose endAt is after the given date.
 */
const raidsListQuery = graphql(`
  query RaidsList($endAfter: ISO8601DateTime!) {
    raids(endAfter: $endAfter) { nodes { uid } }
  }
`);

/**
 * Step 2: Detail query — fetches full raid data for a single uid.
 * Called for each raid that passes the future filter.
 */
const raidDetailSyncQuery = graphql(`
  query RaidDetailSync($uid: String!) {
    raid(uid: $uid) {
      uid type boss startAt endAt terrain attackType confirmed
      defenseTypes { defenseType difficulty }
      rankVisible
    }
  }
`);

/**
 * Syncs raid data from BAQL into the timeline_contents D1 table.
 *
 * Flow:
 * 1. Query `raids(endAfter: now)` (list) to get uids of raids ending in the future.
 * 2. For each returned uid, query `raid(uid:)` to get full details.
 * 3. Upsert each raid into timeline_contents:
 *    - contentType is mapped from raid.type (total_assault / elimination / unlimit).
 *    - confirmed is taken directly from the BAQL response.
 *    - Name is derived at runtime from BAQL (raid.name), not stored.
 */
async function syncRaids(env: Env, ctx?: ExecutionContext): Promise<void> {
  const logger = getLogger(env, ctx, {
    job: "sync-timeline-contents",
    contentType: "raid",
  });
  // Step 1: Fetch raid list filtered by endAfter=now
  const { data: listData, error: listError } = await runQuery(raidsListQuery, {
    endAfter: new Date(),
  });
  if (listError || !listData?.raids) {
    logger.error("Failed to fetch raids list", listError);
    return;
  }

  logger.info("Found future raids", {
    count: listData.raids.nodes.length,
  });

  // Step 2 & 3: Fetch details and upsert
  await Promise.all(
    listData.raids.nodes.map(async (raid) => {
      const { data: detailData, error: detailError } = await runQuery(raidDetailSyncQuery, { uid: raid.uid });
      if (detailError || !detailData?.raid) {
        logger.error("Failed to fetch raid detail", detailError, {
          uid: raid.uid,
        });
        return;
      }

      const detail = detailData.raid;

      await upsertTimelineContent(env, {
        uid: `raid-${detail.uid}`,
        startAt: dayjs(detail.startAt).toDate(),
        endAt: dayjs(detail.endAt).toDate(),
        endless: false,
        imageUrl: null,
        videos: [],
        contentType: detail.type as "total_assault" | "elimination" | "unlimit",
        runType: "first",
        occurrence: null,
        contentUid: detail.uid,
        recruitmentGroupUid: null,
        confirmed: detail.confirmed,
        tags: [],
      });
    }),
  );
}

// ============================================================
// Mini Events (미니 이벤트)
// ============================================================

/**
 * Step 1: List query — fetches uid for mini events whose endAt is after the given date.
 */
const miniEventContentsListQuery = graphql(`
  query MiniEventContentsList($endAfter: ISO8601DateTime!) {
    miniEventContents(endAfter: $endAfter, region: "gl") { uid }
  }
`);

/**
 * Step 2: Detail query — fetches full mini event data for a single uid.
 */
const miniEventContentDetailQuery = graphql(`
  query MiniEventContentDetail($uid: String!) {
    miniEventContent(uid: $uid) {
      uid name
      schedules { region startAt endAt occurrence }
    }
  }
`);

/**
 * Syncs mini event data from BAQL into the timeline_contents D1 table.
 *
 * Flow:
 * 1. Query `miniEventContents(endAfter: now, region: "gl")` to get uids of mini events ending in the future.
 * 2. For each returned uid, query `miniEventContent(uid:)` to get full details.
 * 3. Pick the "gl" region schedule for startAt/endAt.
 * 4. Upsert each mini event into timeline_contents:
 *    - contentType = "mini_event", runType = "first".
 *    - Name is derived at runtime from BAQL (miniEventContent.name), not stored.
 */
async function syncMiniEvents(env: Env, ctx?: ExecutionContext): Promise<void> {
  const logger = getLogger(env, ctx, {
    job: "sync-timeline-contents",
    contentType: "mini-event",
  });
  const { data: listData, error: listError } = await runQuery(miniEventContentsListQuery, { endAfter: new Date() });
  if (listError || !listData?.miniEventContents) {
    logger.error("Failed to fetch mini event contents list", listError);
    return;
  }

  logger.info("Found future mini events", {
    count: listData.miniEventContents.length,
  });

  await Promise.all(
    listData.miniEventContents.map(async (miniEvent) => {
      const { data: detailData, error: detailError } = await runQuery(miniEventContentDetailQuery, {
        uid: miniEvent.uid,
      });
      if (detailError || !detailData?.miniEventContent) {
        logger.error("Failed to fetch mini event detail", detailError, {
          uid: miniEvent.uid,
        });
        return;
      }

      const detail = detailData.miniEventContent;
      const now = new Date();

      // Each occurrence of the same mini event is a separate timeline row.
      const futureGlSchedules = detail.schedules.filter(
        (s) => s.region === "gl" && (!s.endAt || dayjs(s.endAt).isAfter(now)),
      );

      if (futureGlSchedules.length === 0) {
        logger.warn("No future gl schedules for mini event, skipping", {
          uid: detail.uid,
        });
        return;
      }

      await Promise.all(
        futureGlSchedules.map((schedule) =>
          upsertTimelineContent(env, {
            uid: `mini-event-${detail.uid}-occ${schedule.occurrence}`,
            startAt: dayjs(schedule.startAt).toDate(),
            endAt: schedule.endAt ? dayjs(schedule.endAt).toDate() : null,
            endless: false,
            imageUrl: null,
            videos: [],
            contentType: "mini_event",
            runType: "first",
            occurrence: schedule.occurrence,
            contentUid: detail.uid,
            recruitmentGroupUid: null,
            confirmed: false,
            tags: [],
          }),
        ),
      );
    }),
  );
}

// ============================================================
// Events (이벤트)
// ============================================================

/**
 * Step 1: List query — fetches future recruitment groups to discover events.
 * RecruitmentGroups link to EventContent via contentUid.
 */
const eventRecruitmentGroupsListQuery = graphql(`
  query EventRecruitmentGroupsForSync($endAfter: ISO8601DateTime!) {
    recruitmentGroups(endAfter: $endAfter) {
      uid contentType contentUid startAt endAt recruitmentType
    }
  }
`);

/**
 * Step 2: Detail query — fetches event name from EventContent.
 */
const eventContentForSyncQuery = graphql(`
  query EventContentForSync($uid: String!) {
    eventContent(uid: $uid) {
      uid
      schedules { region runType startAt endAt }
    }
  }
`);

/**
 * Syncs event data from BAQL into the timeline_contents D1 table.
 *
 * Flow:
 * 1. Query `recruitmentGroups(endAfter: now)` to get future recruitment groups.
 *    Each group has contentType (event type) and contentUid (EventContent uid).
 * 2. For each unique contentUid, query `eventContent(uid:)` for name and schedules.
 * 3. Upsert each event (per runType/region schedule) into timeline_contents.
 *    - uid: `{recruitmentGroup.uid}` (so pickup_histories.eventId can reference it)
 *    - contentUid: EventContent uid
 *    - recruitmentGroupUid: RecruitmentGroup uid
 */
async function syncEvents(env: Env, ctx?: ExecutionContext): Promise<void> {
  const logger = getLogger(env, ctx, {
    job: "sync-timeline-contents",
    contentType: "event",
  });
  const { data: listData, error: listError } = await runQuery(eventRecruitmentGroupsListQuery, {
    endAfter: new Date(),
  });
  if (listError || !listData?.recruitmentGroups) {
    logger.error("Failed to fetch event recruitment groups list", listError);
    return;
  }

  // Filter to supported content types only
  const eventContentTypes = ["event", "main_story", "pickup"];
  const eventGroups = listData.recruitmentGroups.filter((g) => eventContentTypes.includes(g.contentType ?? ""));

  logger.info("Found future event recruitment groups", {
    count: eventGroups.length,
  });

  await Promise.all(
    eventGroups.map(async (group) => {
      // For pickup-type groups without a contentUid, store directly
      if (!group.contentUid) {
        await upsertTimelineContent(env, {
          uid: group.uid,
          startAt: dayjs(group.startAt).toDate(),
          endAt: group.endAt ? dayjs(group.endAt).toDate() : null,
          endless: false,
          imageUrl: null,
          videos: [],
          contentType: (group.contentType ?? "pickup") as TimelineContentType,
          runType: "first",
          occurrence: null,
          contentUid: null,
          recruitmentGroupUid: group.uid,
          confirmed: false,
          tags: [],
        });
        return;
      }

      const { data: detailData, error: detailError } = await runQuery(eventContentForSyncQuery, {
        uid: group.contentUid,
      });
      if (detailError || !detailData?.eventContent) {
        logger.error("Failed to fetch event content", detailError, {
          uid: group.contentUid,
        });
        return;
      }

      const detail = detailData.eventContent;

      // Use gl schedule if available, otherwise fall back to group dates
      const glSchedule = detail.schedules.find((s) => s.region === "gl");
      const startAt = glSchedule ? dayjs(glSchedule.startAt).toDate() : dayjs(group.startAt).toDate();
      const endAt = glSchedule?.endAt
        ? dayjs(glSchedule.endAt).toDate()
        : group.endAt
          ? dayjs(group.endAt).toDate()
          : null;
      const runType = (glSchedule?.runType ?? "first") as RunType;
      const confirmed = false;

      await upsertTimelineContent(env, {
        uid: group.uid,
        startAt,
        endAt,
        endless: false,
        imageUrl: null,
        videos: [],
        contentType: (group.contentType ?? "event") as TimelineContentType,
        runType,
        occurrence: null,
        contentUid: group.contentUid,
        recruitmentGroupUid: group.uid,
        confirmed,
        tags: [],
      });
    }),
  );
}

// ============================================================
// Entry point — add new content type sync functions here
// ============================================================

/**
 * Syncs all supported content types from BAQL into the timeline_contents D1 table.
 * Add a new `sync*` function above and call it here as new content types are supported.
 */
export async function syncTimelineContents(env: Env, ctx?: ExecutionContext): Promise<void> {
  await Promise.all([
    syncCampaigns(env, ctx),
    syncJointFiringDrills(env, ctx),
    syncRaids(env, ctx),
    syncMiniEvents(env, ctx),
    syncEvents(env, ctx),
  ]);
}
