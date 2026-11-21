import { PlusIcon, TableCellsIcon } from "@heroicons/react/16/solid";
import { ChevronRightIcon } from "@heroicons/react/20/solid";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, redirect, useLoaderData, useRevalidator, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  type ConfirmRankActionData,
  ConfirmRankDialog,
  type ConfirmRankTarget,
} from "~/components/v2/features/raid-records/ConfirmRankDialog";
import {
  formatRaidClearResult,
  formatRaidDifficulty,
  formatRaidRank,
  formatRaidScore,
  formatRankConfirmAt,
  RAID_RECORD_RAID_TYPE_LABEL,
  RAID_RECORD_SERVER_LABEL,
} from "~/components/v2/features/raid-records/raid-record-format";
import {
  DefenseTypeLabel,
  RaidBossBackdrop,
  RaidRankTierBadge,
  RaidRankTierSummary,
  RaidSeasonMeta,
  RaidSeasonTitle,
  RankStatusPill,
} from "~/components/v2/features/raid-records/RaidRecordBits";
import { RaidRecordLoadFailure } from "~/components/v2/features/raid-records/RaidRecordLoadFailure";
import {
  RAID_RECORD_TREND_MIN_POINTS,
  RaidRecordTrendChart,
  type RaidRecordTrendPoint,
} from "~/components/v2/features/raid-records/RaidRecordTrendChart";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { SegmentedControl } from "~/components/v2/primitives/SegmentedControl";
import { Select } from "~/components/v2/primitives/Select";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import {
  countRaidRankTiers,
  InvalidRaidRecordError,
  parseRaidRecordRank,
  type RaidRecordDefenseType,
  type RaidRecordRaidType,
  type RaidRecordServer,
} from "~/domain/raid-record";
import { getLogger } from "~/lib/observability.server";
import { socialMeta } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { confirmRaidRecordRank } from "~/models/raid-record";
import { loadRaidRecordList, type RaidRecordRowView } from "~/views/raid-records";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import { parseRaidRecordListScope } from "./$username.raids._components/raid-record-list-query";
import { useUserLayout } from "./$username._components/user-layout";

export const meta: MetaFunction = ({ params, location }) => {
  const title = `${params.username || ""} - 총력전·대결전 기록 | 몰루로그`.trim();
  const description = `${params.username} 선생님의 총력전·대결전 시즌별 점수와 순위를 확인해 보세요`;
  return [
    { title },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
  ];
};

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const { server, raidType } = parseRaidRecordListScope(new URL(request.url).searchParams);
  const list = await loadRaidRecordList(env, sensei.id, server, raidType, ctx);
  return { ...list, isOwner: currentUser?.id === sensei.id };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect("/unauthorized");
  }
  const sensei = await getRouteSensei(env, params, currentUser.id, { ctx });
  if (sensei.id !== currentUser.id) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const uid = formData.get("uid");
  if (formData.get("intent") !== "confirm-rank" || typeof uid !== "string" || uid === "") {
    return data({ ok: false, uid: "", error: "요청을 확인하지 못했어요." } satisfies ConfirmRankActionData, {
      status: 400,
    });
  }
  let rank: number | null;
  try {
    rank = parseRaidRecordRank(formData.get("rank"));
  } catch (error) {
    if (!(error instanceof InvalidRaidRecordError)) throw error;
    return data({ ok: false, uid, error: error.message } satisfies ConfirmRankActionData, { status: 400 });
  }
  if (rank === null) {
    return data({ ok: false, uid, error: "순위를 입력해 주세요." } satisfies ConfirmRankActionData, { status: 400 });
  }
  try {
    const record = await confirmRaidRecordRank(env, currentUser.id, uid, rank, { ctx });
    if (!record) {
      return data({ ok: false, uid, error: "기록을 찾을 수 없어요." } satisfies ConfirmRankActionData, {
        status: 404,
      });
    }
  } catch (error) {
    getLogger(env, ctx, { route: "$username.raids" }).error("Raid record rank confirm failed", error, { uid });
    return data({ ok: false, uid, error: "저장하지 못했어요. 다시 시도해 주세요." } satisfies ConfirmRankActionData, {
      status: 500,
    });
  }
  return { ok: true, uid } satisfies ConfirmRankActionData;
};

export function ErrorBoundary() {
  const revalidator = useRevalidator();
  return <RaidRecordLoadFailure onRetry={() => revalidator.revalidate()} retrying={revalidator.state !== "idle"} />;
}

// The list's raid filter: both raid types together (the default), or one of them.
type RaidFilter = RaidRecordRaidType | "all";

const RAID_FILTER_OPTIONS: readonly RaidFilter[] = ["all", "total_assault", "elimination"];

