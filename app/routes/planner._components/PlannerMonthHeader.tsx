import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { Button } from "~/components/primitives";
import { GuestPlannerLegacyConflictCallout } from "~/components/features/futures";
import type { PlannerForecastStatus } from "./PlannerCalendarWeek";
import { PlannerPlanLegend } from "./PlannerPlanMarks";

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

export default function PlannerMonthHeader({
  month,
  forecastStatus,
  onPreviousMonth,
  onNextMonth,
  onToday,
  statusMessages,
  legacyConflictNotice,
}: {
  month: string;
  forecastStatus: PlannerForecastStatus;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  statusMessages: string[];
  legacyConflictNotice: { to?: string } | null;
}) {
  const noticeCount = statusMessages.length + (legacyConflictNotice ? 1 : 0);

  return (
    <header className="sticky top-0 z-30 space-y-1 bg-background/95 pb-2 backdrop-blur-sm max-sm:-mx-4 max-sm:px-4">
      <div className="flex min-h-8 items-center gap-1 max-[380px]:gap-0.5">
        <h2
          aria-live="polite"
          className="min-w-[6.6em] text-lg font-semibold tabular-nums text-foreground max-[380px]:min-w-[5.5em] max-[380px]:text-base"
        >
          {formatMonth(month)}
        </h2>
        <Button variant="default" size="sm" className="size-8 shrink-0 p-0" onClick={onPreviousMonth}>
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">이전 달</span>
        </Button>
        <Button variant="default" size="sm" className="size-8 shrink-0 p-0" onClick={onNextMonth}>
          <ChevronRightIcon className="size-4" aria-hidden="true" />
          <span className="sr-only">다음 달</span>
        </Button>
        <Button variant="default" text="오늘" size="sm" className="h-8 shrink-0 px-2" onClick={onToday} />
        {noticeCount > 0 ? (
          <Popover className="relative ml-auto shrink-0">
            <PopoverButton
              aria-label={`확인 필요 ${noticeCount}개`}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 max-[380px]:gap-0.5 max-[380px]:px-1 max-[380px]:text-[11px]"
            >
              <ExclamationTriangleIcon aria-hidden="true" className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
              <span>확인 필요</span>
              <span aria-hidden="true" className="inline-flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-[10px] tabular-nums text-amber-800 dark:text-amber-200">
                {noticeCount}
              </span>
            </PopoverButton>
            <PopoverPanel className="absolute right-0 top-full z-50 mt-2 max-h-[min(70dvh,32rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-xl">
              <h3 className="mb-2 text-sm font-semibold">확인 필요</h3>
              <div className="space-y-2">
                {statusMessages.map((message) => (
                  <div key={message} role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {message}
                  </div>
                ))}
                {legacyConflictNotice ? <GuestPlannerLegacyConflictCallout to={legacyConflictNotice.to} /> : null}
              </div>
            </PopoverPanel>
          </Popover>
        ) : null}
      </div>
      <div className="flex h-7 min-w-0 items-center justify-between gap-2">
        <PlannerPlanLegend />
        <div role="status" aria-live="polite" className="flex h-7 min-w-0 items-center justify-end">
          {forecastStatus === "pending" ? (
            <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground sm:text-xs">
              <ArrowPathIcon className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              예상 재화 계산 중
            </span>
          ) : forecastStatus === "input-needed" ? (
            <Link
              to="/utils/pyroxene"
              className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-xs"
            >
              <InformationCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
              보유 재화 입력 필요 · 입력하기
            </Link>
          ) : forecastStatus === "unavailable" ? (
            <span
              title="예상 재화 변동을 계산할 수 없어요. 입력을 확인하거나 다시 시도해주세요."
              className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] text-destructive sm:text-xs"
            >
              <ExclamationTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
              예상 재화 계산 실패
              <span className="sr-only">예상 재화 변동을 계산할 수 없어요. 입력을 확인하거나 다시 시도해주세요.</span>
            </span>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="pb-1 text-center text-xs font-medium text-muted-foreground">
            {weekday}
          </div>
        ))}
      </div>
    </header>
  );
}

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];
