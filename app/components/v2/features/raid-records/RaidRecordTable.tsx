import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useFetcher, useNavigate } from "react-router";
import {
  computeRaidClearResult,
  getRaidMaxScore,
  getRaidMaxTotalScore,
  type RaidRecordDefenseType,
  type RaidRecordRaidType,
  type RaidRecordScoreMode,
  type RaidRecordServer,
} from "~/domain/raid-record";
import { cn } from "~/lib/utils";
import { defenseTypeLocale, terrainLocale } from "~/locales/ko";
import type { RaidRecordTableRowView, RaidRecordTableView } from "~/views/raid-records";
import { PageActionBar } from "../../layout/PageActionBar";
import { v2FocusRing } from "../../layout/styles";
import { useV2Page } from "../../layout/V2Page";
import { Button, v2ButtonClassName } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { Dialog } from "../../primitives/Dialog";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { Select } from "../../primitives/Select";
import { StatusNotice } from "../../primitives/StatusNotice";
import { type NumberInputFlowNavigationInputProps, useNumberInputFlowNavigation } from "../../primitives/use-number-input-flow-navigation";
import { DigitsInput } from "./DigitsInput";
import {
  DefenseTypeLabel,
  LiveLabel,
  RANK_STATUS_LABEL,
  RaidBossBackdrop,
  RaidRankTierBadge,
  RankStatusPill,
} from "./RaidRecordBits";
import {
  formatRaidClearResult,
  formatRaidRank,
  formatRaidScore,
  RAID_RECORD_RAID_TYPE_LABEL,
  RAID_RECORD_SERVER_LABEL,
} from "./raid-record-format";
import {
  initialRaidTableDraft,
  isRaidTableRankChanged,
  isRaidTableRowChanged,
  isRaidTableScoreChanged,
  isRaidTableTotalScoreChanged,
  type RaidTableCellError,
  type RaidTableDraft,
  type RaidTableRowStatus,
  raidTableErrorLabel,
  raidTableRowErrors,
  raidTableRowStatus,
  raidTableShowsTotal,
  toRaidTableSubmissionRow,
} from "./raid-record-table-state";

export type RaidRecordTableRowError = {
  seasonIndex: number;
  field: "score" | "totalScore" | "rank";
  defenseType?: RaidRecordDefenseType;
  message: string;
};

export type RaidRecordTableActionData = {
  ok: false;
  // A failure of the whole table, shown above it.
  message: string | null;
  rowErrors: RaidRecordTableRowError[];
};

const SERVER_OPTIONS = [
  { value: "kr", label: RAID_RECORD_SERVER_LABEL.kr },
  { value: "jp", label: RAID_RECORD_SERVER_LABEL.jp },
] as const;

// Rows render in pages, so a server with a hundred seasons does not mount a hundred rows of inputs at once.
const ROWS_PER_PAGE = 30;
// Below these widths the columns no longer fit, and each season becomes a card.
// The fixed columns plus room for the boss column (thumbnail and a short name) and the box padding.
const TABLE_MIN_WIDTH: Record<RaidRecordRaidType, number> = { total_assault: 840, elimination: 960 };

