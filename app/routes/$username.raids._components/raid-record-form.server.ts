import { data, redirect } from "react-router";
import type {
  RaidRecordFormActionData,
  RaidRecordFormErrorField,
} from "~/components/v2/features/raid-records/RaidRecordForm";
import {
  InvalidRaidRecordError,
  isRaidRecordRaidType,
  isRaidRecordServer,
  isRaidSeasonStarted,
  normalizeRaidRecordMemo,
  normalizeRaidRecordScores,
  parseRaidRecordParties,
  parseRaidRecordRank,
  parseRaidRecordScoreMode,
  parseRaidRecordTotalScore,
  type RaidRecord,
  type RaidRecordDefenseType,
  type RaidRecordScoreInput,
} from "~/domain/raid-record";
import { nowUtcIso } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import {
  createRaidRecord,
  deleteRaidRecord,
  getRaidRecordSeasons,
  getRaidRecordStudentInfo,
  RaidRecordScoreAboveMaxError,
  RaidRecordSeasonConflictError,
  RaidRecordTotalScoreAboveMaxError,
  raidRecordSeasonRules,
  updateRaidRecord,
} from "~/models/raid-record";
import { raidRecordListTo } from "./raid-record-list-query";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(
  field: RaidRecordFormErrorField,
  message: string,
  status = 400,
  defenseType?: RaidRecordDefenseType,
) {
  return data({ ok: false, error: { field, message, defenseType } } satisfies RaidRecordFormActionData, { status });
}

// Runs one parsing step and names the field a rule error belongs to.
function parseField<T>(field: RaidRecordFormErrorField, parse: () => T): { value: T } | { error: ReturnType<typeof failure> } {
  try {
    return { value: parse() };
  } catch (error) {
    if (error instanceof InvalidRaidRecordError) return { error: failure(field, error.message) };
    throw error;
  }
}

export function raidRecordListPath(username: string, record: Pick<RaidRecord, "server">) {
  return raidRecordListTo(username, record.server);
}

// The add and edit form's action. `existing` is the record an edit opened; a new record has none.
export async function handleRaidRecordFormAction({
  env,
  ctx,
  request,
  userId,
  username,
  existing,
}: {
  env: Env;
  ctx: ExecutionContext;
  request: Request;
  userId: number;
  username: string;
  existing: RaidRecord | null;
}) {
  const logger = getLogger(env, ctx, { route: "$username.raids.form" });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("form", "요청을 확인하지 못했어요.");
  }
  if (!isObject(body)) return failure("form", "요청을 확인하지 못했어요.");

  if (body.intent === "delete") {
    if (!existing) return failure("form", "요청을 확인하지 못했어요.");
    try {
      await deleteRaidRecord(env, userId, existing.uid, { ctx });
    } catch (error) {
      logger.error("Raid record delete failed", error, { uid: existing.uid });
      return failure("form", "기록을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.", 500);
    }
    return redirect(raidRecordListPath(username, existing));
  }
  if (body.intent !== "save") return failure("form", "요청을 확인하지 못했어요.");

  const { server, raidType, seasonIndex } = body;
  if (!isRaidRecordServer(server) || !isRaidRecordRaidType(raidType) || typeof seasonIndex !== "number") {
    return failure("season", "시즌을 골라 주세요.");
  }
  if (
    existing &&
    (existing.server !== server || existing.raidType !== raidType || existing.seasonIndex !== seasonIndex)
  ) {
    return failure("season", "기록의 서버와 시즌은 바꿀 수 없어요.");
  }

  const seasons = await getRaidRecordSeasons(env, server);
  const season = seasons.find((candidate) => candidate.raidType === raidType && candidate.seasonIndex === seasonIndex);
  if (!season || !isRaidSeasonStarted(season, nowUtcIso())) {
    return failure("season", "기록할 수 있는 시즌이 아니에요.");
  }
  const rules = raidRecordSeasonRules(season);

  // The scores and the total are both kept, whichever the record shows; only the shown one is required.
  const scoreMode = parseField("score", () => parseRaidRecordScoreMode(body.scoreMode, raidType));
  if ("error" in scoreMode) return scoreMode.error;
  const scores = parseField("score", () =>
    normalizeRaidRecordScores(Array.isArray(body.scores) ? (body.scores as RaidRecordScoreInput[]) : [], rules),
  );
  if ("error" in scores) return scores.error;
  const totalScore = parseField("totalScore", () => parseRaidRecordTotalScore(body.totalScore));
  if ("error" in totalScore) return totalScore.error;
  if (raidType !== "elimination" && totalScore.value !== null) {
    return failure("totalScore", "합산 점수는 대결전 기록에만 입력할 수 있어요.");
  }
  if (scoreMode.value === "total" && totalScore.value === null) {
    return failure("totalScore", "합산 점수를 입력해 주세요.");
  }
  if (scoreMode.value === "defense_type" && scores.value.length === 0) {
    return failure("score", raidType === "elimination" ? "방어 타입 점수를 하나 이상 입력해 주세요." : "점수를 입력해 주세요.");
  }
  const rank = parseField("rank", () => parseRaidRecordRank(body.rank));
  if ("error" in rank) return rank.error;
  if (rank.value === null) return failure("rank", "순위를 입력해 주세요.");
  const memo = parseField("memo", () => normalizeRaidRecordMemo(body.memo));
  if ("error" in memo) return memo.error;

  let studentInfo: Awaited<ReturnType<typeof getRaidRecordStudentInfo>>;
  try {
    studentInfo = await getRaidRecordStudentInfo(env, body.parties);
  } catch (error) {
    logger.error("Raid record student catalog failed", error);
    return failure("form", "학생 정보를 불러오지 못해 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", 503);
  }
  const parties = parseField("parties", () => parseRaidRecordParties(body.parties, rules, studentInfo));
  if ("error" in parties) return parties.error;

  const values = {
    scoreMode: scoreMode.value,
    scores: scores.value,
    totalScore: totalScore.value,
    rank: rank.value,
    memo: memo.value,
    parties: parties.value,
  };
  try {
    if (existing) {
      const updated = await updateRaidRecord(env, userId, existing.uid, season, values, { ctx });
      if (!updated) return failure("form", "기록을 찾을 수 없어요. 목록에서 다시 열어 주세요.", 404);
    } else {
      await createRaidRecord(env, userId, season, values, { ctx });
    }
  } catch (error) {
    if (error instanceof RaidRecordScoreAboveMaxError) return failure("score", error.message, 400, error.defenseType);
    if (error instanceof RaidRecordTotalScoreAboveMaxError) return failure("totalScore", error.message);
    if (error instanceof RaidRecordSeasonConflictError) return failure("season", error.message, 409);
    if (error instanceof InvalidRaidRecordError) return failure("form", error.message);
    logger.error("Raid record save failed", error, { server, raidType, seasonIndex });
    return failure("form", "저장하지 못했어요. 잠시 후 다시 시도해 주세요.", 500);
  }
  return redirect(raidRecordListPath(username, { server }));
}