const RAID_FILTER_LABEL: Record<RaidFilter, string> = { all: "전체", ...RAID_RECORD_RAID_TYPE_LABEL };

const SERVER_OPTIONS = [
  { value: "kr", label: RAID_RECORD_SERVER_LABEL.kr },
  { value: "jp", label: RAID_RECORD_SERVER_LABEL.jp },
] as const;

export default function UserRaidRecords() {
  const { server, raidType, counts, rows, unavailableRecords, unrecordedPastSeasonCount, isOwner } =
    useLoaderData<typeof loader>();
  const { username, setMobileActions } = useUserLayout();
  const [, setSearchParams] = useSearchParams();
  const timeZone = useDisplayTimeZone();
  const [confirmTarget, setConfirmTarget] = useState<ConfirmRankTarget | null>(null);
  const closeConfirm = useCallback(() => setConfirmTarget(null), []);

  const scopeQuery = raidType ? `server=${server}&type=${raidType}` : `server=${server}`;
  const newLink = `/@${username}/raids/new?${scopeQuery}`;
  const tableLink = `/@${username}/raids/table?${scopeQuery}`;

  useEffect(() => {
    if (!isOwner) return;
    setMobileActions({
      links: [
        { key: "table", title: "표로 입력", Icon: TableCellsIcon, to: tableLink, transition: "forward" },
        { key: "new", title: "기록 추가", Icon: PlusIcon, to: newLink, transition: "forward" },
      ],
    });
    return () => setMobileActions(null);
  }, [isOwner, setMobileActions, tableLink, newLink]);

  const filter: RaidFilter = raidType ?? "all";
  const changeScope = (next: { server?: RaidRecordServer; filter?: RaidFilter }) => {
    const nextFilter = next.filter ?? filter;
    setSearchParams(
      { server: next.server ?? server, ...(nextFilter === "all" ? {} : { type: nextFilter }) },
      { preventScrollReset: true, replace: true },
    );
  };

  const trendPoints = useMemo(
    () =>
      rows.flatMap((row): RaidRecordTrendPoint[] =>
        row.rank === null
          ? []
          : [
              {
                key: row.uid,
                server: row.season.server,
                raidType: row.season.raidType,
                seasonIndex: row.season.seasonIndex,
                bossName: row.season.boss.name,
                startAt: row.season.startAt,
                score: row.totalScore,
                rank: row.rank,
                rankStatus: row.rankStatus,
              },
            ],
      ),
    [rows],
  );

  const tierCounts = useMemo(
    () =>
      countRaidRankTiers(
        rows.map((row) => ({
          server: row.season.server,
          raidType: row.season.raidType,
          seasonIndex: row.season.seasonIndex,
          rank: row.rank,
        })),
      ),
    [rows],
  );
  const hasTier = Object.values(tierCounts).some((count) => count > 0);

  const raidLabel = raidType ? RAID_RECORD_RAID_TYPE_LABEL[raidType] : null;
  const empty = rows.length === 0 && unavailableRecords.length === 0;

  return (
    <section aria-labelledby="raid-records-title" className="flex flex-col gap-v2-block-gap">
      <h2 id="raid-records-title" className="sr-only">
        총력전·대결전 기록
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="서버"
          value={server}
          options={SERVER_OPTIONS}
          onChange={(value) => changeScope({ server: value })}
        />
        <SegmentedControl
          label="레이드"
          value={filter}
          onChange={(value) => changeScope({ filter: value })}
          options={RAID_FILTER_OPTIONS.map((option) => ({
            value: option,
            label: (
              <>
                {RAID_FILTER_LABEL[option]}
                <span className="text-xs font-medium text-v2-fg-tertiary tabular-nums">{counts[option]}</span>
              </>
            ),
          }))}
        />
        {isOwner ? (
          <div className="ml-auto hidden items-center gap-2 @min-[48rem]/page-available:flex">
            <Link to={tableLink} className={v2ButtonClassName({ variant: "secondary" })}>
              <TableCellsIcon className="size-4" aria-hidden="true" />
              표로 입력
            </Link>
            <Link to={newLink} className={v2ButtonClassName({ variant: "primary" })}>
              <PlusIcon className="size-4" aria-hidden="true" />
              기록 추가
            </Link>
          </div>
        ) : null}
      </div>

      {hasTier ? <RaidRankTierSummary counts={tierCounts} /> : null}

      {trendPoints.length >= RAID_RECORD_TREND_MIN_POINTS ? <RaidRecordTrendChart points={trendPoints} /> : null}

      {empty ? (
        <div className="rounded-lg bg-v2-surface px-v2-block-p py-10 text-center">
          {isOwner ? (
            <>
              <p className="text-sm font-semibold text-v2-fg">
                {RAID_RECORD_SERVER_LABEL[server]} {raidLabel ? `${raidLabel} ` : ""}기록이 없어요
              </p>
              <p className="mt-1 text-sm text-v2-fg-tertiary">
                기록을 하나씩 추가하거나, 여러 시즌을 표로 한 번에 입력할 수 있어요.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Link to={tableLink} className={v2ButtonClassName({ variant: "secondary" })}>
                  표로 입력
                </Link>
                <Link to={newLink} className={v2ButtonClassName({ variant: "primary" })}>
                  기록 추가
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm font-semibold text-v2-fg">기록이 없어요</p>
          )}
        </div>
      ) : (
        <ul aria-label={raidLabel ? `${raidLabel} 기록` : "총력전·대결전 기록"} className="@container flex flex-col gap-1.5">
          {rows.map((row) => (
            <RaidRecordRow
              key={row.uid}
              row={row}
              showRaidType={raidType === null}
              isOwner={isOwner}
              to={isOwner ? `/@${username}/raids/${row.uid}/edit` : `/@${username}/raids/${row.uid}`}
              timeZone={timeZone}
              onConfirm={() =>
                setConfirmTarget({
                  uid: row.uid,
                  rank: row.rank ?? 0,
                  season: row.season,
                  summary: `${RAID_RECORD_RAID_TYPE_LABEL[row.season.raidType]} #${row.season.seasonIndex} ${row.season.boss.name} · ${RAID_RECORD_SERVER_LABEL[row.season.server]} · 잠정 ${formatRaidRank(row.rank ?? 0)}`,
                })
              }
            />
          ))}
          {unavailableRecords.map((record) => (
            <li key={record.uid} className="rounded-lg bg-v2-surface px-4 py-3.5">
              <p className="text-sm font-semibold text-v2-fg tabular-nums">#{record.seasonIndex}</p>
              <p role="alert" className="mt-0.5 text-xs text-v2-danger">
                이 기록의 시즌 정보를 확인하지 못했어요.
              </p>
            </li>
          ))}
        </ul>
      )}

      {isOwner && !empty && unrecordedPastSeasonCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-v2-surface px-4 py-3">
          <p className="text-sm text-v2-fg-secondary tabular-nums">
            아직 기록하지 않은 지난 시즌 {unrecordedPastSeasonCount.toLocaleString("ko-KR")}개
          </p>
          <Link to={tableLink} className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
            표로 입력
          </Link>
        </div>
      ) : null}

      {isOwner ? <ConfirmRankDialog target={confirmTarget} action={`/@${username}/raids?index`} onClose={closeConfirm} /> : null}
    </section>
  );
}

