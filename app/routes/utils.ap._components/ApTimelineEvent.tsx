import { BoltIcon } from "@heroicons/react/16/solid";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { BottomSheet, Button, Callout, Input, SectionCard } from "~/components/primitives";
import type { ApPlannerCalculation, ApPlannerEvent, ApPlannerEventPlan, ApRefillSuggestion } from "~/domain/ap-planner";
import { formatApDate, formatApShortDate } from "~/domain/ap-planner";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import type { RunType } from "~/domain/timeline-content";
import dayjs from "~/lib/dayjs";
import { eventIconImageUrl } from "~/models/assets";
import PlannerEventThumbnail from "~/components/features/planner/PlannerEventThumbnail";
import ApComparisonBar from "./ApComparisonBar";
import ApDisclosureButton from "./ApDisclosureButton";
import ApRefillTile from "./ApRefillTile";
import ApResultSummary from "./ApResultSummary";
import ApStockpileSteps from "./ApStockpileSteps";

const KST = "Asia/Seoul";

function eventRunTypeLabel(runType?: RunType | null) {
  if (runType === "first") return "최초";
  if (runType === "rerun") return "복각";
  return null;
}

type Props = {
  event: Pick<ApPlannerEvent, "timelineUid" | "name" | "startAt" | "exchangeUntil"> & {
    runType?: RunType | null;
    endAt: string | null;
    contentUid: string | null;
  };
  calculation: ApPlannerCalculation | null;
  calculationError?: string | null;
  rewardDataPending?: boolean;
  shopTargetExists: boolean;
  plan: ApPlannerEventPlan | null;
  options: PyroxenePlannerOptions;
  actionError?: string | null;
  disabled?: boolean;
  deepLink?: boolean;
  onAddPlanWithAccessAt: (accessAt: string) => Promise<boolean>;
  onRemovePlan: () => void;
  onSaveAccessAt: (accessAt: string) => Promise<boolean>;
  onApplyException: (suggestion: ApRefillSuggestion) => void;
  onRemoveException: (uid: string) => void;
  onOpenConditions: () => void;
};

function BasisLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 text-sm">
      <span className="min-w-0 text-muted-foreground break-keep">{label}</span>
      <span className="shrink-0 text-right tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

function ResultBasisControls({
  expanded,
  controls,
  onToggle,
}: {
  expanded: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-4">
      <ApDisclosureButton expanded={expanded} controls={controls} onClick={onToggle}>
        계산 근거
      </ApDisclosureButton>
    </div>
  );
}

