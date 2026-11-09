import { ArrowPathIcon, ClockIcon, InformationCircleIcon, UserIcon } from "@heroicons/react/16/solid";
import { type FormEvent, useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { useSignIn } from "~/contexts/SignInProvider";
import { nowUtcIso } from "~/lib/date-time";
import type { EventShopPlanContext } from "~/lib/event-shop/plan-context";
import { cn } from "~/lib/utils";
import { treasureHuntLocale } from "~/locales/ko";
import { resourceShortfalls, resultSlotState, stageRunRows } from "./shop-model";
import { CurrencyIcon, formatCount } from "./shop-ui";

// The calculation result: required AP and how it splits, then whether each currency is enough. The stages to sweep
// are listed in the stage section, not here.
export function ShopResultContents({ plan }: { plan: EventShopPlanContext }) {
  const calculation = plan.stageCalculations;
  const slot = resultSlotState(plan);
  const recalculating = slot.kind === "ready" && plan.isCalculating;
  const rows = stageRunRows(plan);
  const shortfalls = resourceShortfalls(plan);
  const questRuns = rows.reduce((sum, row) => sum + row.runs, 0);
  const extraRuns = rows.reduce((sum, row) => sum + row.extraRuns, 0);
  const showDetails = slot.kind === "ready";
  const treasureNote =
    plan.resultTreasureHuntStatus === "provisional"
      ? treasureHuntLocale.provisionalResult
      : plan.resultTreasureHuntStatus === "round-limit"
        ? treasureHuntLocale.roundLimitResult
        : null;

  return (
    <div data-region="result-summary" aria-busy={recalculating || slot.kind === "waiting"}>
      <p className="text-xs text-v2-fg-tertiary">필요 AP</p>
      {slot.kind === "empty" ? (
        <>
          <p className="mt-1 text-[2rem] leading-[1.2] font-bold text-v2-fg-tertiary">—</p>
          <p className="mt-2 text-[0.8125rem] text-v2-fg-tertiary">살 아이템을 고르면 계산해요</p>
        </>
      ) : slot.kind === "waiting" ? (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-sm text-v2-fg-secondary">
          <ClockIcon className="size-4 shrink-0" aria-hidden="true" />
          {slot.text}
        </p>
      ) : slot.kind === "failed" ? (
        <div role="alert" className="mt-2 flex flex-col items-start gap-2">
          <p className="text-sm font-medium text-v2-danger">{slot.text}</p>
          <Button size="sm" onClick={slot.retry}>
            <ArrowPathIcon className="size-4" aria-hidden="true" />
            {slot.retryLabel}
          </Button>
        </div>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              "text-[2rem] leading-[1.2] font-bold tabular-nums",
              calculation.totalApWithExtras > 0 ? "text-v2-ap" : "text-v2-fg-tertiary",
              recalculating && "opacity-50",
            )}
          >
            {formatCount(calculation.totalApWithExtras)}
          </p>
          {recalculating ? (
            <span
              role="status"
              className="rounded-full bg-v2-inset px-2 py-0.5 text-xs font-medium text-v2-fg-secondary"
            >
              계산 중...
            </span>
          ) : null}
        </div>
      )}

      {showDetails ? (
        <div className={cn(recalculating && "opacity-50")}>
          <div className="mt-2 flex flex-col">
            <SummaryRow
              label={`필요 소탕 ${formatCount(questRuns)}회`}
              value={formatCount(calculation.questSweepAp)}
              strong
            />
            <SummaryRow label={`추가 소탕 ${formatCount(extraRuns)}회`} value={formatCount(calculation.extraSweepAp)} />
            <SummaryRow
              label="초회 보상"
              value={plan.state.includeFirstClear ? formatCount(calculation.firstClearAp) : "포함 안 함"}
            />
          </div>
          {treasureNote ? <p className="mt-3 text-xs text-v2-fg-secondary">{treasureNote}</p> : null}
          {plan.collectableResources.length > 0 ? (
            <>
              <hr className="mt-4 border-v2-divider" />
              <div className="mt-3">
                <p className="mb-1 text-xs text-v2-fg-tertiary">재화</p>
                <ul className="flex flex-col">
                  {plan.collectableResources.map((resource) => {
                    const shortfall = shortfalls[resource.uid];
                    return (
                      <li
                        key={`${resource.type}:${resource.uid}`}
                        className="flex min-h-[1.625rem] items-center justify-between gap-2 text-[0.8125rem]"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-v2-fg-secondary">
                          <CurrencyIcon uid={resource.uid} type={resource.type} imageUrl={resource.imageUrl} />
                          <span className="truncate">{resource.name}</span>
                        </span>
                        {shortfall ? (
                          <span className="shrink-0 font-semibold tabular-nums text-v2-danger">
                            {formatCount(shortfall)} 부족
                          </span>
                        ) : (
                          <span className="shrink-0 font-semibold text-v2-success">충분</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-h-[1.625rem] items-center justify-between gap-2 text-[0.8125rem]">
      <span className={strong ? "text-v2-fg-secondary" : "text-v2-fg-tertiary"}>{label}</span>
      <span className={cn("tabular-nums", strong ? "text-v2-fg-secondary" : "text-v2-fg-tertiary")}>{value}</span>
    </div>
  );
}

// Signed-out viewers keep the full result; this line only says what signing in adds.
export function ShopSignInNote() {
  const { showSignIn } = useSignIn();
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-xs text-v2-fg-secondary">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <UserIcon className="size-3.5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
        <span className="break-keep">로그인하면 계정 저장·보유 학생 반영</span>
      </span>
      <Button size="sm" variant="primary" onClick={showSignIn}>
        로그인
      </Button>
    </div>
  );
}

// The data accuracy note, with the report button for signed-in viewers.
export function ShopDataNote({ plan, eventName }: { plan: EventShopPlanContext; eventName: string }) {
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <div
      data-region="data-report"
      className="flex min-h-7 items-center justify-between gap-2 px-1 text-xs text-v2-fg-tertiary"
    >
      <span title="게임 데이터가 일본 서비스와 다를 수 있어요" className="inline-flex items-center gap-1.5">
        <InformationCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
        데이터가 부정확할 수 있어요
      </span>
      {plan.signedIn ? (
        <>
          <Button size="sm" onClick={() => setReportOpen(true)}>
            오류 제보
          </Button>
          <ShopReportDialog
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            eventName={eventName}
            buildPayload={() => ({
              timestamp: nowUtcIso(),
              eventUid: plan.eventUid,
              shopStateUid: plan.shopStateUid,
              savedShopStateSource: plan.savedShopStateSource,
              stages: plan.stages,
              shopResources: plan.shopResources,
              collectableResources: plan.collectableResources,
              stageCalculations: plan.stageCalculations,
              shopState: plan.state,
            })}
            eventUid={plan.eventUid}
          />
        </>
      ) : null}
    </div>
  );
}

export function ShopReportDialog({
  open,
  onClose,
  eventName,
  eventUid,
  buildPayload,
}: {
  open: boolean;
  onClose: () => void;
  eventName: string;
  eventUid: string;
  buildPayload: () => Record<string, unknown>;
}) {
  const reportFetcher = useFetcher<{ success?: boolean; error?: { content?: string } }>();
  const [description, setDescription] = useState("");
  const submitting = reportFetcher.state === "submitting";
  return (
    <Dialog open={open} onClose={onClose} title="데이터 오류 제보" size="sm">
      {reportFetcher.data?.success ? (
        <div className="space-y-3 text-sm text-v2-fg">
          <p className="text-v2-fg-secondary">제보를 보냈어요.</p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const body = new FormData();
            body.append("title", `이벤트 상점 계산기 오류 제보 (${eventUid})`);
            body.append("content", description.trim() || "추가 설명이 입력되지 않았습니다.");
            body.append(
              "additional",
              JSON.stringify({ type: "event_shop_bug_report", version: 1, payload: buildPayload() }),
            );
            reportFetcher.submit(body, { method: "post", action: "/contact" });
          }}
          className="space-y-3"
        >
          <p className="text-[0.8125rem] text-v2-fg-secondary">
            {eventName} 상점 계산기 · 지금 화면의 아이템·스테이지 정보가 함께 전달돼요.
          </p>
          <label className="block space-y-1.5 text-xs text-v2-fg-secondary">
            <span>어떤 점이 다른가요? (선택)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              rows={4}
              placeholder="예: 스테이지 9의 껍질 드롭이 게임과 달라요"
              className="w-full rounded-md border border-v2-control-border bg-v2-surface p-2 text-sm text-v2-fg placeholder:text-v2-fg-disabled focus:border-v2-control-border-strong"
            />
          </label>
          {reportFetcher.data?.error ? (
            <p role="alert" className="text-sm text-v2-danger">
              제보를 보내지 못했어요. 잠시 후 다시 시도해주세요.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button disabled={submitting} onClick={onClose}>
              취소
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "제출 중..." : "제출"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