// The four-letter defense types, whose widest label sets the width of every label in a row's score list.
const LABEL_WIDTH_DEFENSE_TYPES = [
  "special",
  "elastic",
  "composite",
] as const satisfies readonly RaidRecordDefenseType[];

function RaidRecordRow({
  row,
  showRaidType,
  isOwner,
  to,
  timeZone,
  onConfirm,
}: {
  row: RaidRecordRowView;
  showRaidType: boolean;
  isOwner: boolean;
  to: string;
  timeZone: string;
  onConfirm: () => void;
}) {
  const { season } = row;
  const elimination = season.raidType === "elimination";
  const single = row.scores[0];
  const clearResult = !elimination && single ? formatRaidClearResult(single.difficulty, single.clearTimeMs) : null;
  const titleId = `raid-record-${row.uid}`;

  return (
    <li className="relative overflow-hidden rounded-lg bg-v2-surface">
      <RaidBossBackdrop bossUid={season.boss.uid} />
      <Link
        to={to}
        aria-labelledby={titleId}
        className={cn("absolute inset-0 z-[1] rounded-lg hover:bg-v2-hover v2-interaction-transition", v2FocusRing)}
      />
      <div className="pointer-events-none relative z-[2] grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 @min-[40rem]:grid-cols-[minmax(0,1fr)_10rem_11rem_1.25rem]">
        <div className="col-span-2 flex min-w-0 flex-col gap-0.5 @min-[40rem]:col-span-1">
          {/* On a narrow row the rank status sits on the title line, above the rank, and takes only its own width. */}
          <div className="flex items-start justify-between gap-2">
            <span id={titleId} className="min-w-0 text-sm font-semibold text-v2-fg">
              <RaidSeasonTitle
                server={season.server}
                raidType={showRaidType ? season.raidType : undefined}
                seasonIndex={season.seasonIndex}
                counterpartSeasonIndex={season.counterpartSeasonIndex}
                bossName={season.boss.name}
                ongoing={season.ongoing}
              />
            </span>
            {rankStatusShown(row, isOwner) ? (
              <RankStatusPill status={row.rankStatus} className="shrink-0 @min-[40rem]:hidden" />
            ) : null}
          </div>
          <RaidSeasonMeta
            terrain={season.terrain}
            defenseTypes={elimination ? [] : season.displayDefenseTypes}
            startAt={season.startAt}
            endAt={season.endAt}
            timeZone={timeZone}
            className="text-v2-fg-tertiary"
          />
        </div>
        <div className="min-w-0 @min-[40rem]:text-right">
          <p className="flex flex-wrap items-baseline gap-x-2 text-[0.9375rem] font-bold text-v2-fg tabular-nums @min-[40rem]:justify-end">
            {formatRaidScore(row.totalScore)}
            {elimination && row.enteredCount < season.scoreDefenseTypes.length ? (
              <span className="text-xs font-medium text-v2-fg-tertiary">
                {row.enteredCount}/{season.scoreDefenseTypes.length} 입력
              </span>
            ) : null}
          </p>
          {clearResult ? <p className="text-xs text-v2-fg-secondary tabular-nums">{clearResult}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <RankCell row={row} isOwner={isOwner} timeZone={timeZone} onConfirm={onConfirm} editTo={to} />
        </div>
        <ChevronRightIcon className="hidden size-5 text-v2-fg-tertiary @min-[40rem]:block" aria-hidden="true" />
        {elimination ? (
          <p className="col-span-2 flex flex-col gap-y-0.5 text-xs text-v2-fg-secondary tabular-nums @min-[40rem]:col-span-4 @min-[40rem]:flex-row @min-[40rem]:flex-wrap @min-[40rem]:gap-x-3">
            {row.scores.map((entry) => (
              <span key={entry.defenseType} className="inline-flex items-center gap-1.5">
                {/* Every label takes the width of the widest four-letter one, so the scores line up across 경장갑 and 탄력장갑. */}
                <span className="inline-grid">
                  {LABEL_WIDTH_DEFENSE_TYPES.map((defenseType) => (
                    <DefenseTypeLabel
                      key={defenseType}
                      defenseType={defenseType}
                      className="invisible col-start-1 row-start-1"
                    />
                  ))}
                  <DefenseTypeLabel defenseType={entry.defenseType} className="col-start-1 row-start-1" />
                </span>
                {entry.score === null ? (
                  <span className="text-v2-fg-disabled">–</span>
                ) : (
                  <>
                    <span className="text-v2-fg">{formatRaidScore(entry.score)}</span>
                    {entry.difficulty ? <span>{formatRaidDifficulty(entry.difficulty)}</span> : null}
                  </>
                )}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// Whether the row shows a rank status pill: always beside a rank, and to the owner for a record without one.
function rankStatusShown(row: RaidRecordRowView, isOwner: boolean): boolean {
  return row.rank !== null || isOwner;
}

function RankCell({
  row,
  isOwner,
  timeZone,
  onConfirm,
  editTo,
}: {
  row: RaidRecordRowView;
  isOwner: boolean;
  timeZone: string;
  onConfirm: () => void;
  editTo: string;
}) {
  if (row.rank === null) {
    return isOwner ? (
      <>
        <RankStatusPill status="missing" className="hidden @min-[40rem]:inline-flex" />
        <Link
          to={editTo}
          className={v2ButtonClassName({ variant: "secondary", size: "sm", className: "pointer-events-auto" })}
        >
          순위 입력
        </Link>
      </>
    ) : (
      <span className="text-sm font-medium text-v2-fg-tertiary">순위 없음</span>
    );
  }
  return (
    <>
      <span className="flex items-center gap-1.5 text-[0.9375rem] font-bold text-v2-fg tabular-nums">
        <RaidRankTierBadge
          server={row.season.server}
          raidType={row.season.raidType}
          seasonIndex={row.season.seasonIndex}
          rank={row.rank}
        />
        {formatRaidRank(row.rank)}
        <RankStatusPill status={row.rankStatus} className="hidden @min-[40rem]:inline-flex" />
      </span>
      {isOwner && row.canConfirmRank ? (
        <Button size="sm" className="pointer-events-auto" onClick={onConfirm}>
          순위 확정하기
        </Button>
      ) : null}
      {isOwner && row.rankStatus === "provisional" && !row.canConfirmRank && row.season.rankConfirmAt ? (
        <span className="text-xs text-v2-fg-tertiary tabular-nums">
          {formatRankConfirmAt(row.season.rankConfirmAt, timeZone)} 확정
        </span>
      ) : null}
    </>
  );
}
