import { data, redirect } from "react-router";
import type {
  RaidRecordTableActionData,
  RaidRecordTableRowError,
} from "~/components/v2/features/raid-records/RaidRecordTable";
import {
  InvalidRaidRecordError,
  isRaidRecordRaidType,
  isRaidRecordServer,
  isRaidSeasonStarted,
  normalizeRaidRecordScores,
  parseRaidRecordRank,
  type RaidRecordScoreInput,
} from "~/domain/raid-record";
import { nowUtcIso } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import {
  getRaidRecordSeasons,
  listRaidRecords,
  RaidRecordBatchStaleError,
  RaidRecordTableScoresAboveMaxError,
  type RaidRecordTableRowInput,
  raidRecordSeasonRules,
  saveRaidRecordTable,
} from "~/models/raid-record";
import { raidRecordListPath } from "./raid-record-form.server";

// More rows than there are started seasons of one raid type is never a real table.
const MAX_ROWS = 300;
const STALE_MESSAGE = "다른 곳에서 기록이 바뀌었어요. 새로고침한 뒤 다시 입력해 주세요.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(message: string | null, rowErrors: RaidRecordTableRowError[] = [], status = 400) {
  return data({ ok: false, message, rowErrors } satisfies RaidRecordTableActionData, { status });
}

// The table screen's action: every changed row in one save, or none.
export async function handleRaidRecordTableAction({
  env,
  ctx,
  request,
  userId,
  username,
}: {
  env: Env;
  ctx: ExecutionContext;
  request: Request;
  userId: number;
  username: string;
}) {
  const logger = getLogger(env, ctx, { route: "$username.raids.table" });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failure("요청을 확인하지 못했어요.");
  }
  if (!isObject(body)) return failure("요청을 확인하지 못했어요.");
  const { server, raidType, rows } = body;
  if (!isRaidRecordServer(server) || !isRaidRecordRaidType(raidType) || !Array.isArray(rows)) {
    return failure("요청을 확인하지 못했어요.");
  }
  if (rows.length === 0) return failure("저장할 기록이 없어요.");
  if (rows.length > MAX_ROWS) return failure("한 번에 저장할 수 있는 기록 수를 넘었어요.");

  const now = nowUtcIso();
  const [seasons, records] = await Promise.all([getRaidRecordSeasons(env, server), listRaidRecords(env, userId, { ctx })]);
  const seasonByIndex = new Map(
    seasons
      .filter((season) => season.raidType === raidType && isRaidSeasonStarted(season, now))
      .map((season) => [season.seasonIndex, season]),
  );
  const recordBySeasonIndex = new Map(
    records
      .filter((record) => record.server === server && record.raidType === raidType)
      .map((record) => [record.seasonIndex, record]),
  );

  const rowErrors: RaidRecordTableRowError[] = [];
  const inputs: RaidRecordTableRowInput[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    if (!isObject(row) || typeof row.seasonIndex !== "number" || seen.has(row.seasonIndex)) {
      return failure("요청을 확인하지 못했어요.");
    }
    seen.add(row.seasonIndex);
    const seasonIndex = row.seasonIndex;
    const season = seasonByIndex.get(seasonIndex);
    if (!season) return failure(`#${seasonIndex}은 기록할 수 있는 시즌이 아니에요.`);
    const current = recordBySeasonIndex.get(seasonIndex) ?? null;
    const recordUid = typeof row.recordUid === "string" ? row.recordUid : null;
    const recordUpdatedAt = typeof row.recordUpdatedAt === "string" ? row.recordUpdatedAt : null;
    // A record deleted, created, or changed elsewhere (such as the season chart in another tab) since the table read it.
    if ((current?.uid ?? null) !== recordUid || (current?.updatedAt ?? null) !== recordUpdatedAt) {
      return failure(STALE_MESSAGE, [], 409);
    }

    let scores: RaidRecordTableRowInput["scores"] = [];
    try {
      scores = normalizeRaidRecordScores(
        Array.isArray(row.scores) ? (row.scores as RaidRecordScoreInput[]) : [],
        raidRecordSeasonRules(season),
      );
      if (scores.length === 0) {
        rowErrors.push({
          seasonIndex,
          field: "score",
          message: raidType === "elimination" ? "방어 타입 점수를 하나 이상 입력해 주세요." : "점수를 입력해 주세요.",
        });
      }
    } catch (error) {
      if (!(error instanceof InvalidRaidRecordError)) throw error;
      rowErrors.push({ seasonIndex, field: "score", message: error.message });
    }
    let rank: number | null = null;
    try {
      rank = parseRaidRecordRank(row.rank);
      if (rank === null) rowErrors.push({ seasonIndex, field: "rank", message: "순위를 입력해 주세요." });
    } catch (error) {
      if (!(error instanceof InvalidRaidRecordError)) throw error;
      rowErrors.push({ seasonIndex, field: "rank", message: error.message });
    }
    if (rank !== null && scores.length > 0) inputs.push({ season, current, scores, rank });
  }
  if (rowErrors.length > 0) return failure(null, rowErrors);

  try {
    await saveRaidRecordTable(env, userId, inputs, { ctx });
  } catch (error) {
    if (error instanceof RaidRecordTableScoresAboveMaxError) {
      return failure(
        null,
        error.rows.map(({ seasonIndex, error: rowError }) => ({
          seasonIndex,
          field: "score",
          defenseType: rowError.defenseType,
          message: rowError.message,
        })),
      );
    }
    if (error instanceof RaidRecordBatchStaleError) return failure(STALE_MESSAGE, [], 409);
    logger.error("Raid record table save failed", error, { server, raidType, rows: inputs.length });
    return failure("저장하지 못했어요. 잠시 후 다시 시도해 주세요.", [], 500);
  }
  return redirect(raidRecordListPath(username, { server, raidType }));
}
