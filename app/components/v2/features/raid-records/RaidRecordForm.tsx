import { ClockIcon, ExclamationCircleIcon, PlusIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import {
  computeRaidClearResult,
  defaultRaidRecordScoreMode,
  getRaidMaxScore,
  getRaidMaxTotalScore,
  getRaidRecordTotalScore,
  parseRaidRecordScore,
  parseRaidRecordTotalScore,
  RAID_RECORD_LIMITS,
  type RaidRecordDefenseType,
  type RaidRecordParty,
  type RaidRecordRaidType,
  type RaidRecordRankStatus,
  type RaidRecordScore,
  type RaidRecordScoreMode,
  type RaidRecordServer,
  type RaidRecordSnapshot,
} from "~/domain/raid-record";
import { isInstantBefore } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { defenseTypeLocale } from "~/locales/ko";
import { PageActionBar } from "../../layout/PageActionBar";
import { v2FocusRing } from "../../layout/styles";
import { useV2Page } from "../../layout/V2Page";
import { Button, v2ButtonClassName } from "../../primitives/Button";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { StatusNotice } from "../../primitives/StatusNotice";
import { DigitsInput } from "./DigitsInput";
import { PartyMiniRow, RaidPartyCard, type RaidPartyEditorContext, type RaidPartyStudent } from "./RaidPartyEditor";
import { DefenseTypeLabel, RaidBossBackdrop, RaidRankTierBadge, RankStatusPill } from "./RaidRecordBits";
import { RaidSeasonSelect, type RaidSeasonSelectOption } from "./RaidSeasonSelect";
import {
  emptyRaidFormParty,
  type RaidFormParty,
  raidFormPartiesFromRecord,
  raidFormPartiesToSubmit,
  raidFormPartyStudentCount,
} from "./raid-record-form-state";
import {
  formatRaidClearResult,
  formatRaidScore,
  formatRaidSeasonPeriod,
  formatRankConfirmAtWithWeekday,
  RAID_RECORD_RAID_TYPE_LABEL,
  RAID_RECORD_SERVER_LABEL,
  RAID_RECORD_SERVER_SHORT_LABEL,
} from "./raid-record-format";
import { raidRecordRangeError } from "./raid-record-table-state";

export type RaidRecordFormStudent = RaidPartyStudent & { released: boolean };

export type RaidRecordFormMode =
  | {
      kind: "new";
      seasonsByServer: Record<RaidRecordServer, RaidSeasonSelectOption[]>;
      initialServer: RaidRecordServer;
      initialRaidType: RaidRecordRaidType;
    }
  | {
      kind: "edit";
      season: RaidSeasonSelectOption;
      record: {
        uid: string;
        scoreMode: RaidRecordScoreMode;
        scores: RaidRecordScore[];
        totalScore: number | null;
        rank: number | null;
        rankStatus: RaidRecordRankStatus;
        memo: string;
        parties: RaidRecordParty[];
      };
    };

export type RaidRecordFormErrorField = "season" | "score" | "totalScore" | "rank" | "memo" | "parties" | "form";

export type RaidRecordFormActionData = {
  ok: false;
  error: { field: RaidRecordFormErrorField; defenseType?: RaidRecordDefenseType; message: string };
};

export type RaidRecordFormSubmission = {
  intent: "save";
  server: RaidRecordServer;
  raidType: RaidRecordRaidType;
  seasonIndex: number;
  scoreMode: RaidRecordScoreMode;
  // Both are sent whichever the record shows, so the other is kept.
  scores: { defenseType: RaidRecordDefenseType; score: number }[];
  totalScore: number | null;
  rank: number | null;
  memo: string;
  parties: RaidRecordParty[];
};

type ScoreDraft = Partial<Record<RaidRecordDefenseType, number | null>>;

function defaultSeason(options: readonly RaidSeasonSelectOption[], raidType: RaidRecordRaidType) {
  return options.find((option) => option.raidType === raidType && option.recordUid === null) ?? null;
}

// Parties follow the season: a 총력전 season has one defense type, so its parties take the new one; an elimination
// season keeps the parties of the defense types it shares with the season before.
function partiesForSeason(parties: readonly RaidFormParty[], season: RaidSeasonSelectOption): RaidFormParty[] {
  const types = season.scoreDefenseTypes.map(({ defenseType }) => defenseType);
  if (season.raidType === "total_assault") {
    return types[0] ? parties.map((party) => ({ ...party, defenseType: types[0] })) : [];
  }
  return parties.filter((party) => types.includes(party.defenseType));
}

export function RaidRecordForm({
  mode,
  students,
  recruited,
  now,
  timeZone,
  cancelTo,
}: {
  mode: RaidRecordFormMode;
  students: readonly RaidRecordFormStudent[];
  recruited: Readonly<Record<string, RaidRecordSnapshot>>;
  now: string;
  timeZone: string;
  cancelTo: string;
}) {
  const navigate = useNavigate();
  const fetcher = useFetcher<RaidRecordFormActionData>();
  const { stacked } = useV2Page();
  const ids = { season: useId(), score: useId(), rank: useId(), memo: useId(), parties: useId() };
  const partiesRef = useRef<HTMLElement>(null);

  const [server, setServer] = useState<RaidRecordServer>(
    mode.kind === "new" ? mode.initialServer : mode.season.server,
  );
  const [raidType, setRaidType] = useState<RaidRecordRaidType>(
    mode.kind === "new" ? mode.initialRaidType : mode.season.raidType,
  );
  const seasonOptions = useMemo(
    () => (mode.kind === "new" ? mode.seasonsByServer[server].filter((option) => option.raidType === raidType) : []),
    [mode, server, raidType],
  );
  const [season, setSeason] = useState<RaidSeasonSelectOption | null>(() =>
    mode.kind === "new" ? defaultSeason(mode.seasonsByServer[mode.initialServer], mode.initialRaidType) : mode.season,
  );
  const [scores, setScores] = useState<ScoreDraft>(() =>
    mode.kind === "edit" ? Object.fromEntries(mode.record.scores.map((entry) => [entry.defenseType, entry.score])) : {},
  );
  const [totalScore, setTotalScore] = useState<number | null>(mode.kind === "edit" ? mode.record.totalScore : null);
  const initialScoreMode = (option: RaidSeasonSelectOption | null): RaidRecordScoreMode =>
    option ? defaultRaidRecordScoreMode(option.raidType, option.ongoing) : "defense_type";
  const [scoreMode, setScoreMode] = useState<RaidRecordScoreMode>(() =>
    mode.kind === "edit" ? mode.record.scoreMode : initialScoreMode(season),
  );
  // A new record's score mode follows the chosen season until the Sensei picks one.
  const [scoreModeChosen, setScoreModeChosen] = useState(mode.kind === "edit");
  const [rank, setRank] = useState<number | null>(mode.kind === "edit" ? mode.record.rank : null);
  const [memo, setMemo] = useState(mode.kind === "edit" ? mode.record.memo : "");
  const [parties, setParties] = useState<RaidFormParty[]>(() =>
    mode.kind === "edit" ? raidFormPartiesFromRecord(mode.record.parties) : [],
  );
  const [expandedPartyId, setExpandedPartyId] = useState<string | null>(null);
  // The party whose search field takes focus next: one just added or expanded.
  const [focusPartyId, setFocusPartyId] = useState<string | null>(null);
  const clearFocusPartyId = useCallback(() => setFocusPartyId(null), []);
  const [activeDefenseType, setActiveDefenseType] = useState<RaidRecordDefenseType | null>(null);
  const [attempted, setAttempted] = useState(false);

  const defenseTypes = season?.scoreDefenseTypes.map(({ defenseType }) => defenseType) ?? [];
  const tabDefenseType =
    activeDefenseType && defenseTypes.includes(activeDefenseType) ? activeDefenseType : (defenseTypes[0] ?? null);

  const chooseSeason = (next: RaidSeasonSelectOption | null) => {
    setSeason(next);
    setScores({});
    setTotalScore(null);
    if (!scoreModeChosen) setScoreMode(initialScoreMode(next));
    setActiveDefenseType(null);
    if (next) setParties((current) => partiesForSeason(current, next));
  };
  const chooseServer = (next: RaidRecordServer) => {
    if (mode.kind !== "new") return;
    setServer(next);
    chooseSeason(defaultSeason(mode.seasonsByServer[next], raidType));
  };
  const chooseRaidType = (next: RaidRecordRaidType) => {
    if (mode.kind !== "new") return;
    setRaidType(next);
    chooseSeason(defaultSeason(mode.seasonsByServer[server], next));
  };

  const partyContext = useMemo((): RaidPartyEditorContext => {
    const studentsByUid = new Map(students.map((student) => [student.uid, student] as const));
    const pickableStudents = students
      .filter((student) => server === "jp" || student.released)
      .sort(
        (left, right) =>
          Number(Boolean(recruited[right.uid])) - Number(Boolean(recruited[left.uid])) ||
          left.name.localeCompare(right.name, "ko"),
      );
    return { studentsByUid, pickableStudents, recruited };
  }, [students, server, recruited]);

  // Validation the screen can do on its own. The action checks the same rules again.
  const enteredScores = defenseTypes.flatMap((defenseType) => {
    const score = scores[defenseType];
    return score === null || score === undefined ? [] : [{ defenseType, score }];
  });
  const scoreErrors: Partial<Record<RaidRecordDefenseType, string>> = {};
  for (const { defenseType, score } of enteredScores) {
    const maxDifficulty = season?.scoreDefenseTypes.find((entry) => entry.defenseType === defenseType)?.maxDifficulty;
    const maxScore = season ? getRaidMaxScore(season.boss.uid, maxDifficulty ?? null) : null;
    const rangeError = raidRecordRangeError(() => parseRaidRecordScore(score));
    if (rangeError) scoreErrors[defenseType] = rangeError;
    else if (maxScore !== null && score > maxScore) {
      scoreErrors[defenseType] = `최대 점수(${formatRaidScore(maxScore)})보다 높아요.`;
    }
  }
  const showsTotal = season?.raidType === "elimination" && scoreMode === "total";
  const maxTotalScore = season ? getRaidMaxTotalScore(season.boss.uid, season.scoreDefenseTypes) : null;
  const totalScoreError =
    totalScore === null
      ? null
      : (raidRecordRangeError(() => parseRaidRecordTotalScore(totalScore)) ??
        (maxTotalScore !== null && totalScore > maxTotalScore
          ? `최대 합산 점수(${formatRaidScore(maxTotalScore)})보다 높아요.`
          : null));
  const hasScoreErrors = Object.keys(scoreErrors).length > 0;
  const rankError =
    rank === null ? "순위를 입력해 주세요." : rank > RAID_RECORD_LIMITS.maxRank ? "순위를 확인해 주세요." : null;
  // Only the side on screen is checked. A value left on the other side that would not save is left out of the save.
  const localErrors = {
    season: season === null ? "시즌을 골라 주세요." : null,
    score:
      season === null || showsTotal
        ? null
        : enteredScores.length === 0
          ? raidType === "elimination"
            ? "방어 타입 점수를 하나 이상 입력해 주세요."
            : "점수를 입력해 주세요."
          : null,
    totalScore: !showsTotal
      ? null
      : totalScore === null
        ? "합산 점수를 입력해 주세요."
        : totalScoreError,
    rank: rankError,
  };
  const hasLocalError =
    Boolean(localErrors.season || localErrors.score || localErrors.totalScore || localErrors.rank) ||
    (!showsTotal && hasScoreErrors);

  // A server error stays until the field it names changes.
  const [serverError, setServerError] = useState<RaidRecordFormActionData["error"] | null>(null);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.ok) setServerError(fetcher.data.error);
  }, [fetcher.state, fetcher.data]);
  const clearServerError = (field: RaidRecordFormErrorField) =>
    setServerError((current) => (current && (current.field === field || current.field === "form") ? null : current));

  const saving = fetcher.state !== "idle";
  const submit = () => {
    setAttempted(true);
    setServerError(null);
    if (hasLocalError || !season) return;
    const submission: RaidRecordFormSubmission = {
      intent: "save",
      server: season.server,
      raidType: season.raidType,
      seasonIndex: season.seasonIndex,
      scoreMode: season.raidType === "elimination" ? scoreMode : "defense_type",
      scores: enteredScores.filter(({ defenseType }) => scoreErrors[defenseType] === undefined),
      totalScore: season.raidType === "elimination" && totalScoreError === null ? totalScore : null,
      rank,
      memo,
      parties: raidFormPartiesToSubmit(parties),
    };
    fetcher.submit(submission, { method: "post", encType: "application/json" });
  };

  const showError = (field: "season" | "score" | "totalScore" | "rank") => (attempted ? localErrors[field] : null);
  const serverErrorFor = (field: RaidRecordFormErrorField, defenseType?: RaidRecordDefenseType) =>
    serverError &&
    serverError.field === field &&
    (defenseType === undefined || serverError.defenseType === undefined || serverError.defenseType === defenseType)
      ? serverError.message
      : null;

  const setScore = (defenseType: RaidRecordDefenseType, value: number | null) => {
    setScores((current) => ({ ...current, [defenseType]: value }));
    clearServerError("score");
  };
  const changeScoreMode = (next: RaidRecordScoreMode) => {
    setScoreMode(next);
    setScoreModeChosen(true);
    clearServerError("score");
    clearServerError("totalScore");
  };

  const partiesOf = (defenseType: RaidRecordDefenseType) => parties.filter((party) => party.defenseType === defenseType);
  const showParties = (defenseType: RaidRecordDefenseType) => {
    setActiveDefenseType(defenseType);
    partiesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={cn("flex min-w-0 max-w-[62.5rem] flex-col gap-v2-group-gap", stacked && "pb-28")}>
      <section aria-labelledby={`${ids.season}-title`} className="flex flex-col gap-3.5 rounded-lg bg-v2-surface p-v2-block-p">
        <h2 id={`${ids.season}-title`} className="text-base font-semibold text-v2-fg">
          시즌과 결과
        </h2>
        {mode.kind === "new" ? (
          <>
            <FormRow label="서버">
              <SegmentedControl
                label="서버"
                value={server}
                onChange={chooseServer}
                options={[
                  { value: "kr", label: RAID_RECORD_SERVER_SHORT_LABEL.kr },
                  { value: "jp", label: RAID_RECORD_SERVER_SHORT_LABEL.jp },
                ]}
              />
            </FormRow>
            <FormRow label="레이드">
              <SegmentedControl
                label="레이드 종류"
                value={raidType}
                onChange={chooseRaidType}
                options={[
                  { value: "total_assault", label: RAID_RECORD_RAID_TYPE_LABEL.total_assault },
                  { value: "elimination", label: RAID_RECORD_RAID_TYPE_LABEL.elimination },
                ]}
              />
            </FormRow>
            <FormRow label="시즌" labelId={`${ids.season}-label`}>
              <RaidSeasonSelect
                options={seasonOptions}
                value={season}
                timeZone={timeZone}
                invalid={Boolean(showError("season") || serverErrorFor("season"))}
                describedBy={`${ids.season}-error`}
                onChange={(next) => {
                  chooseSeason(next);
                  clearServerError("season");
                }}
                onOpenRecord={(recordUid) => navigate(`../${recordUid}/edit`, { relative: "path" })}
              />
              {seasonOptions.length === 0 ? (
                <p className="mt-1 text-xs text-v2-fg-tertiary">이 서버에서 시작한 시즌이 아직 없어요.</p>
              ) : null}
              <FieldMessage id={`${ids.season}-error`} message={showError("season") ?? serverErrorFor("season")} />
            </FormRow>
          </>
        ) : season ? (
          <FormRow label="시즌">
            <span className="relative flex min-h-11 w-full max-w-[28.75rem] min-w-0 items-center overflow-hidden rounded-md bg-v2-inset px-3 py-1.5">
              <RaidBossBackdrop bossUid={season.boss.uid} />
              <span className="relative flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-v2-fg">
                  <span className="tabular-nums">#{season.seasonIndex}</span> {season.boss.name} ·{" "}
                  {RAID_RECORD_SERVER_LABEL[season.server]}
                </span>
                <span className="text-xs text-v2-fg-tertiary tabular-nums">
                  {RAID_RECORD_RAID_TYPE_LABEL[season.raidType]} ·{" "}
                  {formatRaidSeasonPeriod(season.startAt, season.endAt, timeZone)}
                </span>
              </span>
            </span>
          </FormRow>
        ) : null}

        {season ? (
          <>
            <hr className="border-v2-divider" />
            {season.raidType === "total_assault" && defenseTypes[0] ? (
              <FormRow label="점수" labelFor={ids.score}>
                <div className="group/score">
                  <DigitsInput
                    id={ids.score}
                    value={scores[defenseTypes[0]] ?? null}
                    onValueChange={(value) => setScore(defenseTypes[0], value)}
                    invalid={Boolean(
                      (attempted && (scoreErrors[defenseTypes[0]] || localErrors.score)) || serverErrorFor("score"),
                    )}
                    aria-describedby={`${ids.score}-hint`}
                    containerClassName="w-full max-w-[13.75rem]"
                  />
                  <div id={`${ids.score}-hint`}>
                    {attempted && (scoreErrors[defenseTypes[0]] || localErrors.score) ? (
                      <FieldMessage message={scoreErrors[defenseTypes[0]] ?? localErrors.score} />
                    ) : serverErrorFor("score") ? (
                      <FieldMessage message={serverErrorFor("score")} />
                    ) : (
                      <ScorePreview score={scores[defenseTypes[0]] ?? null} bossUid={season.boss.uid} />
                    )}
                  </div>
                </div>
              </FormRow>
            ) : (
              <FormRow label="점수">
                <div className="flex min-w-0 flex-col gap-2.5">
                  <SegmentedControl
                    label="점수 입력 방식"
                    value={scoreMode}
                    onChange={changeScoreMode}
                    options={[
                      { value: "defense_type", label: "방어 타입별" },
                      { value: "total", label: "합산 점수" },
                    ]}
                    className="self-start"
                  />
                  {showsTotal ? (
                    <div>
                      <DigitsInput
                        id={ids.score}
                        aria-label="합산 점수"
                        value={totalScore}
                        onValueChange={(value) => {
                          setTotalScore(value);
                          clearServerError("totalScore");
                        }}
                        invalid={Boolean(showError("totalScore") || serverErrorFor("totalScore") || serverErrorFor("score"))}
                        aria-describedby={`${ids.score}-hint`}
                        containerClassName="w-full max-w-[13.75rem]"
                      />
                      <div id={`${ids.score}-hint`}>
                        <FieldMessage
                          message={showError("totalScore") ?? serverErrorFor("totalScore") ?? serverErrorFor("score")}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <EliminationScores
                        season={season}
                        scores={scores}
                        scoreErrors={attempted ? scoreErrors : {}}
                        serverErrorFor={(defenseType) => serverErrorFor("score", defenseType)}
                        parties={parties}
                        studentsByUid={partyContext.studentsByUid}
                        stacked={stacked}
                        onChange={setScore}
                        onShowParties={showParties}
                      />
                      <FieldMessage message={(attempted ? localErrors.score : null) ?? serverErrorFor("totalScore")} />
                    </>
                  )}
                </div>
              </FormRow>
            )}
            <FormRow label="순위" labelFor={ids.rank}>
              <div className="flex items-center gap-2">
                <DigitsInput
                  id={ids.rank}
                  value={rank}
                  onValueChange={(value) => {
                    setRank(value);
                    clearServerError("rank");
                  }}
                  suffix="위"
                  invalid={Boolean(showError("rank") || serverErrorFor("rank"))}
                  aria-describedby={`${ids.rank}-hint`}
                  containerClassName="w-full max-w-[13.75rem]"
                />
                <RaidRankTierBadge
                  server={season.server}
                  raidType={season.raidType}
                  seasonIndex={season.seasonIndex}
                  rank={rank}
                />
              </div>
              <div id={`${ids.rank}-hint`}>
                {showError("rank") || serverErrorFor("rank") ? (
                  <FieldMessage message={showError("rank") ?? serverErrorFor("rank")} />
                ) : (
                  <RankHint
                    season={season}
                    now={now}
                    timeZone={timeZone}
                    storedStatus={mode.kind === "edit" ? mode.record.rankStatus : null}
                  />
                )}
              </div>
            </FormRow>
            <FormRow label="메모" optional labelFor={ids.memo}>
              <textarea
                id={ids.memo}
                value={memo}
                maxLength={RAID_RECORD_LIMITS.memoLength}
                rows={3}
                onChange={(event) => {
                  setMemo(event.currentTarget.value);
                  clearServerError("memo");
                }}
                placeholder="공략 메모를 남겨 보세요"
                className={cn(
                  "block w-full max-w-[40rem] resize-y rounded-md border border-v2-control-border bg-v2-surface px-2.5 py-2 text-base text-v2-fg placeholder:text-v2-fg-tertiary focus:border-v2-control-border-strong sm:text-sm",
                  v2FocusRing,
                )}
              />
              <p className="mt-1 text-right text-xs text-v2-fg-tertiary tabular-nums max-w-[40rem]">
                {memo.length.toLocaleString("ko-KR")}/{RAID_RECORD_LIMITS.memoLength.toLocaleString("ko-KR")}
              </p>
              <FieldMessage message={serverErrorFor("memo")} />
            </FormRow>
          </>
        ) : null}
      </section>

      {season ? (
        <section
          ref={partiesRef}
          aria-labelledby={`${ids.parties}-title`}
          className="flex scroll-mt-4 flex-col gap-3 rounded-lg bg-v2-surface p-v2-block-p"
        >
          <div className="flex items-baseline gap-2">
            <h2 id={`${ids.parties}-title`} className="text-base font-semibold text-v2-fg">
              편성
            </h2>
            <span className="text-xs text-v2-fg-tertiary">선택</span>
          </div>
          {season.raidType === "elimination" ? (
            <DefenseTypeTabs
              defenseTypes={defenseTypes}
              value={tabDefenseType}
              counts={Object.fromEntries(defenseTypes.map((defenseType) => [defenseType, partiesOf(defenseType).length]))}
              onChange={setActiveDefenseType}
            />
          ) : null}
          {tabDefenseType ? (
            <PartyList
              defenseType={tabDefenseType}
              raidType={season.raidType}
              parties={partiesOf(tabDefenseType)}
              expandedPartyId={expandedPartyId}
              focusPartyId={focusPartyId}
              onPartyFocused={clearFocusPartyId}
              context={partyContext}
              onExpand={(id) => {
                setExpandedPartyId(id);
                setFocusPartyId(id);
              }}
              onChange={(next) => {
                setParties((current) => current.map((party) => (party.id === next.id ? next : party)));
                clearServerError("parties");
              }}
              onRemove={(id) => {
                setParties((current) => current.filter((party) => party.id !== id));
                clearServerError("parties");
              }}
              onAdd={() => {
                const party = emptyRaidFormParty(tabDefenseType);
                setParties((current) => [...current, party]);
                setExpandedPartyId(party.id);
                setFocusPartyId(party.id);
              }}
            />
          ) : null}
          <FieldMessage message={serverErrorFor("parties")} />
        </section>
      ) : null}

      {serverError?.field === "form" ? (
        <StatusNotice tone="danger" boxed>
          {serverError.message}
        </StatusNotice>
      ) : null}

      <PageActionBar
        placement={stacked ? "fixed" : "sticky"}
        summary={
          season ? (
            <span className="block truncate">
              {season.raidType === "elimination" ? "대결전 " : ""}
              <span className="tabular-nums">#{season.seasonIndex}</span> {season.boss.name} ·{" "}
              {RAID_RECORD_SERVER_LABEL[season.server]}
            </span>
          ) : null
        }
      >
        <Link to={cancelTo} className={v2ButtonClassName()}>
          취소
        </Link>
        <Button variant="primary" onClick={submit} disabled={saving || !season}>
          {saving ? "저장 중…" : "저장"}
        </Button>
      </PageActionBar>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------------------------------

function FormRow({
  label,
  optional = false,
  labelFor,
  labelId,
  children,
}: {
  label: string;
  optional?: boolean;
  labelFor?: string;
  labelId?: string;
  children: ReactNode;
}) {
  const labelContent = (
    <>
      {label}
      {optional ? <span className="ml-1 text-xs font-normal text-v2-fg-tertiary">선택</span> : null}
    </>
  );
  return (
    <div className="grid min-w-0 gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
      {labelFor ? (
        <label htmlFor={labelFor} className="text-sm font-medium text-v2-fg-secondary sm:pt-1.5">
          {labelContent}
        </label>
      ) : (
        <span id={labelId} className="text-sm font-medium text-v2-fg-secondary sm:pt-1.5">
          {labelContent}
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FieldMessage({ id, message }: { id?: string; message: string | null | undefined }) {
  if (!message) return id ? <span id={id} hidden /> : null;
  return (
    <p id={id} role="alert" className="mt-1 flex items-start gap-1.5 text-xs text-v2-danger">
      <ExclamationCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span className="text-v2-fg">{message}</span>
    </p>
  );
}

function ScorePreview({ score, bossUid }: { score: number | null; bossUid: string }) {
  if (score === null) return null;
  const result = computeRaidClearResult(bossUid, score);
  const text = result ? formatRaidClearResult(result.difficulty, result.clearTimeMs) : null;
  // Also no result for a boss the score formula does not know. Hidden while the score is being typed: a partly typed
  // score is below every difficulty.
  if (!text) {
    return <p className="mt-1 text-xs text-v2-fg-tertiary group-focus-within/score:hidden">난이도를 알 수 없어요.</p>;
  }
  const [difficulty, time] = text.split(" · ");
  return (
    <p className="mt-1 text-sm text-v2-fg-secondary tabular-nums">
      <span className="font-semibold text-v2-fg">{difficulty}</span> · {time}
    </p>
  );
}

function RankHint({
  season,
  now,
  timeZone,
  storedStatus,
}: {
  season: RaidSeasonSelectOption;
  now: string;
  timeZone: string;
  storedStatus: RaidRecordRankStatus | null;
}) {
  if (!season.rankConfirmAt) {
    return <p className="mt-1 text-xs text-v2-fg-tertiary">잠정 순위로 저장돼요.</p>;
  }
  const confirmAt = formatRankConfirmAtWithWeekday(season.rankConfirmAt, timeZone);
  if (isInstantBefore(now, season.rankConfirmAt)) {
    return (
      <p className="mt-1 flex items-start gap-1.5 text-xs text-v2-fg-secondary">
        <ClockIcon className="mt-px size-3.5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
        <span>
          잠정 순위로 저장되며, 순위는 <span className="font-semibold tabular-nums">{confirmAt}</span>에 확정돼요.
        </span>
      </p>
    );
  }
  if (storedStatus === "provisional") {
    return (
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-v2-fg-secondary">
        <RankStatusPill status="provisional" />
        <span>
          <span className="tabular-nums">{confirmAt}</span> 전에 입력한 순위예요. 지금 확인해 저장하면 확정 순위가 돼요.
        </span>
      </p>
    );
  }
  return null;
}

function EliminationScores({
  season,
  scores,
  scoreErrors,
  serverErrorFor,
  parties,
  studentsByUid,
  stacked,
  onChange,
  onShowParties,
}: {
  season: RaidSeasonSelectOption;
  scores: ScoreDraft;
  scoreErrors: Partial<Record<RaidRecordDefenseType, string>>;
  serverErrorFor: (defenseType: RaidRecordDefenseType) => string | null;
  parties: readonly RaidFormParty[];
  studentsByUid: RaidPartyEditorContext["studentsByUid"];
  stacked: boolean;
  onChange: (defenseType: RaidRecordDefenseType, value: number | null) => void;
  onShowParties: (defenseType: RaidRecordDefenseType) => void;
}) {
  const entries = season.scoreDefenseTypes.map(({ defenseType }) => ({ defenseType, score: scores[defenseType] ?? null }));
  const entered = entries.filter((entry) => entry.score !== null) as { defenseType: RaidRecordDefenseType; score: number }[];
  const total = getRaidRecordTotalScore(entered);
  const gridClassName = "grid items-center gap-x-3 gap-y-1 grid-cols-[6.5rem_minmax(0,12.5rem)] sm:grid-cols-[7.5rem_12.5rem_minmax(0,10.5rem)_minmax(0,1fr)]";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div aria-hidden="true" className={cn(gridClassName, "hidden text-xs font-semibold text-v2-fg-secondary sm:grid")}>
        <span>방어 타입</span>
        <span className="pr-2.5 text-right">점수</span>
        <span>난이도 · 클리어 시간</span>
        <span>편성</span>
      </div>
      {entries.map(({ defenseType, score }) => {
        const error = scoreErrors[defenseType] ?? serverErrorFor(defenseType);
        const typeParties = parties.filter((party) => party.defenseType === defenseType);
        const students = typeParties.reduce((sum, party) => sum + raidFormPartyStudentCount(party), 0);
        const inputId = `elimination-score-${defenseType}`;
        return (
          <div key={defenseType} className={cn(gridClassName, "group/score")}>
            <label htmlFor={inputId} className="text-sm font-semibold text-v2-fg">
              <DefenseTypeLabel defenseType={defenseType} />
            </label>
            <DigitsInput
              id={inputId}
              value={score}
              onValueChange={(value) => onChange(defenseType, value)}
              invalid={Boolean(error)}
              aria-describedby={`${inputId}-hint`}
            />
            <div id={`${inputId}-hint`} className={cn("min-w-0", stacked && "col-start-2")}>
              {error ? (
                <FieldMessage message={error} />
              ) : score === null ? (
                <span className="text-xs text-v2-fg-tertiary">–</span>
              ) : (
                <ScorePreview score={score} bossUid={season.boss.uid} />
              )}
            </div>
            <div className={cn("min-w-0", stacked && "col-start-2")}>
              {typeParties.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onShowParties(defenseType)}
                  aria-label={`${defenseTypeLocale[defenseType]} 편성 보기, ${typeParties.length}파티 ${students}명`}
                  className={cn("inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md hover:opacity-80", v2FocusRing)}
                >
                  <PartyMiniRow party={typeParties[0]} studentsByUid={studentsByUid} />
                  <span className="text-xs whitespace-nowrap text-v2-fg-tertiary tabular-nums">
                    {typeParties.length}파티 · {students}명
                  </span>
                </button>
              ) : (
                <span className="text-xs text-v2-fg-tertiary">편성 없음</span>
              )}
            </div>
          </div>
        );
      })}
      <div className={cn(gridClassName, "border-t border-v2-divider pt-2")}>
        <span className="text-sm font-semibold text-v2-fg">합산</span>
        <span className="pr-2.5 text-right text-[0.9375rem] font-semibold text-v2-fg tabular-nums">
          {entered.length > 0 ? formatRaidScore(total) : "–"}
        </span>
      </div>
    </div>
  );
}

function DefenseTypeTabs({
  defenseTypes,
  value,
  counts,
  onChange,
}: {
  defenseTypes: readonly RaidRecordDefenseType[];
  value: RaidRecordDefenseType | null;
  counts: Record<string, number>;
  onChange: (defenseType: RaidRecordDefenseType) => void;
}) {
  return (
    <fieldset className="flex min-w-0 gap-1 overflow-x-auto border-0 border-b border-v2-divider p-0">
      <legend className="sr-only">방어 타입</legend>
      {defenseTypes.map((defenseType) => {
        const selected = defenseType === value;
        return (
          <button
            key={defenseType}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(defenseType)}
            className={cn(
              "flex min-h-v2-row-min shrink-0 cursor-pointer items-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap",
              selected ? "border-v2-link font-semibold text-v2-fg" : "border-transparent text-v2-fg-secondary hover:text-v2-fg",
              v2FocusRing,
            )}
          >
            <DefenseTypeLabel defenseType={defenseType} />
            <span className="text-xs font-normal text-v2-fg-tertiary tabular-nums">
              <span className="sr-only">파티 </span>
              {counts[defenseType] ?? 0}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

function PartyList({
  defenseType,
  raidType,
  parties,
  expandedPartyId,
  focusPartyId,
  onPartyFocused,
  context,
  onExpand,
  onChange,
  onRemove,
  onAdd,
}: {
  defenseType: RaidRecordDefenseType;
  raidType: RaidRecordRaidType;
  parties: readonly RaidFormParty[];
  expandedPartyId: string | null;
  focusPartyId: string | null;
  onPartyFocused: () => void;
  context: RaidPartyEditorContext;
  onExpand: (id: string) => void;
  onChange: (party: RaidFormParty) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  // One party shows its table at a time. Without a choice in this list, the first one does.
  const expandedId = parties.some((party) => party.id === expandedPartyId) ? expandedPartyId : (parties[0]?.id ?? null);
  const full = parties.length >= RAID_RECORD_LIMITS.partiesPerDefenseType;
  const prefix = raidType === "elimination" ? `${defenseTypeLocale[defenseType]} ` : "";
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {parties.map((party, index) => (
        <RaidPartyCard
          key={party.id}
          party={party}
          title={`${prefix}${index + 1}파티`}
          expanded={party.id === expandedId}
          focusSearch={party.id === focusPartyId}
          onSearchFocused={onPartyFocused}
          context={context}
          onExpand={() => onExpand(party.id)}
          onChange={onChange}
          onRemove={() => onRemove(party.id)}
        />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onAdd} disabled={full}>
          <PlusIcon className="size-4" aria-hidden="true" />
          파티 추가
        </Button>
        {full ? (
          <span className="text-xs text-v2-fg-tertiary">
            파티는 {RAID_RECORD_LIMITS.partiesPerDefenseType}개까지 추가할 수 있어요.
          </span>
        ) : null}
      </div>
    </div>
  );
}

