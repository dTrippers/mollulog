import { BoltIcon, ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { ClockIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { BottomSheet, Button, Callout, Input, SectionCard } from "~/components/primitives";
import type {
  ApPlannerCalculation,
  ApPlannerConditions,
  ApPlannerEvent,
  ApPlannerEventPlan,
  ApRefillSuggestion,
} from "~/domain/ap-planner";
import { formatApDate, formatApShortDate } from "~/domain/ap-planner";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import { apChargeExceptionRangesOverlap } from "~/domain/pyroxene-planner";
import dayjs from "~/lib/dayjs";
import ApStockpileSteps from "./ApStockpileSteps";

const KST = "Asia/Seoul";

type Props = {
  event: Pick<ApPlannerEvent, "timelineUid" | "name" | "startAt" | "exchangeUntil"> & { endAt: string | null };
  calculation: ApPlannerCalculation | null;
  calculationError?: string | null;
  shopTargetExists: boolean;
  plan: ApPlannerEventPlan | null;
  conditions: ApPlannerConditions;
  options: PyroxenePlannerOptions;
  actionError?: string | null;
  disabled?: boolean;
  deepLink?: boolean;
  onAddPlan: () => void;
  onRemovePlan: () => void;
  onSaveAccessAt: (accessAt: string) => void;
  onApplyException: (suggestion: ApRefillSuggestion) => void;
  onRemoveException: (uid: string) => void;
};

function ApChip() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-sm bg-green-500/10 px-1 text-xs font-medium text-green-600">
      <BoltIcon aria-hidden="true" className="size-3" />
      AP
    </span>
  );
}

