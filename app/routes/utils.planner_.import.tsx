import { ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon } from "@heroicons/react/20/solid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type LoaderFunctionArgs, type MetaFunction, redirect, useFetcher, useLocation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import Page from "~/components/features/layout/Page";
import { Button, Callout, SectionCard } from "~/components/primitives";
import type { EventShopState } from "~/domain/event-shop-state";
import {
  type AccountEventShopPlanLookup,
  compareGuestEventShopPlans,
  countUnresolvedGuestEventShopPlans,
  type GuestEventShopPlan,
  type GuestEventShopPlanComparison,
  removeGuestEventShopPlanIfUnchanged,
  upsertGuestEventShopPlan,
} from "~/domain/guest-event-shop-planner";
import type { GuestEventShopPlannerSnapshot } from "~/lib/guest-event-shop-planner.client";
import {
  readGuestEventShopPlanner,
  subscribeGuestEventShopPlanner,
  updateGuestEventShopPlanner,
} from "~/lib/guest-event-shop-planner.client";
import type {
  EventShopPlanDisplayCatalog,
  EventShopStateLookupResponse,
} from "~/routes/api.utils.planner.event-shop-states";

type SaveResult = {
  success?: boolean;
  error?: string;
};

export const meta: MetaFunction = () => [{ title: "이벤트 상점 계획 비교 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const user = await getActiveSensei(env, request);
  if (!user) return redirect("/unauthorized");
  return {};
};

function getSnapshotPlans(snapshot: GuestEventShopPlannerSnapshot | null): GuestEventShopPlan[] {
  if (snapshot?.status !== "ready" && snapshot?.status !== "memory" && snapshot?.status !== "conflict") return [];
  return Object.values(snapshot.envelope.data.plans);
}

function getLookupMap(response: EventShopStateLookupResponse | null): Record<string, AccountEventShopPlanLookup> {
  const lookups: Record<string, AccountEventShopPlanLookup> = {};
  for (const row of response?.states ?? []) {
    lookups[row.shopStateUid] =
      row.status === "available" ? { status: "available", state: row.state } : { status: "unavailable" };
  }
  return lookups;
}

function getDefaultStates(response: EventShopStateLookupResponse | null): Record<string, EventShopState> {
  const defaults: Record<string, EventShopState> = {};
  for (const row of response?.states ?? []) {
    if (row.status === "available" && row.defaultState) defaults[row.shopStateUid] = row.defaultState;
  }
  return defaults;
}

function getDisplayCatalogMap(response: EventShopStateLookupResponse | null) {
  const catalogs: Record<string, EventShopPlanDisplayCatalog | null> = {};
  for (const row of response?.states ?? []) {
    if (row.status === "available") catalogs[row.shopStateUid] = row.displayCatalog;
  }
  return catalogs;
}

function getVisibleName(names: Record<string, string> | undefined, uid: string, unavailable: string): string {
  return names?.[uid]?.trim() || unavailable;
}

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("ko-KR").format(quantity);
}

function formatStudents(uids: readonly string[], catalog: EventShopPlanDisplayCatalog | null): string {
  if (uids.length === 0) return "선택한 학생 없음";
  return uids.map((uid) => getVisibleName(catalog?.studentNamesByUid, uid, "학생 이름을 확인할 수 없어요")).join(" · ");
}

type PlanReviewSection = { title: string; lines: string[] };

function getKeyedLines(lines: readonly string[]) {
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const occurrence = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrence + 1);
    return { key: `${line}:${occurrence}`, line };
  });
}

