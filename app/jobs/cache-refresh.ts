import type { CacheRefreshTaskName, CacheRefreshTaskResult } from "~/domain/cache-refresh";
import { getLogger } from "~/lib/observability.server";
import { syncEventContentsList } from "~/models/event-content";
import { getStudentGearData } from "~/models/growth-resource";
import { getItemCatalogResources } from "~/models/item-catalog";
import { getMainStories } from "~/models/main-story";
import { warmRaidCache } from "~/models/raid";
import { warmRecruitmentCache } from "~/models/recruitment";
import { getAllStudentsFavoriteItems } from "~/models/resource";
import { getCampaignFarmingStages } from "~/models/stage";
import { getAllStudents, getStudentSkillItemsBatch, syncRawStudents } from "~/models/student";
import { syncAllTimelineContentsMeta } from "~/models/timeline-content.server";
import { syncYoutubeCommunityPosts } from "~/models/youtube";
import { getEventList, warmActiveUpcomingEventContent } from "~/views/events";
import { getFutureContents } from "~/views/futures";
import { getIndexContents } from "~/views/home";
import { getNavigationBarContentsRaw } from "~/views/navigation";

const SAFE_TASK_ERROR = "작업을 완료하지 못했어요. 로그에서 job ID를 확인해주세요.";

async function executeCacheRefreshTask(env: Env, ctx: ExecutionContext, name: CacheRefreshTaskName): Promise<void> {
  switch (name) {
    case "syncYoutubeCommunityPosts":
      await syncYoutubeCommunityPosts(env, ctx);
      return;
    case "syncRawStudents":
      await syncRawStudents(env);
      return;
    case "warmRecruitmentCache":
      await warmRecruitmentCache(env);
      return;
    case "warmRaidCache":
      await warmRaidCache(env);
      return;
    case "getMainStories":
      await getMainStories(env, true);
      return;
    case "getAllStudentsFavoriteItems":
      await getAllStudentsFavoriteItems(env, true);
      return;
    case "syncAllTimelineContentsMeta":
      await syncAllTimelineContentsMeta(env, true, { ctx });
      return;
    case "syncEventContentsList":
      await syncEventContentsList(env);
      return;
    case "warmStudentSkillItems": {
      const studentUids = (await getAllStudents(env, true)).map((student) => student.uid);
      await getStudentSkillItemsBatch(env, studentUids, true);
      return;
    }
    case "warmStudentGearData": {
      const studentUids = (await getAllStudents(env, true)).map((student) => student.uid);
      await getStudentGearData(env, studentUids, true);
      return;
    }
    case "warmActiveUpcomingEventContent":
      await warmActiveUpcomingEventContent(env, true, ctx);
      return;
    case "getItemCatalogResources":
      await getItemCatalogResources(env, true);
      return;
    case "getCampaignFarmingStages":
      await getCampaignFarmingStages(env, true);
      return;
    case "getEventList":
      await getEventList(env, undefined, true, ctx);
      return;
    case "getIndexContents":
      await getIndexContents(env, true, ctx);
      return;
    case "getFutureContents":
      await getFutureContents(env, true, ctx);
      return;
    case "getNavigationBarContentsRaw":
      await getNavigationBarContentsRaw(env, true, ctx);
      return;
  }

  return;
}

export async function runCacheRefreshTask(
  env: Env,
  ctx: ExecutionContext,
  jobUid: string,
  name: CacheRefreshTaskName,
): Promise<CacheRefreshTaskResult> {
  const startedAt = Date.now();
  const logger = getLogger(env, ctx, { job: "cache-refresh", jobUid, taskName: name });

  try {
    await executeCacheRefreshTask(env, ctx, name);
    const durationMs = Date.now() - startedAt;
    logger.info("Cache refresh task completed", { durationMs });
    return { status: "succeeded", durationMs, error: null };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.error("Cache refresh task failed", error, { durationMs });
    return { status: "failed", durationMs, error: SAFE_TASK_ERROR };
  }
}