function CalculationBasisRows({
  calculation,
  expanded,
  controls,
  showStockpile,
}: {
  calculation: ApPlannerCalculation;
  expanded: boolean;
  controls: string;
  showStockpile: boolean;
}) {
  const requiredRows = [
    { label: "스토리 초회", value: calculation.requiredBreakdown.firstClearAp },
    { label: "퀘스트 소탕", value: calculation.requiredBreakdown.questSweepAp },
    { label: "추가 소탕", value: calculation.requiredBreakdown.extraSweepAp },
  ].filter((row) => row.value !== 0);
  const supply = calculation.supplyBreakdown;
  const supplyRows = supply
    ? [
        ...(showStockpile ? [{ label: "시작 전 모은 AP", value: supply.stockpile }] : []),
        { label: "자연 회복", value: supply.natural },
        { label: "카페", value: supply.cafe },
        { label: `일일 미션 (${supply.dailyTaskDays}일)`, value: supply.dailyTasks },
        ...(supply.apPackage > 0 ? [{ label: "2주 AP 패키지", value: supply.apPackage }] : []),
        { label: "AP 충전", value: supply.apCharges },
        ...(supply.tacticalApShopCount > 0 ? [{ label: "전술 대회 AP 구매", value: supply.tacticalApShop }] : []),
      ]
    : [];
  const availableAp = calculation.availableAp;

  return (
    <div
      id={controls}
      className={expanded ? "grid w-full min-w-0 grid-cols-1 gap-4 break-keep md:grid-cols-2 md:gap-6" : "hidden"}
    >
      <section className="min-w-0 space-y-2">
        <div className="flex justify-between gap-3 text-sm font-semibold">
          <h4>필요</h4>
          <span className="shrink-0 text-right tabular-nums">{calculation.requiredAp.toLocaleString()}</span>
        </div>
        <div className="space-y-1">
          {requiredRows.map((row) => (
            <BasisLine key={row.label} {...row} />
          ))}
        </div>
      </section>
      {supply && availableAp !== null ? (
        <section className="min-w-0 space-y-2">
          <div className="flex justify-between gap-3 text-sm font-semibold">
            <h4>확보 가능</h4>
            <span className="shrink-0 text-right tabular-nums">{availableAp.toLocaleString()}</span>
          </div>
          <div className="space-y-1">
            {supplyRows.map((row) => (
              <BasisLine key={row.label} {...row} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function EventIdentity({ event, planned }: { event: Props["event"]; planned: boolean }) {
  const imageUrl = eventIconImageUrl(event.contentUid, "kr");
  const fallbackImageUrl = eventIconImageUrl(event.contentUid, "jp");
  const runTypeLabel = eventRunTypeLabel(event.runType);
  return (
    <div className="flex min-w-0 items-start gap-3">
      <PlannerEventThumbnail
        imageUrl={imageUrl}
        fallbackImageUrl={fallbackImageUrl}
        recoverPreloadedFailure
        showSurfaceUntilLoaded
        className="md:size-12"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">
            {runTypeLabel ? `${runTypeLabel} · ` : ""}{formatApShortDate(event.startAt)} ~ {event.endAt ? formatApShortDate(event.endAt) : ""}
          </span>
          {event.exchangeUntil ? (
            <span className="whitespace-nowrap">· 교환 ~{formatApDate(event.exchangeUntil)}</span>
          ) : null}
          {planned ? (
            <span className="hidden items-center gap-1 font-medium text-green-700 dark:text-green-400 md:inline-flex">
              <BoltIcon aria-hidden="true" className="size-3" /> AP 모으기 계산
            </span>
          ) : null}
        </div>
        <h3 className="mt-1 text-base font-semibold break-keep">{event.name}</h3>
        {planned ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 md:hidden">
            <BoltIcon aria-hidden="true" className="size-3" /> AP 모으기 계산
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function ApTimelineEvent({
  event,
  calculation,
  calculationError,
  rewardDataPending = false,
  shopTargetExists,
  plan,
  options,
  actionError,
  disabled = false,
  deepLink = false,
  onAddPlanWithAccessAt,
  onRemovePlan,
  onSaveAccessAt,
  onApplyException,
  onRemoveException,
  onOpenConditions,
}: Props) {
  const articleRef = useRef<HTMLElement>(null);
  const [accessSheetMode, setAccessSheetMode] = useState<"add-plan" | "add-access-time" | "edit-access-time" | null>(
    null,
  );
  const [showBasis, setShowBasis] = useState(false);
  const basisId = useId();
  const [accessDate, setAccessDate] = useState("");
  const [accessTime, setAccessTime] = useState("");
  const [accessSaving, setAccessSaving] = useState(false);

  useEffect(() => {
    if (!deepLink) return;
    articleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    articleRef.current?.focus({ preventScroll: true });
  }, [deepLink]);

  const planned = plan !== null;
  const exceptions = options.consumption.apChargeExceptions;
  const accessAt = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(accessDate) || !/^\d{2}:\d{2}$/.test(accessTime)) return null;
    const value = dayjs.tz(`${accessDate}T${accessTime}:00`, KST);
    return value.isValid() ? value.toISOString() : null;
  }, [accessDate, accessTime]);
  const canSaveAccess = Boolean(
    accessAt &&
      event.endAt &&
      Date.parse(accessAt) >= Date.parse(event.startAt) &&
      Date.parse(accessAt) < Date.parse(event.endAt),
  );

  const openAccessSheet = (mode: "add-plan" | "add-access-time" | "edit-access-time") => {
    const initial = mode === "edit-access-time" && plan?.accessAt ? plan.accessAt : event.startAt;
    setAccessDate(dayjs(initial).tz(KST).format("YYYY-MM-DD"));
    setAccessTime(dayjs(initial).tz(KST).format("HH:mm"));
    setAccessSheetMode(mode);
  };

  const isReady = calculation?.status === "ready" || calculation?.status === "ongoing";
  const hasVerdict = Boolean(
    isReady &&
      calculation?.resultAp !== null &&
      calculation?.resultAp !== undefined &&
      calculation.availableAp !== null,
  );
  const displayResult = hasVerdict ? calculation?.resultAp : null;
  const accessibleResult =
    displayResult === null || displayResult === undefined
      ? rewardDataPending
        ? "보상 데이터 준비 중"
        : calculationError
          ? "계산할 수 없음"
        : calculation?.status === "input-needed"
          ? "플레이 조건 입력 필요"
          : calculation?.status === "not-planned"
            ? "AP 모으기 계산 필요"
            : "접속할 시각 입력 필요"
      : `${Math.abs(displayResult).toLocaleString()} AP ${displayResult < 0 ? "부족" : "여유"}`;
  const accessibleName = `이벤트 ${event.name}, 필요 AP ${calculation?.requiredAp.toLocaleString() ?? "확인할 수 없음"}, ${accessibleResult}`;

  const removePlan = () => onRemovePlan();
  const cardHeader = <EventIdentity event={event} planned={planned} />;
  const runTypeLabel = eventRunTypeLabel(event.runType);

  if (!shopTargetExists && !calculationError) {
    return (
      <article
        ref={articleRef}
        tabIndex={-1}
        aria-label={`이벤트 ${event.name}, 상점 목표 없음${planned ? ", AP 모으기 계산 등록됨" : ""}`}
        className="scroll-m-24"
        data-ap-event-uid={event.timelineUid}
      >
        <SectionCard className="p-3 md:p-4">
          <div className="flex min-w-0 items-start gap-3">
            <PlannerEventThumbnail
              imageUrl={eventIconImageUrl(event.contentUid, "kr")}
              fallbackImageUrl={eventIconImageUrl(event.contentUid, "jp")}
              recoverPreloadedFailure
              showSurfaceUntilLoaded
              className="md:size-12"
            />
            <div className="flex min-w-0 flex-1 items-start justify-between gap-2 sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                  <span className="whitespace-nowrap">
                    {runTypeLabel ? `${runTypeLabel} · ` : ""}{formatApShortDate(event.startAt)} ~
                  </span>
                  {event.endAt ? (
                    <span className="-ml-1.5 whitespace-nowrap">
                      {"\u00a0"}
                      {formatApShortDate(event.endAt)}
                    </span>
                  ) : null}
                  {event.exchangeUntil ? (
                    <span className="whitespace-nowrap">· 교환 ~{formatApDate(event.exchangeUntil)}</span>
                  ) : null}
                </p>
                <h3 className="mt-1 text-sm font-semibold break-keep">{event.name}</h3>
                <p className="text-xs text-muted-foreground">상점 목표 없음</p>
              </div>
              <div className="flex shrink-0 gap-2">
                {planned ? (
                  <Button text="모으기 계산 취소" size="xs" variant="secondary" disabled={disabled} onClick={removePlan} />
                ) : null}
                <Button
                  text="상점 목표 등록"
                  size="xs"
                  variant="secondary"
                  to={`/events/${encodeURIComponent(event.timelineUid)}/shop`}
                />
              </div>
            </div>
          </div>
        </SectionCard>
      </article>
    );
  }

  if (calculationError) {
    const invalidTarget = shopTargetExists;
    const errorName = rewardDataPending
      ? `이벤트 ${event.name}, ${calculationError}`
      : `이벤트 ${event.name}, ${invalidTarget ? "계산할 수 없어요" : "불러오지 못했어요"}, ${calculationError}`;
    return (
      <article
        ref={articleRef}
        tabIndex={-1}
        aria-label={errorName}
        className="scroll-m-24"
        data-ap-event-uid={event.timelineUid}
      >
        <SectionCard className="space-y-4 p-5 md:p-6">
          {cardHeader}
          <ApResultSummary
            kind={rewardDataPending ? "pending" : invalidTarget ? "error" : "loading-error"}
            message={calculationError}
          />
          {actionError ? <Callout tone="destructive" title={actionError} /> : null}
          <div className="flex flex-wrap justify-end gap-2">
            {plan ? (
              <Button text="모으기 계산 취소" size="sm" variant="secondary" disabled={disabled} onClick={removePlan} />
            ) : null}
            {invalidTarget ? (
              <Button
                text="상점 목표 수정"
                size="sm"
                variant="primary"
                disabled={disabled}
                to={`/events/${encodeURIComponent(event.timelineUid)}/shop`}
              />
            ) : null}
          </div>
        </SectionCard>
      </article>
    );
  }

  const requiredOnly =
    calculation?.status === "input-needed" ||
    calculation?.status === "not-planned" ||
    calculation?.status === "access-time-needed";
  const pendingCaption =
    calculation?.status === "input-needed"
      ? "계정 레벨과 카페 랭크를 입력하면 확보 가능한 AP를 계산해요."
      : calculation?.status === "not-planned"
        ? "AP 모으기 계산을 등록하면 확보 가능한 AP를 계산해요."
        : calculation?.status === "access-time-needed"
          ? "접속할 시각을 입력하면 확보 가능한 AP와 AP 모으기 순서를 계산해요."
          : null;
  const resultIsOngoing = calculation?.status === "ongoing";
  const refillApplied = (suggestion: ApRefillSuggestion) =>
    exceptions.find(
      (exception) =>
        exception.startDate === suggestion.startDate &&
        exception.endDate === suggestion.endDate &&
        exception.count === suggestion.toCount,
    ) ?? null;
  const orderedRefillSuggestions = (calculation?.refillSuggestions ?? [])
    .filter((suggestion) => !(calculation?.accessTimePassed && suggestion.kind === "stockpile-day"))
    .sort((left, right) => {
      const kindOrder = { "event-period": 0, "stockpile-day": 1 };
      return (
        kindOrder[left.kind] - kindOrder[right.kind] ||
        left.startDate.localeCompare(right.startDate) ||
        left.endDate.localeCompare(right.endDate)
      );
    });
  const firstUnappliedIndex = orderedRefillSuggestions.findIndex((suggestion) => !refillApplied(suggestion));
  const showRefills = Boolean(
    calculation &&
      (calculation.refillSuggestions.length > 0 ||
        calculation.refillOverlapConflict ||
        (calculation.resultAp !== null && calculation.resultAp < 0)),
  );
  const refillSection =
    showRefills && calculation ? (
      <section className="space-y-3">
        <div className="space-y-0.5">
          <h4 className="text-sm font-semibold">AP 충전으로 채우기</h4>
          <p className="text-xs text-muted-foreground">적용하면 청휘석 플래너 설정에 반영돼요</p>
        </div>
        {calculation.refillOverlapConflict && !actionError?.includes("겹쳐") ? (
          <Callout tone="info" title="기간별 AP 충전 예외가 겹쳐 적용할 수 없어요.">
            <Link className="underline" to="/utils/pyroxene">
              청휘석 플래너에서 기존 예외를 수정해주세요.
            </Link>
          </Callout>
        ) : null}
        {orderedRefillSuggestions.length > 0 ? (
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            {orderedRefillSuggestions.map((suggestion, index) => {
              const applied = refillApplied(suggestion);
              return (
                <ApRefillTile
                  key={`${suggestion.kind}:${suggestion.startDate}:${suggestion.endDate}`}
                  suggestion={suggestion}
                  requiredAp={calculation.requiredAp}
                  applied={applied !== null}
                  disabled={disabled}
                  applyVariant={index === firstUnappliedIndex ? "primary" : "secondary"}
                  onApply={() => onApplyException(suggestion)}
                  onUndo={() => applied && onRemoveException(applied.uid)}
                />
              );
            })}
          </div>
        ) : calculation.refillOverlapConflict ? null : (
          <p className="text-sm text-muted-foreground">적용할 추가 AP 충전 제안이 없어요.</p>
        )}
      </section>
    ) : null;
  const stockpileSteps =
    (calculation?.status === "ready" || calculation?.status === "ongoing") &&
    plan?.accessAt &&
    calculation.accessTimePassed === false ? (
      <ApStockpileSteps
        calculation={calculation}
        eventStartAt={event.startAt}
        accessAt={plan.accessAt}
        disabled={disabled}
        initialExpanded={deepLink}
        onChangeAccessAt={() => openAccessSheet("edit-access-time")}
      />
    ) : null;

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      aria-label={accessibleName}
      className="scroll-m-24"
      data-ap-event-uid={event.timelineUid}
    >
      <SectionCard className="space-y-4 p-5 md:space-y-5 md:p-6">
        {cardHeader}

        {calculation ? (
          <section className={requiredOnly ? "space-y-0" : "space-y-3"}>
            {requiredOnly ? (
              <ApResultSummary kind="required" requiredAp={calculation.requiredAp} />
            ) : calculation.resultAp !== null ? (
              <ApResultSummary
                kind="result"
                resultAp={calculation.resultAp}
                message={resultIsOngoing ? "종료까지" : undefined}
              />
            ) : (
              <ApResultSummary kind="error" message="결과를 계산할 수 없어요." />
            )}
            {calculation.availableAp !== null && calculation.resultAp !== null ? (
              <>
                <ApComparisonBar requiredAp={calculation.requiredAp} availableAp={calculation.availableAp} />
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-sm text-muted-foreground">
                    확보 가능{" "}
                    <span className="font-semibold text-foreground">{calculation.availableAp.toLocaleString()}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="sr-only">, </span>
                    필요{" "}
                    <span className="font-semibold text-foreground">{calculation.requiredAp.toLocaleString()}</span>
                  </p>
                  {!requiredOnly ? (
                    <ResultBasisControls
                      expanded={showBasis}
                      controls={basisId}
                      onToggle={() => setShowBasis((value) => !value)}
                    />
                  ) : null}
                </div>
                {!requiredOnly ? (
                  <CalculationBasisRows
                    calculation={calculation}
                    expanded={showBasis}
                    controls={basisId}
                    showStockpile={Boolean(stockpileSteps)}
                  />
                ) : null}
                {resultIsOngoing ? (
                  <p className="text-xs text-muted-foreground">
                    현재 보유 AP와 오늘 일일 미션은 빼고, 오늘 AP 충전과 전술 대회 AP 구매는 아직 하지 않은 것으로
                    계산했어요.
                  </p>
                ) : null}
              </>
            ) : null}
            {requiredOnly && pendingCaption ? <p className="text-sm text-muted-foreground">{pendingCaption}</p> : null}
          </section>
        ) : null}

        {stockpileSteps && refillSection ? (
          <div className="space-y-6 md:space-y-1">
            {stockpileSteps}
            {refillSection}
          </div>
        ) : (
          stockpileSteps
        )}
        {!stockpileSteps ? refillSection : null}

        {actionError && !accessSheetMode ? <Callout tone="destructive" title={actionError} /> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            text="상점 계산기"
            size="sm"
            variant="secondary"
            to={`/events/${encodeURIComponent(event.timelineUid)}/shop`}
          />
          {calculation?.status === "input-needed" ? (
            <Button
              text="플레이 조건 입력"
              size="sm"
              variant="primary"
              disabled={disabled}
              onClick={onOpenConditions}
            />
          ) : null}
          {calculation?.status === "not-planned" ? (
            <Button
              text="AP 모으기 계산"
              size="sm"
              variant="primary"
              disabled={disabled}
              onClick={() => openAccessSheet("add-plan")}
            />
          ) : null}
          {calculation?.status === "access-time-needed" || (resultIsOngoing && planned && !plan?.accessAt) ? (
            <Button
              text="접속할 시각 입력"
              size="sm"
              variant="primary"
              disabled={disabled}
              onClick={() => openAccessSheet("add-access-time")}
            />
          ) : null}
        </div>
      </SectionCard>

      {accessSheetMode ? (
        <BottomSheet
          Icon={undefined}
          title={accessSheetMode === "add-plan" ? "AP 모으기 계산" : "접속할 시각"}
          description={event.name}
          fitContent
          onClose={() => setAccessSheetMode(null)}
          footer={
            <Button
              text={accessSheetMode === "add-plan" ? "추가" : "저장"}
              size="sm"
              variant="primary"
              fullWidth
              disabled={disabled || accessSaving || !canSaveAccess || accessAt === null}
              onClick={async () => {
                if (!accessAt || !canSaveAccess || accessSaving) return;
                setAccessSaving(true);
                const saved =
                  accessSheetMode === "add-plan"
                    ? await onAddPlanWithAccessAt(accessAt)
                    : await onSaveAccessAt(accessAt);
                setAccessSaving(false);
                if (saved) setAccessSheetMode(null);
              }}
            />
          }
        >
          <div className="min-w-0 space-y-4 pb-8 break-keep">
            {actionError ? (
              <p role="alert" className="text-sm text-destructive">
                {actionError}
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {accessSheetMode === "add-plan"
                ? "이벤트가 열린 뒤 처음 접속할 시간이에요. 이 시간 24시간 전부터 AP를 모아요."
                : "이벤트가 열린 뒤 처음 접속할 시간이에요."}
            </p>
            <div className="min-w-0 space-y-4">
              <Input
                label="날짜"
                type="date"
                value={accessDate}
                containerClassName="min-w-0 w-full"
                className="block min-w-0 w-full max-w-full"
                onChange={setAccessDate}
              />
              <Input
                label="시간"
                type="time"
                value={accessTime}
                containerClassName="min-w-0 w-full"
                className="block min-w-0 w-full max-w-full"
                onChange={setAccessTime}
              />
            </div>
            {!canSaveAccess && accessAt ? (
              <p role="alert" className="text-sm text-destructive">
                이벤트 시작 이후 종료 전 시각을 입력해주세요.
              </p>
            ) : null}
            {accessSheetMode !== "add-plan" ? (
              <button
                type="button"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                disabled={disabled || accessSaving}
                onClick={() => {
                  onRemovePlan();
                  setAccessSheetMode(null);
                }}
              >
                모으기 계산 취소
              </button>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}
    </article>
  );
}