function getPlanReviewSections(
  state: EventShopState,
  catalog: EventShopPlanDisplayCatalog | null,
): PlanReviewSection[] {
  const itemUids = new Set([...Object.keys(state.itemQuantities), ...Object.keys(state.itemPurchaseDays)]);
  const purchaseLines = [...itemUids]
    .filter((uid) => (state.itemQuantities[uid] ?? 0) > 0 || (state.itemPurchaseDays[uid] ?? 0) > 0)
    .map((uid) => {
      const name = getVisibleName(catalog?.shopItemNamesByUid, uid, "상점 아이템 이름을 확인할 수 없어요");
      const quantity = state.itemQuantities[uid] ?? 0;
      const days = state.itemPurchaseDays[uid] ?? 0;
      return `${name}: ${days > 0 ? `하루 ${formatQuantity(quantity)}회 · ${formatQuantity(days)}일` : `${formatQuantity(quantity)}회`}`;
    });

  const ownedLines = Object.entries(state.existingPaymentItemQuantities)
    .filter(([, quantity]) => quantity > 0)
    .map(
      ([uid, quantity]) =>
        `${getVisibleName(catalog?.resourceNamesByUid, uid, "재화 이름을 확인할 수 없어요")}: ${formatQuantity(quantity)}개`,
    );
  const overrideLines = Object.entries(state.overriddenRequiredQuantities).map(
    ([uid, quantity]) =>
      `${getVisibleName(catalog?.resourceNamesByUid, uid, "목표 재화 이름을 확인할 수 없어요")}: ${formatQuantity(quantity)}개`,
  );

  const bonusMode = state.bonusStudentSelectionMode === "shared" ? "공통 선택" : "재화별 선택";
  const bonusItemUids = [
    ...new Set([
      ...Object.keys(catalog?.bonusResourceNamesByUid ?? {}),
      ...Object.keys(state.selectedBonusStudentUidsByItem),
    ]),
  ];
  const bonusLines =
    state.bonusStudentSelectionMode === "shared" || bonusItemUids.length === 0
      ? [formatStudents(state.selectedBonusStudentUids, catalog)]
      : bonusItemUids.map((uid) => {
          const resourceName = getVisibleName(
            catalog?.bonusResourceNamesByUid,
            uid,
            "보너스 재화 이름을 확인할 수 없어요",
          );
          const studentUids = state.selectedBonusStudentUidsByItem[uid] ?? state.selectedBonusStudentUids;
          return `${resourceName}: ${formatStudents(studentUids, catalog)}`;
        });

  const stageLines = (catalog?.sweepStageUids ?? []).map((uid) => {
    const stageName = getVisibleName(catalog?.stageLabelsByUid, uid, "스테이지 정보를 확인할 수 없어요");
    return `${stageName}: ${state.enabledStages[uid] ? "선택" : "해제"}`;
  });
  const unknownStageCount = Object.keys(state.enabledStages).filter((uid) => !catalog?.stageLabelsByUid[uid]).length;
  if (unknownStageCount > 0) stageLines.push(`${unknownStageCount}개 스테이지의 선택 상태를 확인할 수 없어요`);
  const extraRunLines = Object.entries(state.extraStageRuns)
    .filter(([, runs]) => runs > 0)
    .map(
      ([uid, runs]) =>
        `${getVisibleName(catalog?.stageLabelsByUid, uid, "스테이지 정보를 확인할 수 없어요")}: 추가 ${formatQuantity(runs)}회`,
    );

  const paymentModeLabel = {
    expected: "기대 비용",
    min: "최소 비용",
    max: "최대 비용",
  }[state.minigamePaymentQuantityMode];
  const minigameLine =
    catalog && !catalog.hasMinigame
      ? state.minigamePlayCount > 0
        ? `미니게임 정보를 확인할 수 없어요 · ${formatQuantity(state.minigamePlayCount)}회`
        : "미니게임 계획 없음"
      : `${formatQuantity(state.minigamePlayCount)}회 · ${formatQuantity(state.minigameStartRound)}라운드부터 · ${paymentModeLabel}`;

  return [
    { title: "상점 구매 목표", lines: purchaseLines.length > 0 ? purchaseLines : ["구매 목표 없음"] },
    { title: "현재 보유 재화", lines: ownedLines.length > 0 ? ownedLines : ["보유 재화 입력 없음"] },
    { title: "직접 입력한 목표 수량", lines: overrideLines.length > 0 ? overrideLines : ["직접 입력한 목표 없음"] },
    {
      title: "보너스 학생",
      lines: [
        `선택 방식: ${bonusMode}`,
        `보유 학생 반영: ${state.includeRecruitedStudents ? "포함" : "미포함"}`,
        ...bonusLines,
      ],
    },
    {
      title: "스테이지 계획",
      lines: [
        `스토리 / 초회 보상: ${state.includeFirstClear ? "포함" : "미포함"}`,
        ...(stageLines.length > 0 ? stageLines : ["퀘스트 스테이지 정보가 없어요"]),
        ...(extraRunLines.length > 0 ? extraRunLines : ["추가 소탕 입력 없음"]),
      ],
    },
    { title: "미니게임", lines: [minigameLine] },
  ];
}

