import { useEffect, useId, useState } from "react";
import { Button } from "~/components/primitives";
import type { ApPlannerCalculation } from "~/domain/ap-planner";
import { formatApDate, formatApShortDate } from "~/domain/ap-planner";
import dayjs from "~/lib/dayjs";
import ApDisclosureButton from "./ApDisclosureButton";

const KST = "Asia/Seoul";

function dayDifference(fromDate: string, toDate: string) {
  return dayjs.tz(`${fromDate}T12:00:00`, KST).diff(dayjs.tz(`${toDate}T12:00:00`, KST), "day");
}

export default function ApStockpileSteps({
  calculation,
  eventStartAt,
  accessAt,
  disabled = false,
  initialExpanded = false,
  onChangeAccessAt,
}: {
  calculation: ApPlannerCalculation;
  eventStartAt: string;
  accessAt: string;
  disabled?: boolean;
  initialExpanded?: boolean;
  onChangeAccessAt: () => void;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const listId = useId();
  useEffect(() => setExpanded(initialExpanded), [initialExpanded]);

  const accessStep = calculation.stockpileSteps.find((step) => step.kind === "access");
  const pendingNote = accessStep
    ? [
        accessStep.mailboxAp ? `우편함 ${accessStep.mailboxAp.toLocaleString()} AP` : null,
        accessStep.unclaimedCafeAp ? `카페 ${accessStep.unclaimedCafeAp.toLocaleString()} AP` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const accessDateKey = dayjs(accessAt).tz(KST).format("YYYY-MM-DD");
  const eventDateKey = dayjs(eventStartAt).tz(KST).format("YYYY-MM-DD");
  const groupedSteps = new Map<string, typeof calculation.stockpileSteps>();
  for (const step of calculation.stockpileSteps) {
    const dateKey = dayjs(step.at).tz(KST).format("YYYY-MM-DD");
    groupedSteps.set(dateKey, [...(groupedSteps.get(dateKey) ?? []), step]);
  }

  const stockpileStart = calculation.stockpileStartsAt;
  const startDateKey = stockpileStart ? dayjs(stockpileStart).tz(KST).format("YYYY-MM-DD") : null;
  const startDaysBeforeAccess = startDateKey ? dayDifference(accessDateKey, startDateKey) : null;
  const startLabel =
    startDaysBeforeAccess === null
      ? null
      : startDaysBeforeAccess === 1
        ? "하루 전"
        : startDaysBeforeAccess === 0
          ? accessDateKey === eventDateKey
            ? "개최일"
            : "접속일"
          : `${startDaysBeforeAccess}일 전`;
  const startValue =
    stockpileStart && startLabel
      ? `${startLabel} ${formatApDate(stockpileStart)} ${dayjs(stockpileStart).tz(KST).format("HH:mm")}`
      : "모을 수 없어요";

  return (
    <section className="space-y-3 break-keep">
      <h4 className="text-sm font-semibold">AP 모으기</h4>
      <dl className="space-y-2 text-sm sm:max-w-xl">
        <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3">
          <dt className="text-muted-foreground">모으기 시작</dt>
          <dd className="font-medium tabular-nums">{startValue}</dd>
        </div>
        <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] items-center gap-3">
          <dt className="text-muted-foreground">접속할 시각</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-2 font-medium tabular-nums">
            <span>{formatApShortDate(accessAt)}</span>
            <Button text="변경" size="xs" variant="secondary" disabled={disabled} onClick={onChangeAccessAt} />
          </dd>
        </div>
        {accessStep ? (
          <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3">
            <dt className="text-muted-foreground">접속 시</dt>
            <dd className="tabular-nums">
              <span className="font-semibold">약 {accessStep.ap.toLocaleString()} AP 보유</span>
              {pendingNote ? <span className="text-muted-foreground"> ({pendingNote} 포함)</span> : null}
            </dd>
          </div>
        ) : null}
      </dl>

      {calculation.overlapEventName ? (
        <p className="text-xs text-muted-foreground">
          {calculation.stockpileStartsAt
            ? `앞 이벤트(${calculation.overlapEventName})가 끝난 뒤부터 모아요.`
            : `앞 이벤트(${calculation.overlapEventName})가 접속할 시각 뒤에 끝나서 미리 모을 AP가 없어요.`}
        </p>
      ) : null}
      {calculation.stockpileStartPassed && calculation.stockpileStartsAt ? (
        <p className="text-xs text-muted-foreground">모으기 시작 시각이 지났어요. 그 뒤 AP를 쓰지 않았다고 가정해요.</p>
      ) : null}

      {calculation.stockpileSteps.length > 0 ? (
        <>
          <ApDisclosureButton expanded={expanded} controls={listId} onClick={() => setExpanded((value) => !value)}>
            모으기 순서 보기
          </ApDisclosureButton>
          <div id={listId} hidden={!expanded} className="space-y-4">
            <ol className="space-y-4">
              {[...groupedSteps.entries()].map(([dateKey, steps]) => {
                const date = dayjs.tz(`${dateKey}T12:00:00`, KST);
                const daysBeforeAccess = dayDifference(accessDateKey, dateKey);
                const dayLabel =
                  dateKey === accessDateKey
                    ? accessDateKey === eventDateKey
                      ? "개최일"
                      : "접속일"
                    : daysBeforeAccess === 1
                      ? "하루 전"
                      : `${Math.max(1, daysBeforeAccess)}일 전`;
                return (
                  <li key={dateKey} className="grid min-w-0 gap-1 md:grid-cols-[4.25rem_minmax(0,1fr)] md:gap-4">
                    <div className="md:pt-1">
                      <p className="whitespace-nowrap text-sm font-semibold text-foreground md:hidden">
                        {dayLabel} · {date.format("M/D(ddd)")}
                      </p>
                      <p className="hidden text-sm font-semibold text-foreground md:block">{dayLabel}</p>
                      <p className="hidden text-xs text-muted-foreground md:block">{date.format("M/D(ddd)")}</p>
                    </div>
                    <ul className="min-w-0 space-y-1">
                      {steps.map((step) => (
                        <li
                          key={`${step.at}:${step.kind}`}
                          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 gap-y-1 py-1 text-sm md:grid-cols-[3.5rem_minmax(0,1fr)_auto]"
                        >
                          <span className="font-medium tabular-nums">{dayjs(step.at).tz(KST).format("HH:mm")}</span>
                          <span className="min-w-0 text-muted-foreground">{step.label}</span>
                          <span
                            className={
                              step.kind === "access"
                                ? "whitespace-nowrap font-semibold tabular-nums"
                                : "whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                            }
                          >
                            {step.kind === "access"
                              ? `사용 가능 약 ${step.ap.toLocaleString()} AP`
                              : step.kind === "after-access"
                                ? `+${(step.receivedAp ?? 0).toLocaleString()} AP`
                                : step.kind === "mailbox"
                                ? `우편함 ${(step.mailboxAp ?? 0).toLocaleString()}`
                                : step.mailboxAp
                                  ? `보유 ${step.ap.toLocaleString()} · 우편함 ${step.mailboxAp.toLocaleString()}`
                                  : `보유 ${step.ap.toLocaleString()}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </div>
        </>
      ) : null}
    </section>
  );
}