function useWidthAtLeast(minWidth: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const apply = (width: number) => setWide(width >= minWidth);
    apply(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => apply(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [minWidth]);
  return { ref, wide };
}

type RowModel = {
  row: RaidRecordTableRowView;
  draft: RaidTableDraft;
  changed: boolean;
  errors: RaidTableCellError[];
  status: RaidTableRowStatus;
  maxScores: Partial<Record<RaidRecordDefenseType, number | null>>;
  maxTotalScore: number | null;
};

function cellError(model: RowModel, field: "score" | "totalScore" | "rank", defenseType?: RaidRecordDefenseType) {
  const firstDefenseType = model.row.season.scoreDefenseTypes[0]?.defenseType;
  return model.errors.find(
    (error) =>
      error.field === field &&
      (field !== "score" ||
        error.defenseType === defenseType ||
        (error.defenseType === undefined && defenseType === firstDefenseType)),
  );
}

function tableTo(username: string, server: RaidRecordServer, raidType: RaidRecordRaidType) {
  return `/@${username}/raids/table?server=${server}&type=${raidType}`;
}

// "표로 입력": every started season of one server and raid type, with the score and rank of each, saved all at once.
export function RaidRecordTable({ view, username, listTo }: { view: RaidRecordTableView; username: string; listTo: string }) {
  const { server, raidType, rows, now } = view;
  const { stacked } = useV2Page();
  const navigate = useNavigate();
  const fetcher = useFetcher<RaidRecordTableActionData>();
  const { getInputProps } = useNumberInputFlowNavigation({ enterMovesDown: true });
  const { ref: layoutRef, wide } = useWidthAtLeast(TABLE_MIN_WIDTH[raidType]);
  const filterId = useId();

  const [drafts, setDrafts] = useState<Record<number, RaidTableDraft>>({});
  const [serverErrors, setServerErrors] = useState<RaidRecordTableActionData["rowErrors"]>([]);
  const [onlyUnrecorded, setOnlyUnrecorded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ROWS_PER_PAGE);
  const savingRef = useRef(false);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    savingRef.current = false;
    if (fetcher.data && !fetcher.data.ok) setServerErrors(fetcher.data.rowErrors);
  }, [fetcher.state, fetcher.data]);

  const models = useMemo(
    () =>
      rows.map((row): RowModel => {
        const draft = drafts[row.season.seasonIndex] ?? initialRaidTableDraft(row);
        const changed = isRaidTableRowChanged(row, draft);
        const maxScores: Partial<Record<RaidRecordDefenseType, number | null>> = {};
        for (const { defenseType, maxDifficulty } of row.season.scoreDefenseTypes) {
          maxScores[defenseType] = getRaidMaxScore(row.season.boss.uid, maxDifficulty);
        }
        const maxTotalScore = getRaidMaxTotalScore(row.season.boss.uid, row.season.scoreDefenseTypes);
        const errors = [
          ...raidTableRowErrors(row, draft, maxScores, maxTotalScore),
          ...serverErrors
            .filter((error) => error.seasonIndex === row.season.seasonIndex)
            .map(({ field, defenseType, message }) => ({ field, defenseType, message })),
        ];
        return { row, draft, changed, errors, status: raidTableRowStatus(row, draft, now), maxScores, maxTotalScore };
      }),
    [rows, drafts, serverErrors, now],
  );

  const changedModels = models.filter((model) => model.changed);
  const errorEntries = changedModels.flatMap((model) =>
    model.errors.map((error) => raidTableErrorLabel(model.row, error)),
  );
  const uniqueErrorLabels = [...new Set(errorEntries)];
  const dirty = changedModels.length > 0;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !savingRef.current &&
      `${currentLocation.pathname}${currentLocation.search}` !== `${nextLocation.pathname}${nextLocation.search}`,
  );
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const updateDraft = useCallback((row: RaidRecordTableRowView, change: (draft: RaidTableDraft) => RaidTableDraft) => {
    const seasonIndex = row.season.seasonIndex;
    setDrafts((current) => ({ ...current, [seasonIndex]: change(current[seasonIndex] ?? initialRaidTableDraft(row)) }));
    setServerErrors((current) => current.filter((error) => error.seasonIndex !== seasonIndex));
  }, []);
  const setScore = (row: RaidRecordTableRowView, defenseType: RaidRecordDefenseType, score: number | null) =>
    updateDraft(row, (draft) => ({ ...draft, scores: { ...draft.scores, [defenseType]: score } }));
  const setRank = (row: RaidRecordTableRowView, rank: number | null) => updateDraft(row, (draft) => ({ ...draft, rank }));
  const setTotalScore = (row: RaidRecordTableRowView, totalScore: number | null) =>
    updateDraft(row, (draft) => ({ ...draft, totalScore }));
  const setScoreMode = (row: RaidRecordTableRowView, scoreMode: RaidRecordScoreMode) =>
    updateDraft(row, (draft) => ({ ...draft, scoreMode }));

  const filtered = onlyUnrecorded
    ? models.filter((model) => (!model.row.record && !model.row.unavailableRecordUid) || model.changed)
    : models;
  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.slice(visibleCount);

  const saving = fetcher.state !== "idle";
  const canSave = dirty && uniqueErrorLabels.length === 0 && !saving;
  const save = () => {
    if (!canSave) return;
    savingRef.current = true;
    fetcher.submit(
      { server, raidType, rows: changedModels.map((model) =>
          toRaidTableSubmissionRow(model.row, model.draft, model.maxScores, model.maxTotalScore),
        ) },
      { method: "post", encType: "application/json" },
    );
  };

  const cellProps: CellContext = { username, getInputProps, setScore, setTotalScore, setScoreMode, setRank };
  const pageMessage = fetcher.state === "idle" && fetcher.data && !fetcher.data.ok ? fetcher.data.message : null;

  return (
    <div className={cn("flex flex-col gap-v2-block-gap", stacked && "pb-28")}>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="서버"
          value={server}
          options={SERVER_OPTIONS}
          onChange={(value) => navigate(tableTo(username, value, raidType))}
        />
        <SegmentedControl
          label="레이드"
          value={raidType}
          onChange={(value) => navigate(tableTo(username, server, value))}
          options={(["total_assault", "elimination"] as const).map((type) => ({
            value: type,
            label: RAID_RECORD_RAID_TYPE_LABEL[type],
          }))}
        />
        <span className="ml-auto">
          <Checkbox id={filterId} checked={onlyUnrecorded} onCheckedChange={setOnlyUnrecorded}>
            <span className="text-v2-fg-secondary">기록하지 않은 시즌만</span>
          </Checkbox>
        </span>
      </div>

      {pageMessage ? (
        <StatusNotice tone="danger" boxed>
          {pageMessage}
        </StatusNotice>
      ) : null}

      <div ref={layoutRef} className="min-w-0">
        {visible.length === 0 ? (
          <p className="rounded-lg bg-v2-surface px-v2-block-p py-10 text-center text-sm text-v2-fg-secondary">
            {onlyUnrecorded ? "기록하지 않은 시즌이 없어요" : "기록할 수 있는 시즌이 없어요"}
          </p>
        ) : wide ? (
          <div className="rounded-lg bg-v2-surface px-2 py-1">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                {RAID_RECORD_RAID_TYPE_LABEL[raidType]} 시즌별 점수와 순위
              </caption>
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-v2-divider [&>th]:px-2 [&>th]:py-2 [&>th]:text-xs [&>th]:font-semibold [&>th]:whitespace-nowrap [&>th]:text-v2-fg-secondary">
                  <th scope="col" className="w-px text-left">
                    시즌
                  </th>
                  <th scope="col" className="text-left">
                    보스
                  </th>
                  {raidType === "total_assault" ? (
                    <>
                      <th scope="col" className="w-40 text-right">
                        점수
                      </th>
                      <th scope="col" className="w-40 text-left">
                        난이도 · 클리어 시간
                      </th>
                    </>
                  ) : (
                    <>
                      {[1, 2, 3].map((index) => (
                        <th key={index} scope="col" className="w-28 text-left">
                          방어 타입 {index}
                        </th>
                      ))}
                      <th scope="col" className="w-28 text-right">
                        합산
                      </th>
                    </>
                  )}
                  <th scope="col" className="w-36 text-right">
                    순위
                  </th>
                  <th scope="col" className="w-28 text-left">
                    상태
                  </th>
                  <th scope="col" className="w-14">
                    <span className="sr-only">상세</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((model) => (
                  <TableRow key={model.row.season.seasonIndex} model={model} context={cellProps} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="flex flex-col gap-2" aria-label={`${RAID_RECORD_RAID_TYPE_LABEL[raidType]} 시즌별 점수와 순위`}>
            {visible.map((model) => (
              <SeasonCard key={model.row.season.seasonIndex} model={model} context={cellProps} />
            ))}
          </ul>
        )}
        {remaining.length > 0 ? (
          <LoadMore
            from={remaining[0].row.season.seasonIndex}
            to={remaining[remaining.length - 1].row.season.seasonIndex}
            onLoad={() => setVisibleCount((count) => count + ROWS_PER_PAGE)}
          />
        ) : null}
      </div>

      <PageActionBar
        placement={stacked ? "fixed" : "sticky"}
        summary={`수정한 기록 ${changedModels.length}개`}
        note={
          uniqueErrorLabels.length > 0 ? (
            <span className="text-v2-danger">
              오류 {uniqueErrorLabels.length}개
              {stacked ? "" : ` · ${uniqueErrorLabels.slice(0, 3).join(", ")}${uniqueErrorLabels.length > 3 ? " 외" : ""}`}
            </span>
          ) : null
        }
      >
        <Link to={listTo} className={v2ButtonClassName()}>
          취소
        </Link>
        <Button variant="primary" disabled={!canSave} onClick={save}>
          {saving ? "저장 중…" : "저장"}
        </Button>
      </PageActionBar>

      <Dialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="저장하지 않고 나갈까요?"
        size="sm"
      >
        <p className="text-sm text-v2-fg-secondary">저장하지 않은 기록이 있어요.</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => blocker.reset?.()}>계속 편집</Button>
          <Button
            variant="danger"
            onClick={() => {
              setDrafts({});
              blocker.proceed?.();
            }}
          >
            저장하지 않고 나가기
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------------------------------

type CellContext = {
  username: string;
  getInputProps: (options?: { disabled?: boolean }) => NumberInputFlowNavigationInputProps;
  setScore: (row: RaidRecordTableRowView, defenseType: RaidRecordDefenseType, score: number | null) => void;
  setTotalScore: (row: RaidRecordTableRowView, totalScore: number | null) => void;
  setScoreMode: (row: RaidRecordTableRowView, scoreMode: RaidRecordScoreMode) => void;
  setRank: (row: RaidRecordTableRowView, rank: number | null) => void;
};

function editTo(username: string, uid: string) {
  return `/@${username}/raids/${uid}/edit`;
}

function CellHint({ id, children, danger = false }: { id?: string; children: ReactNode; danger?: boolean }) {
  return (
    <span
      id={id}
      className={cn(
        // Wraps inside its column: a long message must not widen the column and squeeze the boss column.
        "mt-0.5 block text-right text-[0.6875rem] leading-[0.875rem] whitespace-normal",
        danger ? "font-semibold text-v2-danger" : "text-v2-fg-tertiary",
      )}
    >
      {children}
    </span>
  );
}

function ScoreCell({
  model,
  defenseType,
  context,
  label,
}: {
  model: RowModel;
  defenseType: RaidRecordDefenseType;
  context: CellContext;
  label: string;
}) {
  const errorId = useId();
  const { row, draft } = model;
  const error = cellError(model, "score", defenseType);
  const disabled = row.unavailableRecordUid !== null;
  return (
    <span className="block">
      <DigitsInput
        aria-label={label}
        placeholder="점수"
        value={draft.scores[defenseType] ?? null}
        onValueChange={(value) => context.setScore(row, defenseType, value)}
        changed={isRaidTableScoreChanged(row, draft, defenseType)}
        invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        {...context.getInputProps({ disabled })}
      />
      {error ? (
        <CellHint id={errorId} danger>
          {error.message}
        </CellHint>
      ) : null}
    </span>
  );
}

// The total of an elimination row that shows it alone.
function TotalScoreCell({ model, context }: { model: RowModel; context: CellContext }) {
  const errorId = useId();
  const { row, draft } = model;
  const error = cellError(model, "totalScore");
  const disabled = row.unavailableRecordUid !== null;
  return (
    <span className="block">
      <DigitsInput
        aria-label={`#${row.season.seasonIndex} 합산 점수`}
        value={draft.totalScore}
        onValueChange={(value) => context.setTotalScore(row, value)}
        changed={isRaidTableTotalScoreChanged(row, draft)}
        invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        {...context.getInputProps({ disabled })}
      />
      {error ? (
        <CellHint id={errorId} danger>
          {error.message}
        </CellHint>
      ) : null}
    </span>
  );
}

// Switches an elimination row between the scores per defense type and the total alone. The other side keeps its values.
function ScoreModeSwitch({ model, context }: { model: RowModel; context: CellContext }) {
  const { row, draft } = model;
  const showsTotal = raidTableShowsTotal(row, draft);
  return (
    <button
      type="button"
      onClick={() => context.setScoreMode(row, showsTotal ? "defense_type" : "total")}
      disabled={row.unavailableRecordUid !== null}
      aria-label={`#${row.season.seasonIndex} ${showsTotal ? "방어 타입별로 입력" : "합산 점수로 입력"}`}
      className={cn(
        "cursor-pointer rounded-sm text-[0.6875rem] leading-4 font-medium whitespace-nowrap text-v2-link hover:underline disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:no-underline",
        v2FocusRing,
      )}
    >
      {showsTotal ? "방어 타입별로 입력" : "합산 점수로 입력"}
    </button>
  );
}

function RankCell({ model, context }: { model: RowModel; context: CellContext }) {
  const errorId = useId();
  const { row, draft } = model;
  const error = cellError(model, "rank");
  const changed = isRaidTableRankChanged(row, draft);
  const disabled = row.unavailableRecordUid !== null;
  const previous = changed && row.record?.rank != null ? row.record.rank : null;
  return (
    <span className="block">
      <span className="flex items-center gap-1.5">
        {/* A fixed slot, so the input keeps its width while the typed rank moves in and out of a tier. */}
        <span className="flex w-6.5 shrink-0 justify-center">
          <RaidRankTierBadge
            server={row.season.server}
            raidType={row.season.raidType}
            seasonIndex={row.season.seasonIndex}
            rank={draft.rank}
          />
        </span>
        <DigitsInput
          aria-label={`#${row.season.seasonIndex} 순위`}
          suffix="위"
          value={draft.rank}
          onValueChange={(value) => context.setRank(row, value)}
          changed={changed}
          invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          containerClassName="min-w-0 flex-1"
          {...context.getInputProps({ disabled })}
        />
      </span>
      {error ? (
        <CellHint id={errorId} danger>
          {error.message}
        </CellHint>
      ) : previous !== null ? (
        <CellHint>이전 {formatRaidRank(previous)}</CellHint>
      ) : null}
    </span>
  );
}

// The difficulty and clear time of a total assault row's score, saved or changed.
function ClearResult({ model }: { model: RowModel }) {
  const { row, draft } = model;
  const defenseType = row.season.scoreDefenseTypes[0]?.defenseType;
  if (!defenseType) return <span className="text-v2-fg-tertiary">–</span>;
  const score = draft.scores[defenseType] ?? null;
  if (score === null) return <span className="text-v2-fg-tertiary">–</span>;
  const result = computeRaidClearResult(row.season.boss.uid, score);
  return <span>{result ? formatRaidClearResult(result.difficulty, result.clearTimeMs) : "–"}</span>;
}

function NeutralPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-5 items-center rounded bg-v2-inset px-1.5 text-xs font-semibold whitespace-nowrap text-v2-fg-secondary">
      {children}
    </span>
  );
}