function ApStats({ calculation, requiredOnly }: { calculation: ApPlannerCalculation; requiredOnly: boolean }) {
  const showResult = !requiredOnly && (calculation.status === "ready" || calculation.status === "ongoing");
  const needsConditions = calculation.status === "input-needed";
  const full = showResult || (needsConditions && !requiredOnly);
  return (
    <div
      className={`grid overflow-hidden rounded-md bg-muted ${requiredOnly ? "w-fit md:w-full" : "w-full"} ${full ? "grid-cols-3 divide-x divide-border md:grid-cols-1 md:divide-x-0 md:divide-y" : "grid-cols-1"}`}
    >
      <div className="min-w-0 p-2 md:p-3">
        <p className="text-xs text-muted-foreground">필요 AP</p>
        <p className="mt-1 flex min-w-0 items-center gap-1 font-bold tabular-nums md:gap-2">
          <ApChip />
          <span className="min-w-0 whitespace-nowrap text-sm min-[390px]:text-base md:text-lg">
            {calculation.requiredAp.toLocaleString()}
          </span>
        </p>
      </div>
      {full ? (
        <>
          <div className="min-w-0 p-2 md:p-3">
            <p className="text-xs text-muted-foreground">확보 가능한 AP</p>
            {showResult ? (
              <p className="mt-1 whitespace-nowrap font-semibold tabular-nums">
                {calculation.availableAp?.toLocaleString()}
              </p>
            ) : (
              <p className="mt-1 text-xs leading-snug text-muted-foreground">
                {needsConditions ? "플레이 조건을 입력해주세요" : "접속 시간을 입력해주세요"}
              </p>
            )}
          </div>
          <div className="min-w-0 p-2 md:p-3">
            <p className="text-xs text-muted-foreground">결과</p>
            {showResult && calculation.resultAp !== null ? (
              <p
                className={`mt-1 flex min-w-0 flex-wrap gap-x-1 text-sm font-semibold tabular-nums md:text-base ${calculation.resultAp < 0 ? "text-destructive" : "text-green-600"}`}
              >
                <span className="whitespace-nowrap">{Math.abs(calculation.resultAp).toLocaleString()}</span>
                <span className="whitespace-nowrap">{calculation.resultAp < 0 ? "부족" : "여유"}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">계산 대기</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function resultText(resultAp: number): string {
  return resultAp < 0 ? `${Math.abs(resultAp).toLocaleString()} 부족` : `${resultAp.toLocaleString()} 여유`;
}

function formatSuggestionDateRange(startDate: string, endDate: string): string {
  const start = dayjs.tz(`${startDate}T12:00:00`, KST).format("M/D");
  const end = dayjs.tz(`${endDate}T12:00:00`, KST).format("M/D");
  return startDate === endDate ? start : `${start}~${end}`;
}

function RefillRow({
  suggestion,
  applied,
  disabled,
  applyVariant,
  onApply,
  onUndo,
}: {
  suggestion: ApRefillSuggestion;
  applied: { uid: string } | null;
  disabled: boolean;
  applyVariant: "primary" | "secondary";
  onApply: () => void;
  onUndo: () => void;
}) {
  const title =
    suggestion.kind === "event-period"
      ? `이벤트 기간 매일 AP 충전 ${suggestion.fromCount}회 → ${suggestion.toCount}회`
      : `AP 모으는 날(${formatSuggestionDateRange(suggestion.startDate, suggestion.endDate)}) AP 충전 ${suggestion.toCount}회`;
  const refillDetails =
    suggestion.kind === "event-period"
      ? `+${suggestion.additionalAp.toLocaleString()} AP · 청휘석 ${suggestion.pyroxeneCost.toLocaleString()}개`
      : `+약 ${suggestion.additionalAp.toLocaleString()} AP · 청휘석 ${suggestion.pyroxeneCost.toLocaleString()}개`;
  const resultLabel = applied ? "적용 후" : "적용하면";
  const details = `${refillDetails} · ${resultLabel} ${resultText(-suggestion.deficitAfter)}`;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{applied ? `${details} · 청휘석 플래너에도 반영돼요` : details}</p>
      </div>
      {applied ? (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">적용됨</span>
          <Button text="되돌리기" size="xs" variant="secondary" disabled={disabled} onClick={onUndo} />
        </div>
      ) : (
        <Button text="적용" size="xs" variant={applyVariant} disabled={disabled} onClick={onApply} />
      )}
    </div>
  );
}

export default function ApTimelineEvent({
  event,
  calculation,
  calculationError,
  shopTargetExists,
  plan,
  conditions,
  options,
  actionError,
  disabled = false,
  deepLink = false,
  onAddPlan,
  onRemovePlan,
  onSaveAccessAt,
  onApplyException,
  onRemoveException,
}: Props) {
  const articleRef = useRef<HTMLElement>(null);
  const [showAccessSheet, setShowAccessSheet] = useState(false);
  const [showBasis, setShowBasis] = useState(false);
  const [didRemovePlan, setDidRemovePlan] = useState(false);
  const [removedPlanExceptionUids, setRemovedPlanExceptionUids] = useState<string[]>([]);
  const [accessDate, setAccessDate] = useState("");
  const [accessTime, setAccessTime] = useState("");

  useEffect(() => {
    if (!deepLink) return;
    articleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    articleRef.current?.focus({ preventScroll: true });
  }, [deepLink]);

  useEffect(() => {
    if (plan?.accessAt) {
      setAccessDate(dayjs(plan.accessAt).tz(KST).format("YYYY-MM-DD"));
      setAccessTime(dayjs(plan.accessAt).tz(KST).format("HH:mm"));
    } else {
      setAccessDate("");
      setAccessTime("");
    }
  }, [plan?.accessAt]);

  useEffect(() => {
    if (actionError) setDidRemovePlan(false);
  }, [actionError]);

  const accessAt = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(accessDate) || !/^\d{2}:\d{2}$/.test(accessTime)) return null;
    const value = dayjs.tz(`${accessDate}T${accessTime}:00`, KST);
    return value.isValid() ? value.toISOString() : null;
  }, [accessDate, accessTime]);
  const eventStartText = formatApShortDate(event.startAt);
  const eventEndText = event.endAt ? formatApShortDate(event.endAt) : "종료 시각 확인 중";
  const canSaveAccess = Boolean(
    accessAt &&
      event.endAt &&
      Date.parse(accessAt) >= Date.parse(event.startAt) &&
      Date.parse(accessAt) < Date.parse(event.endAt),
  );
  const accessibleResult =
    calculation?.resultAp === null || calculation?.resultAp === undefined
      ? "결과를 계산할 수 없음"
      : resultText(calculation.resultAp);
  const accessibleRequired = calculation
    ? `필요 AP ${calculation.requiredAp.toLocaleString()}`
    : "필요 AP를 계산할 수 없음";
  const accessibleName = `이벤트 ${event.name}, ${accessibleRequired}, ${accessibleResult}`;
  const planned = plan !== null;
  const requiredOnly = Boolean(
    calculation &&
      (calculation.status === "input-needed" || (calculation.status !== "ongoing" && (!planned || !plan?.accessAt))),
  );
  const exceptions = options.consumption.apChargeExceptions;
  const eventStartDate = dayjs(event.startAt).tz(KST).format("YYYY-MM-DD");
  const eventEndDate = event.endAt ? dayjs(event.endAt).tz(KST).format("YYYY-MM-DD") : null;
  const stockpileStartDate = calculation?.stockpileStartsAt
    ? dayjs(calculation.stockpileStartsAt).tz(KST).format("YYYY-MM-DD")
    : null;
  const eventDateRange = eventEndDate ? { startDate: eventStartDate, endDate: eventEndDate } : null;
  const stockpileDateRange = stockpileStartDate
    ? {
        startDate: stockpileStartDate,
        endDate: dayjs.tz(`${stockpileStartDate}T12:00:00`, KST).add(1, "day").format("YYYY-MM-DD"),
      }
    : null;
  const cardExceptionUids = exceptions
    .filter((exception) =>
      [eventDateRange, stockpileDateRange].some(
        (range) => range !== null && apChargeExceptionRangesOverlap(exception, range),
      ),
    )
    .map(({ uid }) => uid);
  const hasRemainingRemovedPlanException = removedPlanExceptionUids.some((uid) =>
    exceptions.some((exception) => exception.uid === uid),
  );
  const removalNotice =
    didRemovePlan && hasRemainingRemovedPlanException ? (
      <Callout tone="info" title="청휘석 플래너의 AP 충전 설정은 유지돼요">
        <Link className="underline" to="/utils/pyroxene">
          청휘석 플래너
        </Link>
      </Callout>
    ) : null;
  const removePlan = () => {
    setRemovedPlanExceptionUids(cardExceptionUids);
    onRemovePlan();
    setDidRemovePlan(true);
  };

  if (!shopTargetExists && !calculationError) {
    return (
      <article
        ref={articleRef}
        tabIndex={-1}
        aria-label={`이벤트 ${event.name}, 상점 목표가 없어 AP를 계산할 수 없어요${planned ? ", AP 모으기 계획에 추가됨" : ""}`}
        className="scroll-m-24"
        data-ap-event-uid={event.timelineUid}
      >
        <SectionCard className="p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>
                  {eventStartText} ~ {eventEndText} · 교환 ~
                  {event.exchangeUntil ? formatApDate(event.exchangeUntil) : "확인 중"}
                </span>
                {planned ? (
                  <span className="inline-flex items-center gap-0.5 font-medium text-green-600">
                    <BoltIcon aria-hidden="true" className="size-3" /> AP 모으기 계획
                  </span>
                ) : null}
              </div>
              <h3 className="mt-1 text-base font-semibold">{event.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">상점 계산기에서 목표를 정하면 필요 AP를 계산해요</p>
              {planned ? (
                <p className="mt-2 text-sm text-muted-foreground">상점 목표가 없어 AP 모으기 계산을 할 수 없어요.</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              {planned ? (
                <Button text="계획에서 빼기" size="xs" variant="secondary" disabled={disabled} onClick={removePlan} />
              ) : null}
              <Button
                text="상점 계산기"
                size="xs"
                variant="secondary"
                to={`/events/${encodeURIComponent(event.timelineUid)}/shop`}
              />
            </div>
          </div>
          {removalNotice}
        </SectionCard>
      </article>
    );
  }

  return (
    <article
      ref={articleRef}
      tabIndex={-1}
      aria-label={accessibleName}
      className="scroll-m-24"
      data-ap-event-uid={event.timelineUid}
    >
      <SectionCard className="p-4 md:p-5">
        <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_15rem] md:gap-5">
          <div className="min-w-0 space-y-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>
                  {eventStartText} ~ {eventEndText} · 교환 ~
                  {event.exchangeUntil ? formatApDate(event.exchangeUntil) : "확인 중"}
                </span>
                {planned ? (
                  <span className="inline-flex items-center gap-0.5 text-xs font-medium text-green-600">
                    <BoltIcon aria-hidden="true" className="size-3" /> AP 모으기 계획
                  </span>
                ) : null}
              </div>
              <h3 className="text-base font-semibold">{event.name}</h3>
            </div>

            {calculation?.status === "input-needed" ? (
              <p className="text-sm text-muted-foreground">플레이 조건을 입력하면 확보 가능한 AP를 계산해요.</p>
            ) : null}

            {calculation ? (
              <div className={requiredOnly ? "w-fit md:hidden" : "md:hidden"}>
                <ApStats calculation={calculation} requiredOnly={requiredOnly} />
              </div>
            ) : null}

            {calculationError ? <Callout tone="destructive" title={calculationError} /> : null}
            {actionError ? (
              <Callout tone="destructive" title={actionError}>
                {actionError.includes("겹쳐") ? (
                  <Link className="underline" to="/utils/pyroxene">
                    청휘석 플래너에서 기존 예외를 먼저 수정해주세요.
                  </Link>
                ) : null}
              </Callout>
            ) : null}

            {calculation?.status === "ready" && plan?.accessAt ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">접속 시간</p>
                    <p className="text-sm text-muted-foreground">{formatApShortDate(plan.accessAt)}</p>
                  </div>
                  <Button
                    text="변경"
                    size="xs"
                    variant="secondary"
                    disabled={disabled}
                    onClick={() => setShowAccessSheet(true)}
                  />
                </div>
                <ApStockpileSteps
                  calculation={calculation}
                  conditions={conditions}
                  options={options}
                  eventEndAt={event.endAt}
                  initialExpanded={deepLink}
                />
              </>
            ) : null}

            {planned && !plan?.accessAt && calculation?.status !== "ongoing" ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">접속 시간</p>
                  <p className="text-sm text-muted-foreground">입력하면 확보 가능한 AP와 AP 모으기 순서를 계산해요</p>
                </div>
                <Button
                  text="입력"
                  size="xs"
                  variant="primary"
                  disabled={disabled}
                  onClick={() => setShowAccessSheet(true)}
                />
              </div>
            ) : null}

            {!planned && calculation?.status !== "ongoing" ? (
              <p className="text-sm text-muted-foreground">
                계획에 추가하고 접속 시간을 입력하면 확보 가능한 AP와 AP 모으기 순서를 계산해요
              </p>
            ) : null}

            {calculation?.status === "ongoing" ? (
              <ApStockpileSteps
                calculation={calculation}
                conditions={conditions}
                options={options}
                eventEndAt={event.endAt}
                initialExpanded={deepLink}
              />
            ) : null}

            {calculation &&
            (calculation.refillSuggestions.length > 0 ||
              (calculation.resultAp !== null && calculation.resultAp < 0)) ? (
              <section className="space-y-1">
                <h4 className="text-sm font-medium">추가 확보</h4>
                {calculation.refillOverlapConflict && !actionError?.includes("겹쳐") ? (
                  <Callout tone="info" title="기간별 AP 충전 예외가 겹쳐 적용할 수 없어요.">
                    <Link className="underline" to="/utils/pyroxene">
                      청휘석 플래너에서 기존 예외를 먼저 수정해주세요.
                    </Link>
                  </Callout>
                ) : null}
                {calculation.refillSuggestions.length === 0 && !calculation.refillOverlapConflict ? (
                  <p className="text-sm text-muted-foreground">적용할 추가 AP 충전 제안이 없어요.</p>
                ) : null}
                {calculation.refillSuggestions.map((suggestion, suggestionIndex) => {
                  const existing = exceptions.find(
                    (exception) =>
                      exception.startDate === suggestion.startDate &&
                      exception.endDate === suggestion.endDate &&
                      exception.count === suggestion.toCount,
                  );
                  const applied = existing ?? null;
                  const firstUnappliedIndex = calculation.refillSuggestions.findIndex(
                    (candidate) =>
                      !exceptions.some(
                        (exception) =>
                          exception.startDate === candidate.startDate &&
                          exception.endDate === candidate.endDate &&
                          exception.count === candidate.toCount,
                      ),
                  );
                  return (
                    <RefillRow
                      key={`${suggestion.kind}:${suggestion.startDate}:${suggestion.endDate}`}
                      suggestion={suggestion}
                      applied={applied}
                      disabled={disabled}
                      applyVariant={suggestionIndex === firstUnappliedIndex ? "primary" : "secondary"}
                      onApply={() => onApplyException(suggestion)}
                      onUndo={() => applied && onRemoveException(applied.uid)}
                    />
                  );
                })}
              </section>
            ) : null}

            {removalNotice}
          </div>

          <aside className="flex min-w-0 flex-col gap-3 md:row-span-2">
            {calculation ? (
              <div className="hidden md:block">
                <ApStats calculation={calculation} requiredOnly={requiredOnly} />
              </div>
            ) : null}
            {calculation &&
            calculation.status !== "input-needed" &&
            (plan?.accessAt || calculation.status === "ongoing") &&
            canShowBasis(calculation) ? (
              <div className="order-1 flex flex-col gap-2 md:order-2">
                <button
                  type="button"
                  aria-expanded={showBasis}
                  className="flex items-center gap-1 self-end text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  onClick={() => setShowBasis((value) => !value)}
                >
                  계산 근거
                  {showBasis ? (
                    <ChevronUpIcon aria-hidden="true" className="size-3.5" />
                  ) : (
                    <ChevronDownIcon aria-hidden="true" className="size-3.5" />
                  )}
                </button>
                {showBasis ? (
                  <div className="space-y-1 rounded-md bg-muted/60 p-3 text-xs">
                    <p className="font-medium">필요 AP</p>
                    <BasisLine label="스토리/퀘스트 초회" value={calculation.requiredBreakdown.firstClearAp} />
                    <BasisLine label="퀘스트 소탕" value={calculation.requiredBreakdown.questSweepAp} />
                    <BasisLine label="추가 소탕" value={calculation.requiredBreakdown.extraSweepAp} />
                    {calculation.supplyBreakdown ? (
                      <>
                        <p className="mt-2 font-medium">확보 가능한 AP</p>
                        <BasisLine label="시작 전 모은 AP" value={calculation.supplyBreakdown.stockpile} />
                        <BasisLine
                          label={`자연 회복·카페·일일 과제 (${calculation.supplyBreakdown.dailyTaskDays}일)`}
                          value={
                            calculation.supplyBreakdown.natural +
                            calculation.supplyBreakdown.cafe +
                            calculation.supplyBreakdown.dailyTasks
                          }
                        />
                        <BasisLine label="AP 충전" value={calculation.supplyBreakdown.apCharges} />
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="order-2 mt-auto flex flex-wrap justify-end gap-2 md:order-3">
              {planned ? (
                <Button text="계획에서 빼기" size="xs" variant="secondary" disabled={disabled} onClick={removePlan} />
              ) : null}
              <Button
                text="상점 계산기"
                size="xs"
                variant="secondary"
                to={`/events/${encodeURIComponent(event.timelineUid)}/shop`}
              />
              {!planned ? (
                <Button
                  text="AP 모으기 계획에 추가"
                  size="xs"
                  variant="primary"
                  disabled={disabled}
                  onClick={() => {
                    setDidRemovePlan(false);
                    setRemovedPlanExceptionUids([]);
                    onAddPlan();
                  }}
                />
              ) : null}
            </div>
          </aside>
        </div>
      </SectionCard>
      {showAccessSheet ? (
        <BottomSheet
          Icon={ClockIcon}
          title="접속 시간"
          description={event.name}
          fitContent
          onClose={() => setShowAccessSheet(false)}
          footer={
            <Button
              text="저장"
              variant="primary"
              fullWidth
              disabled={disabled || !canSaveAccess || accessAt === null}
              onClick={() => {
                if (!accessAt) return;
                onSaveAccessAt(accessAt);
                setShowAccessSheet(false);
              }}
            />
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              이벤트가 열린 뒤 처음 접속할 시간을 입력해주세요. 점검 종료 시각은 이벤트마다 달라요.
            </p>
            <p className="text-sm text-muted-foreground">이벤트 시작 {eventStartText}</p>
            <Input label="날짜" type="date" value={accessDate} onChange={setAccessDate} />
            <Input label="시간" type="time" value={accessTime} onChange={setAccessTime} />
            {!canSaveAccess && accessAt ? (
              <p className="text-sm text-destructive">이벤트 시작 이후 종료 전 시각을 입력해주세요.</p>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}
    </article>
  );
}

function canShowBasis(calculation: ApPlannerCalculation) {
  return calculation.status !== "not-planned";
}

function BasisLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
