import { applyPostgresTimelineAutoSyncPlan, getPostgresTimelineAutoSyncRows } from "~/db/postgres/timeline-contents";
import { planTimelineAutoSync, type TimelineAutoSyncCandidate } from "~/domain/timeline-auto-sync";
import type { TimelineContentType } from "~/domain/timeline-content";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { toUtcIso, type UtcIsoString } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import { campaignCategoryLocale } from "~/locales/ko";

const AUTO_SYNC_REGION = "gl";

type TimelineAutoSyncFetchResult = {
  candidates: TimelineAutoSyncCandidate[];
  /** Source items that cannot become a row. The valid ones still sync, then the run fails to surface these. */
  rejected: Array<{ contentUid: string; reason: string }>;
};

/** A content type whose schedule is reliable enough to write to the timeline without review. */
export type TimelineAutoSyncSource = {
  contentType: TimelineContentType;
  fetchCandidates(now: UtcIsoString): Promise<TimelineAutoSyncFetchResult>;
};

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
        uid: `campaign-${campaign.uid}`,
        contentType: "campaign",
        contentUid: campaign.uid,
        runType: "first",
        occurrence: null,
        nameI18n: { ko: name },
        startAt: toUtcIso(campaign.startAt),
        contentEndAt: toUtcIso(campaign.endAt),
        // BAQL lists only confirmed campaigns.
        confirmed: true,
      });
    }
    return result;
  },
};

const TIMELINE_AUTO_SYNC_SOURCES: readonly TimelineAutoSyncSource[] = [campaignSource];

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
      const { candidates, rejected } = await source.fetchCandidates(now);
      const existingRows = await getPostgresTimelineAutoSyncRows(
        env,
        source.contentType,
        candidates.map((candidate) => candidate.uid),
        now,
        { ctx },
      );
      const plan = planTimelineAutoSync(source.contentType, candidates, existingRows, now);
      await applyPostgresTimelineAutoSyncPlan(env, plan, now, { ctx });

      logger.info("Timeline auto sync completed", {
        contentType: source.contentType,
        created: plan.creates.map((row) => row.uid),
        updated: plan.updates.map((row) => row.uid),
        conflicts: plan.conflictUids,
        missingAtSource: plan.missingUids,
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