async function clearGuestPlanAfterConfirmation(plan: GuestEventShopPlan): Promise<boolean> {
  try {
    const result = await updateGuestEventShopPlanner((data) => removeGuestEventShopPlanIfUnchanged(data, plan));
    if (result.status === "ready" && !result.envelope.data.plans[plan.shopStateUid]) return true;

    if (result.status === "memory") {
      await updateGuestEventShopPlanner((data) => {
        const current = data.plans[plan.shopStateUid];
        if (current) return data;
        return upsertGuestEventShopPlan(data, plan);
      });
    }
  } catch {
    return false;
  }
  return false;
}

export default function EventShopPlanImportPage() {
  const location = useLocation();
  const focusTimelineUid = new URLSearchParams(location.search).get("event");
  const [snapshot, setSnapshot] = useState<GuestEventShopPlannerSnapshot | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [comparisonResponse, setComparisonResponse] = useState<EventShopStateLookupResponse | null>(null);
  const [isComparingAccountPlans, setIsComparingAccountPlans] = useState(false);
  const [lastMessage, setLastMessage] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const requestCounterRef = useRef(0);
  const requestedPlanSignatureRef = useRef<string | null>(null);
  const planRowRefs = useRef(new Map<string, HTMLElement>());
  const compareAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const refresh = () => setSnapshot(readGuestEventShopPlanner());
    refresh();
    return subscribeGuestEventShopPlanner(refresh);
  }, []);

  useEffect(() => () => compareAbortControllerRef.current?.abort(), []);

  const plans = useMemo(() => getSnapshotPlans(snapshot), [snapshot]);
  const planSignature = useMemo(
    () => JSON.stringify(plans.map(({ timelineUid, shopStateUid }) => ({ timelineUid, shopStateUid }))),
    [plans],
  );

  const submitComparison = useCallback(async (guestPlans: GuestEventShopPlan[], signature: string) => {
    const id = `event-shop-${Date.now()}-${++requestCounterRef.current}`;
    requestedPlanSignatureRef.current = signature;
    setRequestId(id);
    setCompareError(null);
    setComparisonResponse(null);
    setIsComparingAccountPlans(true);
    compareAbortControllerRef.current?.abort();
    const controller = new AbortController();
    compareAbortControllerRef.current = controller;

    try {
      const states: EventShopStateLookupResponse["states"] = [];
      for (let start = 0; start < guestPlans.length; start += 500) {
        const events = guestPlans.slice(start, start + 500).map(({ timelineUid, shopStateUid }) => ({
          timelineUid,
          shopStateUid,
        }));
        const response = await fetch("/api/utils/planner/event-shop-states", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: id, events }),
          signal: controller.signal,
        });
        const result = (await response.json()) as EventShopStateLookupResponse;
        if (!response.ok || !result.success || result.requestId !== id) {
          throw new Error(result.error ?? "계정 상점 계획을 확인하지 못했어요. 다시 시도해주세요.");
        }
        states.push(...result.states);
      }

      if (compareAbortControllerRef.current !== controller) return;
      setComparisonResponse({ success: true, requestId: id, states });
    } catch (error) {
      if (controller.signal.aborted) return;
      setCompareError(
        error instanceof Error ? error.message : "계정 상점 계획을 확인하지 못했어요. 다시 시도해주세요.",
      );
    } finally {
      if (compareAbortControllerRef.current === controller) {
        compareAbortControllerRef.current = null;
        setIsComparingAccountPlans(false);
      }
    }
  }, []);

  useEffect(() => {
    if (plans.length === 0) {
      compareAbortControllerRef.current?.abort();
      setComparisonResponse(null);
      setCompareError(null);
      setIsComparingAccountPlans(false);
      requestedPlanSignatureRef.current = null;
      setRequestId(null);
      return;
    }
    if (requestedPlanSignatureRef.current !== planSignature) void submitComparison(plans, planSignature);
  }, [planSignature, plans, submitComparison]);

  const response = comparisonResponse?.requestId === requestId ? comparisonResponse : null;

  useEffect(() => {
    if (!focusTimelineUid) return;
    const focusedPlan = plans.find(({ timelineUid }) => timelineUid === focusTimelineUid);
    if (!focusedPlan) return;
    planRowRefs.current.get(focusedPlan.timelineUid)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusTimelineUid, plans]);

  const registerPlanRow = useCallback((timelineUid: string, element: HTMLElement | null) => {
    if (element) planRowRefs.current.set(timelineUid, element);
    else planRowRefs.current.delete(timelineUid);
  }, []);

  const lookupByShopStateUid = useMemo(() => getLookupMap(response?.success ? response : null), [response]);
  const defaultsByShopStateUid = useMemo(() => getDefaultStates(response?.success ? response : null), [response]);
  const displayCatalogByShopStateUid = useMemo(
    () => getDisplayCatalogMap(response?.success ? response : null),
    [response],
  );
  const comparisons = useMemo(
    () => (response?.success ? compareGuestEventShopPlans(plans, lookupByShopStateUid, defaultsByShopStateUid) : []),
    [defaultsByShopStateUid, lookupByShopStateUid, plans, response?.success],
  );
  const unresolvedCount = useMemo(
    () =>
      response?.success
        ? countUnresolvedGuestEventShopPlans(plans, lookupByShopStateUid, defaultsByShopStateUid)
        : plans.length,
    [defaultsByShopStateUid, lookupByShopStateUid, plans, response?.success],
  );
  const eventNames = useMemo(
    () => new Map((response?.states ?? []).map((row) => [row.shopStateUid, row.eventName?.trim() || null])),
    [response],
  );
  const isComparing = plans.length > 0 && (isComparingAccountPlans || (!response && !compareError));

  const handlePlanResolved = useCallback((result: { ok: boolean; imported: boolean; eventName: string }) => {
    setLastMessage(
      result.ok
        ? {
            tone: "success",
            text: result.imported
              ? `${result.eventName} 게스트 계획을 계정에 저장하고 이 브라우저에서 정리했어요.`
              : `${result.eventName} 계정 계획을 유지하고 이 브라우저의 사본을 정리했어요.`,
          }
        : {
            tone: "warning",
            text: `${result.eventName} 계획을 저장소에서 정리하지 못했어요. 게스트 입력은 유지했어요.`,
          },
    );
  }, []);

  const refreshComparison = () => {
    if (plans.length > 0) void submitComparison(plans, planSignature);
  };

  return (
    <Page
      title="이벤트 상점 계획 비교"
      description="이 브라우저에 저장된 상점 계획을 계정 계획과 이벤트별로 비교해요. 현재 달 밖의 계획도 여기에 표시돼요."
      backward={{ title: "통합 플래너로 돌아가기", to: "/utils/planner" }}
    >
      <div className="space-y-4 pb-8">
        {snapshot?.status === "memory" && (
          <Callout
            tone="warning"
            Icon={ExclamationCircleIcon}
            title="브라우저에 저장되지 않은 임시 계획이 있어요"
            description="현재 탭에는 남아 있지만 새로고침 후 사라질 수 있어요. 계획을 가져오거나 유지하기 전에 브라우저 저장 상태를 확인해주세요."
          />
        )}
        {snapshot?.status === "conflict" && (
          <Callout
            tone="warning"
            Icon={ExclamationCircleIcon}
            title="다른 탭에서 상점 계획이 바뀌었어요"
            description="동시에 변경된 계획은 덮어쓰지 않았어요. 최신 계획을 다시 읽은 뒤 비교해주세요."
          />
        )}
        {snapshot?.status === "corrupt" && (
          <Callout
            tone="destructive"
            Icon={ExclamationCircleIcon}
            title="게스트 상점 계획을 읽을 수 없어요"
            description="저장된 데이터가 손상되어 계획을 읽지 못했어요. 원본 데이터는 브라우저에 그대로 남아 있어요."
          />
        )}
        {snapshot?.status === "unavailable" && (
          <Callout
            tone="destructive"
            Icon={ExclamationCircleIcon}
            title="브라우저 상점 계획 저장소를 사용할 수 없어요"
            description="저장 공간에 접근할 수 없어 게스트 계획을 확인하지 못했어요."
          />
        )}
        {lastMessage && <Callout tone={lastMessage.tone} Icon={CheckCircleIcon} description={lastMessage.text} />}

        <SectionCard
          title={`검토할 게스트 상점 계획 · ${response?.success ? comparisons.length : plans.length}개`}
          description={
            response?.success
              ? `검토가 필요한 계획 ${unresolvedCount}개. 같은 이벤트의 상점 계획은 한 번만 셉니다.`
              : "계정 계획과 비교할 수 없는 경우에도 게스트 입력은 그대로 보존돼요."
          }
          action={
            <Button
              type="button"
              text={isComparingAccountPlans ? "확인 중…" : "계정 계획 다시 확인"}
              size="sm"
              variant="secondary"
              onClick={refreshComparison}
              disabled={plans.length === 0 || isComparingAccountPlans}
            />
          }
        >
          {snapshot === null ? (
            <div aria-busy="true" className="text-sm text-muted-foreground" role="status">
              게스트 계획을 불러오고 있어요…
            </div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">비교할 게스트 상점 계획이 없어요.</p>
          ) : (
            <div className="space-y-3">
              {compareError && <Callout tone="warning" Icon={ExclamationCircleIcon} description={compareError} />}
              {isComparing && (
                <div aria-busy="true" className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <ArrowPathIcon className="size-4 animate-spin" /> 계정 계획을 확인하고 있어요…
                </div>
              )}
              {response?.success && comparisons.length === 0 && (
                <p className="text-sm text-muted-foreground">아직 입력된 게스트 상점 계획이 없어요.</p>
              )}
              {comparisons.map((comparison) => (
                <GuestEventShopPlanRow
                  key={comparison.plan.shopStateUid}
                  comparison={comparison}
                  eventName={eventNames.get(comparison.plan.shopStateUid) ?? null}
                  displayCatalog={displayCatalogByShopStateUid[comparison.plan.shopStateUid] ?? null}
                  focused={comparison.plan.timelineUid === focusTimelineUid}
                  onResolved={handlePlanResolved}
                  registerElement={registerPlanRow}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </Page>
  );
}

function GuestEventShopPlanRow({
  comparison,
  eventName,
  displayCatalog,
  focused,
  onResolved,
  registerElement,
}: {
  comparison: GuestEventShopPlanComparison;
  eventName: string | null;
  displayCatalog: EventShopPlanDisplayCatalog | null;
  focused: boolean;
  onResolved: (result: { ok: boolean; imported: boolean; eventName: string }) => void;
  registerElement: (timelineUid: string, element: HTMLElement | null) => void;
}) {
  const fetcher = useFetcher<SaveResult>();
  const importPendingRef = useRef(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const plan = comparison.plan;
  const name = eventName ?? "이벤트 정보를 확인할 수 없어요";
  const busy = fetcher.state !== "idle" || isClearing;

  const clearGuestCopy = useCallback(
    async (imported: boolean) => {
      setIsClearing(true);
      try {
        const removed = await clearGuestPlanAfterConfirmation(plan);
        setRowError(
          removed
            ? null
            : imported
              ? "계정에는 저장됐지만 이 브라우저 계획은 지워지지 않았어요. 게스트 입력은 유지했어요."
              : "이 브라우저 계획을 지우지 못했어요. 게스트 입력은 유지했어요.",
        );
        onResolved({ ok: removed, imported, eventName: name });
      } finally {
        setIsClearing(false);
      }
    },
    [name, onResolved, plan],
  );

  useEffect(() => {
    if (fetcher.state !== "idle" || !importPendingRef.current) return;
    importPendingRef.current = false;
    if (fetcher.data?.success) {
      void clearGuestCopy(true);
    } else {
      setRowError(fetcher.data?.error ?? "요청을 완료하지 못했어요. 게스트 계획은 그대로 남아 있어요.");
    }
  }, [clearGuestCopy, fetcher.data, fetcher.state]);

  const keepAccountPlan = () => {
    void clearGuestCopy(false);
  };

  const importGuestPlan = () => {
    setRowError(null);
    importPendingRef.current = true;
    fetcher.submit(
      { save: plan.state, replace: true },
      {
        method: "post",
        action: `/api/events/${encodeURIComponent(plan.timelineUid)}/shop-state`,
        encType: "application/json",
      },
    );
  };

  const statusLabel = {
    identical: "계정 계획과 같아요",
    "guest-only": "계정에 계획이 없어요",
    different: "계정 계획과 내용이 달라요",
    unavailable: "계정 계획을 확인할 수 없어요",
  }[comparison.status];

  return (
    <article
      ref={(element) => registerElement(plan.timelineUid, element)}
      className={`space-y-3 rounded-lg border p-4 ${focused ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 className="font-semibold text-foreground">{name}</h3>
          <p className="text-sm text-muted-foreground">{statusLabel}</p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {comparison.status === "unavailable" ? "확인 필요" : comparison.status === "identical" ? "동일" : "검토 필요"}
        </span>
      </div>

      <div className="grid gap-2 text-sm md:grid-cols-2">
        {comparison.accountState ? (
          <PlanSummary
            title="계정 계획"
            state={comparison.accountState}
            displayCatalog={displayCatalog}
            expanded={comparison.status === "different"}
          />
        ) : null}
        <PlanSummary
          title="이 브라우저 계획"
          state={plan.state}
          displayCatalog={displayCatalog}
          expanded={comparison.status !== "identical"}
        />
      </div>

      {rowError && <Callout tone="warning" description={rowError} />}

      <div className="flex flex-wrap justify-end gap-2">
        {comparison.status === "different" || comparison.status === "identical" ? (
          <Button text="계정 계획 유지" size="sm" variant="secondary" onClick={keepAccountPlan} disabled={busy} />
        ) : null}
        {comparison.status === "different" || comparison.status === "guest-only" ? (
          <Button
            text={busy ? "저장 중…" : "게스트 계획 가져오기"}
            size="sm"
            variant="primary"
            onClick={importGuestPlan}
            disabled={busy}
          />
        ) : null}
      </div>
    </article>
  );
}

function describePlan(state: EventShopState): string {
  const itemCount = Object.values(state.itemQuantities).filter((quantity) => quantity > 0).length;
  const stageCount = Object.values(state.enabledStages).filter(Boolean).length;
  const currencyCount = Object.values(state.existingPaymentItemQuantities).filter((quantity) => quantity > 0).length;
  return `${itemCount}개 구매 목표 · ${stageCount}개 선택 스테이지 · ${currencyCount}개 보유 재화 입력`;
}

function PlanSummary({
  title,
  state,
  displayCatalog,
  expanded,
}: {
  title: string;
  state: EventShopState;
  displayCatalog: EventShopPlanDisplayCatalog | null;
  expanded: boolean;
}) {
  const sections = getPlanReviewSections(state, displayCatalog);
  return (
    <details open={expanded} className="rounded-md bg-muted/40 p-3">
      <summary className="cursor-pointer list-inside list-disc">
        <span className="font-medium text-foreground">{title}</span>
        <span className="ml-2 text-xs text-muted-foreground">{describePlan(state)}</span>
      </summary>
      {!displayCatalog && (
        <p className="mt-2 text-xs text-muted-foreground">
          이벤트 상점 이름 정보를 확인할 수 없어 일부 항목을 이름 확인 불가로 표시했어요.
        </p>
      )}
      <div className="mt-3 space-y-3">
        {sections.map((section) => (
          <section key={section.title}>
            <h4 className="text-xs font-semibold text-muted-foreground">{section.title}</h4>
            <ul className="mt-1 space-y-1 text-sm text-foreground">
              {getKeyedLines(section.lines).map(({ key, line }) => (
                <li key={`${section.title}:${key}`} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