function StatusCell({ status }: { status: RaidTableRowStatus }) {
  switch (status.kind) {
    case "none":
      return null;
    case "saved":
      return <RankStatusPill status={status.status} />;
    case "new":
      return <NeutralPill>새 기록</NeutralPill>;
    case "changed":
      return <NeutralPill>바뀐 값</NeutralPill>;
    case "transition":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-v2-fg-tertiary">
          <span className="sr-only">
            {RANK_STATUS_LABEL[status.from]}에서 {RANK_STATUS_LABEL[status.to]}으로
          </span>
          <span aria-hidden="true" className="inline-flex items-center gap-1">
            <RankStatusPill status={status.from} />→<RankStatusPill status={status.to} />
          </span>
        </span>
      );
  }
}

// An elimination row shows each defense type above its score input, so its boss line leaves them out.
function SeasonBoss({ row, showDefenseTypes = true }: { row: RaidRecordTableRowView; showDefenseTypes?: boolean }) {
  const { season } = row;
  return (
    <span className="relative flex min-w-0 items-center gap-2">
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-v2-fg">
          <span className="truncate">{season.boss.name}</span>
          {season.ongoing ? <LiveLabel /> : null}
        </span>
        <span className="flex min-w-0 items-center gap-x-2 overflow-hidden text-[0.6875rem] whitespace-nowrap text-v2-fg-tertiary">
          {season.terrain ? <span>{terrainLocale[season.terrain]}</span> : null}
          {showDefenseTypes
            ? season.displayDefenseTypes.map((defenseType) => (
                <DefenseTypeLabel key={defenseType} defenseType={defenseType} />
              ))
            : null}
        </span>
      </span>
    </span>
  );
}

