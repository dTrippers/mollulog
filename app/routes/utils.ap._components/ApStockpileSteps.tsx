import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { useEffect, useId, useState } from "react";
import { Callout } from "~/components/primitives";
import type { ApPlannerCalculation, ApPlannerConditions } from "~/domain/ap-planner";
import {
  cafeProduction,
  comfortMaximum,
  formatApDate,
  formatCafeApPerHour,
  maxApForAccountLevel,
} from "~/domain/ap-planner";
import type { PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import dayjs from "~/lib/dayjs";

const KST = "Asia/Seoul";

export function UnverifiedRuleHelp({
  label = "확인되지 않은 규칙 안내",
  message = "공식 확인이 되지 않은 커뮤니티 정보입니다. 계산 결과를 보장하는 규칙으로 사용하지 않아요.",
}: {
  label?: string;
  message?: string;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="inline-grid size-5 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        ?
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={`absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-md bg-popover p-3 text-xs font-normal text-popover-foreground shadow-lg ${open ? "block" : "hidden group-hover:block group-focus-within:block"}`}
      >
        {message}
      </span>
    </span>
  );
}

function CalculationConditions({
  conditions,
  options,
  exceptionCount,
}: {
  conditions: ApPlannerConditions;
  options: PyroxenePlannerOptions;
  exceptionCount: number;
}) {
  const cafe = conditions.cafeRank === null ? null : cafeProduction(conditions.cafeRank, conditions.comfort);
  const levelMax = conditions.accountLevel === null ? null : maxApForAccountLevel(conditions.accountLevel);
  return (
    <div className="space-y-2 rounded-md bg-muted/60 p-3 text-sm">
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          {levelMax === null
            ? "최대 AP와 레벨을 입력하지 않았어요."
            : `최대 AP ${levelMax} (계정 레벨 ${conditions.accountLevel})`}
        </li>
        <li>자연 회복은 6분마다 1 AP이며 최대 AP에서 멈춰요.</li>
        <li>
          {cafe
            ? `카페 시간당 약 ${formatCafeApPerHour(conditions.cafeRank as number, conditions.comfort)} AP (추정) · 보관 최대 ${cafe.storageMax}`
            : "카페 랭크를 입력하지 않았어요."}
        </li>
        <li>일일 과제 AP는 하루 150 AP (가정)</li>
        <li>
          매일 AP 충전은 청휘석 플래너의 {options.consumption.apChargeCount}회 설정
          {exceptionCount > 0 ? `(예외 ${exceptionCount}건 반영)` : ""}을 사용해요. (일일 초기화 오전 4시)
        </li>
        <li>
          999 이상 보유 시 충전 불가·우편함 (커뮤니티 정보) <UnverifiedRuleHelp />
        </li>
        <li>
          점검 중 자연 회복·카페 생산 여부는 확인되지 않았어요. <UnverifiedRuleHelp />
        </li>
        <li>AP 패키지로 받는 AP는 포함하지 않았어요.</li>
      </ul>
      {conditions.cafeRank !== null && conditions.comfort !== null ? (
        <p className="text-xs text-muted-foreground">
          편의성 최대 {comfortMaximum(conditions.cafeRank).toLocaleString()} · 카페 1호 생산량을 기준으로 추정해요.
        </p>
      ) : null}
    </div>
  );
}

export default function ApStockpileSteps({
  calculation,
  conditions,
  options,
  eventEndAt = null,
  initialExpanded = false,
  initialConditionsExpanded = false,
}: {
  calculation: ApPlannerCalculation;
  conditions: ApPlannerConditions;
  options: PyroxenePlannerOptions;
  eventEndAt?: string | null;
  initialExpanded?: boolean;
  initialConditionsExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [conditionsExpanded, setConditionsExpanded] = useState(initialConditionsExpanded);
  useEffect(() => setExpanded(initialExpanded), [initialExpanded]);
  const access = calculation.stockpileSteps.find((step) => step.kind === "access");
  const groups = new Map<string, typeof calculation.stockpileSteps>();
  for (const step of calculation.stockpileSteps) {
    const key = dayjs(step.at).tz(KST).format("YYYY-MM-DD");
    groups.set(key, [...(groups.get(key) ?? []), step]);
  }
  const accessDateKey = access ? dayjs(access.at).tz(KST).format("YYYY-MM-DD") : null;
  const startDateKey = calculation.stockpileStartsAt
    ? dayjs(calculation.stockpileStartsAt).tz(KST).format("YYYY-MM-DD")
    : null;
  const chargeWindowStartDate = startDateKey ?? accessDateKey;
  const chargeWindowEndDate = eventEndAt ? dayjs(eventEndAt).tz(KST).format("YYYY-MM-DD") : accessDateKey;
  const appliedExceptionCount = options.consumption.apChargeExceptions.filter(
    (exception) =>
      chargeWindowStartDate !== null &&
      chargeWindowEndDate !== null &&
      exception.startDate <= chargeWindowEndDate &&
      exception.endDate >= chargeWindowStartDate,
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">AP 모으기</p>
          <p className="text-sm text-muted-foreground">
            {calculation.status === "ongoing"
              ? "이벤트 종료까지 확보할 수 있는 AP를 계산해요"
              : access && calculation.stockpileStartsAt
                ? `${formatApDate(calculation.stockpileStartsAt)} ${dayjs(calculation.stockpileStartsAt).tz(KST).format("HH:mm")}부터 · 접속 시 약 ${access.ap.toLocaleString()} AP`
                : "접속 시간을 입력해주세요"}
          </p>
        </div>
        {calculation.status !== "ongoing" ? (
          <button
            type="button"
            aria-expanded={expanded}
            className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted px-2 py-1 text-xs font-medium hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "접기" : "순서 보기"}
            {expanded ? (
              <ChevronUpIcon aria-hidden="true" className="size-3.5" />
            ) : (
              <ChevronDownIcon aria-hidden="true" className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>
      {calculation.overlapEventName && calculation.status !== "ongoing" ? (
        <p className="text-xs text-muted-foreground">앞 이벤트({calculation.overlapEventName})가 끝난 뒤부터 모아요.</p>
      ) : null}
      {calculation.status === "ongoing" ? (
        <p className="text-xs text-muted-foreground">현재 보유 AP는 포함하지 않았어요.</p>
      ) : expanded ? (
        <Callout tone="default" className="p-3">
          <div className="space-y-2">
            <p className="text-sm font-normal text-muted-foreground">
              계산 방식 및 계정 상태에 따라 정확하지 않을 수 있어요.
            </p>
            <button
              type="button"
              aria-expanded={conditionsExpanded}
              className="inline-flex items-center gap-1 rounded-sm text-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              onClick={() => setConditionsExpanded((value) => !value)}
            >
              계산 조건 확인
              {conditionsExpanded ? (
                <ChevronUpIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              ) : (
                <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              )}
            </button>
            {conditionsExpanded ? (
              <CalculationConditions conditions={conditions} options={options} exceptionCount={appliedExceptionCount} />
            ) : null}
          </div>
          <ol className="mt-3 space-y-2">
            {[...groups.entries()].map(([dateKey, steps]) => {
              const daysBeforeAccess =
                accessDateKey === null
                  ? 1
                  : dayjs.tz(`${accessDateKey}T12:00:00`, KST).diff(dayjs.tz(`${dateKey}T12:00:00`, KST), "day");
              const label = dateKey === accessDateKey ? "· 시작" : `· D-${Math.max(1, daysBeforeAccess)}`;
              return (
                <li key={dateKey}>
                  <div className="flex items-center gap-3 pb-2 pt-3">
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {dayjs.tz(`${dateKey}T12:00:00`, KST).format("M/D (ddd)")} {label}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <ul className="space-y-1">
                    {steps.map((step) => (
                      <li
                        key={`${step.at}:${step.kind}`}
                        className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-baseline gap-2 px-2 py-1.5 text-sm"
                      >
                        <span className="font-medium tabular-nums">{dayjs(step.at).tz(KST).format("HH:mm")}</span>
                        <span className="min-w-0 break-keep text-muted-foreground">
                          {step.label}
                          {step.kind === "drain" ? (
                            <span className="ml-1 align-middle">
                              <UnverifiedRuleHelp
                                label="D-1 AP 사용 가정 안내"
                                message="시작 전 모은 AP를 계산하기 위해 D-1 시작에 AP를 모두 사용하고 이후 AP를 쓰지 않는다고 가정해요."
                              />
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={
                            step.kind === "access"
                              ? "whitespace-nowrap font-semibold tabular-nums text-foreground"
                              : "whitespace-nowrap text-xs tabular-nums text-muted-foreground"
                          }
                        >
                          {step.kind === "access"
                            ? `사용 가능 약 ${step.ap.toLocaleString()} AP`
                            : `보유 ${step.ap.toLocaleString()}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </Callout>
      ) : null}
    </div>
  );
}
