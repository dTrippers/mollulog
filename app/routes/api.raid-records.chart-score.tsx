import { type ActionFunctionArgs, data } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  InvalidRaidRecordError,
  isRaidRecordDefenseType,
  isRaidRecordRaidType,
  isRaidRecordServer,
  isRaidSeasonStarted,
  parseRaidRecordScore,
} from "~/domain/raid-record";
import { nowUtcIso } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import { applyRaidRecordChartScore, getRaidRecordSeasons } from "~/models/raid-record";
import { type RaidChartRecordView, toRaidChartRecordView } from "~/views/raid-records";

export type RaidChartScoreActionData =
  | { ok: true; record: RaidChartRecordView | null }
  | { ok: false; message: string };

function failure(message: string, status: number) {
  return data({ ok: false, message } satisfies RaidChartScoreActionData, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The season chart's "내 점수" autosave: one defense type's score of the signed-in Sensei's record of a season.
export async function action({ request, context }: ActionFunctionArgs) {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "api.raid-records.chart-score" });
  if (request.method !== "POST") return failure("요청을 확인하지 못했어요.", 405);
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) return failure("로그인이 필요해요.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("요청을 확인하지 못했어요.", 400);
  }
  if (!isObject(body)) return failure("요청을 확인하지 못했어요.", 400);
  const { server, raidType, seasonIndex, defenseType } = body;
  if (
    !isRaidRecordServer(server) ||
    !isRaidRecordRaidType(raidType) ||
    typeof seasonIndex !== "number" ||
    !isRaidRecordDefenseType(defenseType)
  ) {
    return failure("요청을 확인하지 못했어요.", 400);
  }

  let score: number | null;
  try {
    score = parseRaidRecordScore(body.score);
  } catch (error) {
    if (error instanceof InvalidRaidRecordError) return failure(error.message, 400);
    throw error;
  }

  const seasons = await getRaidRecordSeasons(env, server);
  const season = seasons.find((entry) => entry.raidType === raidType && entry.seasonIndex === seasonIndex);
  if (!season || !isRaidSeasonStarted(season, nowUtcIso())) {
    return failure("기록할 수 있는 시즌이 아니에요.", 400);
  }

  try {
    const result = await applyRaidRecordChartScore(env, sensei.id, season, defenseType, score, { ctx });
    const record = result.kind === "deleted" ? null : result.record;
    return data({ ok: true, record: record ? toRaidChartRecordView(record, season) : null } satisfies RaidChartScoreActionData);
  } catch (error) {
    if (error instanceof InvalidRaidRecordError) return failure(error.message, 400);
    logger.error("Raid record chart score save failed", error, { server, raidType, seasonIndex, defenseType });
    return failure("저장하지 못했어요.", 500);
  }
}