// An elimination row puts each defense type above its score input. The cells right of the scores leave the same space
// above themselves, so every number in the row sits on the input line.
const DEFENSE_LABEL_SLOT = "block h-4 text-[0.6875rem] leading-4";
// The height of a score input with its border, for text that sits beside one.
const INPUT_LINE = "flex min-h-[calc(var(--spacing-v2-input-min)+2px)] items-center";

// The sum of an elimination row's scores.
function EliminationTotal({ model }: { model: RowModel }) {
  const entered = model.row.season.scoreDefenseTypes.flatMap(({ defenseType }) => {
    const score = model.draft.scores[defenseType];
    return score == null ? [] : [score];
  });
  return (
    <span className="block text-right">
      {entered.length === 0 ? (
        <span className={cn(INPUT_LINE, "justify-end text-v2-fg-tertiary")}>–</span>
      ) : (
        <span className={cn(INPUT_LINE, "justify-end font-semibold text-v2-fg tabular-nums")}>
          {formatRaidScore(entered.reduce((sum, score) => sum + score, 0))}
        </span>
      )}
    </span>
  );
}

function UnavailableNote({ username, uid }: { username: string; uid: string }) {
  return (
    <span className="text-xs text-v2-fg-tertiary">
      표에서 고칠 수 없는 기록이에요.{" "}
      <Link to={editTo(username, uid)} className="font-medium text-v2-link underline-offset-2 underline decoration-transparent hover:decoration-current v2-interaction-transition">
        수정 화면에서 보기
      </Link>
    </span>
  );
}

// Leaves the defense-type label space above a cell of an elimination row.
function InputLine({ aligned, children }: { aligned: boolean; children: ReactNode }) {
  if (!aligned) return <>{children}</>;
  return (
    <span className="flex flex-col gap-0.5">
      <span aria-hidden="true" className={DEFENSE_LABEL_SLOT} />
      {children}
    </span>
  );
}

function TableRow({ model, context }: { model: RowModel; context: CellContext }) {
  const { row } = model;
  const { season } = row;
  const empty = !row.record && !model.changed;
  const recordUid = row.record?.uid ?? row.unavailableRecordUid;
  const elimination = season.raidType === "elimination";
  // Cells that line up with the score inputs: top-aligned, below the defense-type label space.
  const inputLineCell = elimination ? "align-top!" : undefined;
  return (
    <tr
      className={cn(
        "[&>td]:border-b [&>td]:border-v2-divider [&>td]:px-2 [&>td]:py-1.5 [&>td]:align-middle [&>td]:whitespace-nowrap [&>td]:tabular-nums last:[&>td]:border-b-0",
        "[&:has(input:focus)>td]:bg-v2-accent-subtle",
      )}
    >
      <td className={cn("font-semibold", empty ? "text-v2-fg-tertiary" : "text-v2-fg")}>#{season.seasonIndex}</td>
      <td className="relative max-w-0 overflow-hidden">
        <RaidBossBackdrop bossUid={season.boss.uid} />
        <SeasonBoss row={row} showDefenseTypes={season.raidType === "total_assault"} />
        {row.unavailableRecordUid ? (
          <span className="relative block">
            <UnavailableNote username={context.username} uid={row.unavailableRecordUid} />
          </span>
        ) : null}
      </td>
      {season.raidType === "total_assault" ? (
        <>
          <td>
            {season.scoreDefenseTypes[0] ? (
              <ScoreCell
                model={model}
                defenseType={season.scoreDefenseTypes[0].defenseType}
                context={context}
                label={`#${season.seasonIndex} 점수`}
              />
            ) : null}
          </td>
          <td className="text-xs text-v2-fg-secondary">
            <ClearResult model={model} />
          </td>
        </>
      ) : (
        <>
          {raidTableShowsTotal(row, model.draft) ? (
            <td colSpan={3} className="align-top!">
              <InputLine aligned>
                <span className={INPUT_LINE}>
                  <ScoreModeSwitch model={model} context={context} />
                </span>
              </InputLine>
            </td>
          ) : (
            [0, 1, 2].map((index) => {
              const entry = season.scoreDefenseTypes[index];
              return (
                <td key={index} className="align-top!">
                  {entry ? (
                    <span className="flex flex-col gap-0.5">
                      <DefenseTypeLabel
                        defenseType={entry.defenseType}
                        className={cn(DEFENSE_LABEL_SLOT, "flex text-v2-fg-secondary")}
                      />
                      <ScoreCell
                        model={model}
                        defenseType={entry.defenseType}
                        context={context}
                        label={`#${season.seasonIndex} ${defenseTypeLocale[entry.defenseType]} 점수`}
                      />
                    </span>
                  ) : null}
                </td>
              );
            })
          )}
          <td className={inputLineCell}>
            {raidTableShowsTotal(row, model.draft) ? (
              <InputLine aligned>
                <TotalScoreCell model={model} context={context} />
              </InputLine>
            ) : (
              <span className="flex flex-col gap-0.5">
                <span className={cn(DEFENSE_LABEL_SLOT, "flex justify-end")}>
                  <ScoreModeSwitch model={model} context={context} />
                </span>
                <EliminationTotal model={model} />
              </span>
            )}
          </td>
        </>
      )}
      <td className={inputLineCell}>
        <InputLine aligned={elimination}>
          <RankCell model={model} context={context} />
        </InputLine>
      </td>
      <td className={inputLineCell}>
        <InputLine aligned={elimination}>
          <span className={cn(elimination && INPUT_LINE)}>
            <StatusCell status={model.status} />
          </span>
        </InputLine>
      </td>
      <td className={inputLineCell}>
        <InputLine aligned={elimination}>
          {recordUid ? (
            <span className={cn(elimination && INPUT_LINE)}>
              <Link to={editTo(context.username, recordUid)} className={v2ButtonClassName({ variant: "text", size: "sm" })}>
                상세
                <span className="sr-only"> #{season.seasonIndex}</span>
              </Link>
            </span>
          ) : null}
        </InputLine>
      </td>
    </tr>
  );
}

function SeasonCard({ model, context }: { model: RowModel; context: CellContext }) {
  const { row } = model;
  const { season } = row;
  const empty = !row.record && !model.changed;
  return (
    <li className="relative flex flex-col gap-2 overflow-hidden rounded-lg bg-v2-surface px-3 py-2.5 has-[input:focus]:ring-[1.5px] has-[input:focus]:ring-v2-accent [&>*:not(img)]:relative">
      <RaidBossBackdrop bossUid={season.boss.uid} />
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn("min-w-0 truncate text-sm font-semibold", empty ? "text-v2-fg-secondary" : "text-v2-fg")}>
          <span className="tabular-nums">#{season.seasonIndex}</span> {season.boss.name}
        </span>
        {season.ongoing ? <LiveLabel /> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <StatusCell status={model.status} />
          {row.record ? (
            <Link
              to={editTo(context.username, row.record.uid)}
              className={v2ButtonClassName({ variant: "text", size: "sm", className: "-mr-1.5" })}
            >
              상세
              <span className="sr-only"> #{season.seasonIndex}</span>
            </Link>
          ) : null}
        </span>
      </span>
      {row.unavailableRecordUid ? <UnavailableNote username={context.username} uid={row.unavailableRecordUid} /> : null}
      {season.raidType === "total_assault" ? (
        <span className="grid grid-cols-[1fr_8.5rem] items-start gap-2">
          <span className="flex flex-col gap-0.5">
            {season.scoreDefenseTypes[0] ? (
              <ScoreCell
                model={model}
                defenseType={season.scoreDefenseTypes[0].defenseType}
                context={context}
                label={`#${season.seasonIndex} 점수`}
              />
            ) : null}
            <span className="text-xs text-v2-fg-tertiary">
              <ClearResult model={model} />
            </span>
          </span>
          <RankCell model={model} context={context} />
        </span>
      ) : (
        <span className="flex flex-col gap-1.5">
          <span className="flex flex-col items-start">
            <ScoreModeSwitch model={model} context={context} />
          </span>
          {raidTableShowsTotal(row, model.draft) ? null : (
            season.scoreDefenseTypes.map(({ defenseType }) => (
              <span key={defenseType} className="grid grid-cols-[6rem_1fr] items-start gap-2">
                <DefenseTypeLabel defenseType={defenseType} className="min-h-7 text-xs text-v2-fg-secondary" />
                <ScoreCell
                  model={model}
                  defenseType={defenseType}
                  context={context}
                  label={`#${season.seasonIndex} ${defenseTypeLocale[defenseType]} 점수`}
                />
              </span>
            ))
          )}
          <span className="grid grid-cols-[1fr_8.5rem] items-start gap-2">
            {raidTableShowsTotal(row, model.draft) ? (
              <span className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                <span className="flex min-h-7 items-center text-xs text-v2-fg-secondary">합산</span>
                <TotalScoreCell model={model} context={context} />
              </span>
            ) : (
              <span className="flex min-h-7 items-start justify-between gap-2 text-xs text-v2-fg-secondary">
                <span className="flex min-h-7 shrink-0 items-center">합산</span>
                <EliminationTotal model={model} />
              </span>
            )}
            <RankCell model={model} context={context} />
          </span>
        </span>
      )}
    </li>
  );
}

// "#78 ~ #1 · 아래로 스크롤하면 이전 시즌을 더 불러와요". Scrolling to it loads the next page; it is also a button.
function LoadMore({ from, to, onLoad }: { from: number; to: number; onLoad: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onLoadRef.current();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onLoad}
      className="mt-2 w-full cursor-pointer rounded-md py-2.5 text-center text-xs text-v2-fg-tertiary hover:bg-v2-hover v2-interaction-transition"
    >
      <span className="tabular-nums">
        #{from} ~ #{to}
      </span>{" "}
      · 아래로 스크롤하면 이전 시즌을 더 불러와요
    </button>
  );
}
