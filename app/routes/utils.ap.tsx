import { CalendarIcon, Cog6ToothIcon, CreditCardIcon } from "@heroicons/react/24/outline";
import { nanoid } from "nanoid/non-secure";
import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { calculateShopApRequirement } from "~/components/features/events/shop/calculations/calculate-shop-ap";
import {
  convertClueSearchCostsToPoints,
  filterClueSearchShopResources,
  resolveClueSearchExchange,
} from "~/components/features/events/shop/clue-search";
import { calculateBonusSummary } from "~/components/features/events/shop/hooks/useBonusCalculation";
import type { ShopState } from "~/components/features/events/shop/hooks/useShopState";
import { calculateMinigamePaymentCosts } from "~/components/features/events/shop/utils";
import { useGuestPlanner } from "~/components/features/futures";
import Page from "~/components/features/layout/Page";
import { Callout, EmptyView, Toggle } from "~/components/primitives";
import type {
  ApPlannerCalculation,
  ApPlannerEvent,
  ApPlannerEventPlan,
  ApPlannerState,
  ApRefillSuggestion,
} from "~/domain/ap-planner";
import {
  addApChargeException,
  calculateApPlannerEvent,
  comfortMaximum,
  createEmptyApPlannerState,
  hasApShopTarget,
  normalizeApPlannerState,
} from "~/domain/ap-planner";
import {
  addGuestPlannerApChargeException,
  guestPlannerEventShopPlans,
  removeGuestPlannerApChargeException,
  setGuestPlannerApChargeCount,
} from "~/domain/guest-planner";
import type { PlannerStateDocumentV1 } from "~/domain/planner-state";
import type { PyroxeneApChargeException } from "~/domain/pyroxene-planner";
import { defaultPyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import dayjs from "~/lib/dayjs";
import { getEventMetadata } from "~/models/event-content";
import { isPlannerStateRevisionConflictError, updateApPlannerState } from "~/models/planner-state";
import { updatePyroxenePlannerOptions } from "~/models/pyroxene-planner";
import { getTimelineContent } from "~/models/timeline-content.server";
import type { ApConditionField } from "~/routes/utils.ap._components/ApPlannerConditionsPanel";
import { ApPlannerConditionsPanelContent } from "~/routes/utils.ap._components/ApPlannerConditionsPanel";
import ApTimelineEvent from "~/routes/utils.ap._components/ApTimelineEvent";
import type { IntegratedPlannerShopEvent } from "~/views/integrated-planner";
import { getIntegratedPlannerData } from "~/views/integrated-planner";

const KST = "Asia/Seoul";
const AP_CHARGE_EXCEPTION_OVERLAP_MESSAGE =
  "기간이 기존 AP 충전 예외와 겹쳐 적용하지 못했어요. 청휘석 플래너에서 기존 예외를 먼저 수정해주세요.";

type ApActionResult = {
  success: boolean;
  intent?: string;
  eventUid?: string;
  error?: string;
  revisionConflict?: boolean;
};

type ApDisplayEvent = Pick<ApPlannerEvent, "timelineUid" | "name" | "startAt" | "exchangeUntil"> & {
  endAt: string | null;
  shop: IntegratedPlannerShopEvent;
};

type CalculatedApEvent = {
  event: ApDisplayEvent;
  calculation: ApPlannerCalculation | null;
  calculationError: string | null;
  shopTargetExists: boolean;
  plan: ApPlannerEventPlan | null;
  actionError: string | null;
};

export const meta: MetaFunction = () => [
  { title: "AP 플래너 | 몰루로그" },
  { name: "description", content: "이벤트 상점 목표에 필요한 AP와 AP 모으기 순서를 확인해보세요" },
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const user = await getActiveSensei(env, request);
  const planner = await getIntegratedPlannerData(env, user?.id ?? null, ctx);
  return { ...planner, signedIn: user !== null, now: new Date().toISOString() };
};

function actionResponse(
  success: boolean,
  intent: string,
  eventUid?: string,
  error?: string,
  status = 200,
  revisionConflict = false,
) {
  return data<ApActionResult>(
    {
      success,
      intent,
      ...(eventUid ? { eventUid } : {}),
      ...(error ? { error } : {}),
      ...(revisionConflict ? { revisionConflict: true } : {}),
    },
    { status },
  );
}

function formString(formData: FormData, key: string, maxLength = 512): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 && value.length <= maxLength ? value : null;
}

function formInteger(formData: FormData, key: string, minimum: number, maximum: number): number | null {
  const value = formData.get(key);
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

async function updateAccountApState<T>(
  env: Env,
  userId: number,
  update: (current: ApPlannerState) => { state: ApPlannerState; result: T },
  ctx?: ExecutionContext,
) {
  return updateApPlannerState(
    env,
    userId,
    async (_transaction, current) => {
      const result = update(current ?? createEmptyApPlannerState());
      return { state: result.state, result: result.result };
    },
    { ctx },
  );
}

async function canonicalShopEvent(env: Env, eventUid: string, ctx?: ExecutionContext) {
  const metadata = await getEventMetadata(env, eventUid, ctx);
  const content = await getTimelineContent(env, eventUid, { ctx });
  if (metadata?.contentType !== "event" || !metadata.shopAvailable || !content) return null;
  return content;
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const user = await getActiveSensei(env, request);
  const formData = await request.formData();
  const intent = formString(formData, "intent", 80);
  const eventUid = formString(formData, "eventUid", 200) ?? undefined;
  if (!intent) return actionResponse(false, "unknown", eventUid, "요청 내용을 확인해주세요.", 400);
  if (!user) return actionResponse(false, intent, eventUid, "로그인이 필요해요.", 401);

  try {
    if (intent === "save-condition") {
      const field = formString(formData, "field", 40) as ApConditionField | null;
      const rawValue = formData.get("value");
      if (!field || typeof rawValue !== "string")
        return actionResponse(false, intent, undefined, "플레이 조건을 확인해주세요.", 400);
      if (field === "apChargeCount") {
        const count = formInteger(formData, "value", 0, 20);
        if (count === null) return actionResponse(false, intent, undefined, "AP 충전 횟수를 확인해주세요.", 400);
        await updatePyroxenePlannerOptions(
          env,
          user.id,
          (current) => ({
            options: { ...current, consumption: { ...current.consumption, apChargeCount: count } },
            result: undefined,
          }),
          { ctx },
        );
        return actionResponse(true, intent);
      }
      const value =
        rawValue === ""
          ? null
          : formInteger(
              formData,
              "value",
              field === "accountLevel" ? 1 : 0,
              field === "accountLevel" ? 90 : field === "cafeRank" ? 10 : 5_500,
            );
      if (rawValue !== "" && value === null)
        return actionResponse(false, intent, undefined, "입력한 플레이 조건을 확인해주세요.", 400);
      await updateAccountApState(
        env,
        user.id,
        (current) => {
          const next: ApPlannerState = { ...current };
          if (field === "accountLevel") next.accountLevel = value;
          else if (field === "cafeRank") {
            next.cafeRank = value;
            next.comfort =
              value === null
                ? null
                : current.comfort === null
                  ? comfortMaximum(value)
                  : Math.min(current.comfort, comfortMaximum(value));
          } else if (field === "comfort") {
            if (current.cafeRank === null) throw new Error("카페 랭크를 먼저 입력해주세요.");
            next.comfort = value === null ? comfortMaximum(current.cafeRank) : value;
          } else {
            throw new Error("플레이 조건을 확인해주세요.");
          }
          const normalized = normalizeApPlannerState(next);
          if (!normalized) throw new Error("입력한 플레이 조건을 확인해주세요.");
          return { state: normalized, result: undefined };
        },
        ctx,
      );
      return actionResponse(true, intent);
    }

    if (intent === "add-plan" || intent === "remove-plan") {
      if (!eventUid) return actionResponse(false, intent, undefined, "이벤트를 확인해주세요.", 400);
      if (intent === "add-plan") {
        if (!(await canonicalShopEvent(env, eventUid, ctx)))
          return actionResponse(false, intent, eventUid, "이벤트 상점 정보를 확인할 수 없어요.", 404);
      }
      await updateAccountApState(
        env,
        user.id,
        (current) => {
          const eventPlans = { ...current.eventPlans };
          if (intent === "add-plan") {
            if (!Object.hasOwn(eventPlans, eventUid) && Object.keys(eventPlans).length >= 500) {
              throw new Error("AP 모으기 계획이 너무 많아요.");
            }
            eventPlans[eventUid] ??= { accessAt: null };
          } else {
            delete eventPlans[eventUid];
          }
          return { state: { ...current, eventPlans }, result: undefined };
        },
        ctx,
      );
      return actionResponse(true, intent, eventUid);
    }

    if (intent === "save-access-time") {
      const rawAccessAt = formString(formData, "accessAt", 40);
      if (!eventUid || !rawAccessAt || !Number.isFinite(Date.parse(rawAccessAt))) {
        return actionResponse(false, intent, eventUid, "접속 시간을 확인해주세요.", 400);
      }
      const content = await canonicalShopEvent(env, eventUid, ctx);
      if (!content?.startAt || !content.endAt) {
        return actionResponse(false, intent, eventUid, "이벤트 시작·종료 시각을 확인할 수 없어요.", 400);
      }
      if (
        Date.parse(rawAccessAt) < Date.parse(content.startAt) ||
        Date.parse(rawAccessAt) >= Date.parse(content.endAt)
      ) {
        return actionResponse(false, intent, eventUid, "이벤트 시작 이후 종료 전 시각을 입력해주세요.", 400);
      }
      await updateAccountApState(
        env,
        user.id,
        (current) => {
          const plan = current.eventPlans[eventUid];
          if (!plan) throw new Error("먼저 AP 모으기 계획에 추가해주세요.");
          return {
            state: {
              ...current,
              eventPlans: {
                ...current.eventPlans,
                [eventUid]: { ...plan, accessAt: new Date(rawAccessAt).toISOString() },
              },
            },
            result: undefined,
          };
        },
        ctx,
      );
      return actionResponse(true, intent, eventUid);
    }

    if (intent === "apply-charge-exception") {
      const startDate = formString(formData, "startDate", 10);
      const endDate = formString(formData, "endDate", 10);
      const count = formInteger(formData, "count", 0, 20);
      const uid = formString(formData, "uid", 128);
      const exception: PyroxeneApChargeException | null =
        startDate && endDate && count !== null && uid ? { uid, startDate, endDate, count } : null;
      if (
        !exception ||
        !startDate ||
        !endDate ||
        startDate > endDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
      ) {
        return actionResponse(false, intent, eventUid, "AP 충전 예외를 확인해주세요.", 400);
      }
      await updatePyroxenePlannerOptions(
        env,
        user.id,
        (current) => {
          const result = addApChargeException(current.consumption.apChargeExceptions, exception);
          if (result.overlap) throw new Error(AP_CHARGE_EXCEPTION_OVERLAP_MESSAGE);
          return {
            options: { ...current, consumption: { ...current.consumption, apChargeExceptions: result.exceptions } },
            result: undefined,
          };
        },
        { ctx },
      );
      return actionResponse(true, intent, eventUid);
    }

    if (intent === "remove-charge-exception") {
      const uid = formString(formData, "uid", 128);
      if (!uid) return actionResponse(false, intent, eventUid, "AP 충전 예외를 확인해주세요.", 400);
      await updatePyroxenePlannerOptions(
        env,
        user.id,
        (current) => ({
          options: {
            ...current,
            consumption: {
              ...current.consumption,
              apChargeExceptions: current.consumption.apChargeExceptions.filter((exception) => exception.uid !== uid),
            },
          },
          result: undefined,
        }),
        { ctx },
      );
      return actionResponse(true, intent, eventUid);
    }

    return actionResponse(false, intent, eventUid, "요청 내용을 확인해주세요.", 400);
  } catch (error) {
    if (isPlannerStateRevisionConflictError(error)) {
      return actionResponse(
        false,
        intent,
        eventUid,
        "다른 탭이나 기기에서 플래너가 바뀌었어요. 최신 내용을 확인한 뒤 다시 시도해주세요.",
        409,
        true,
      );
    }
    if (error instanceof Error && error.message === AP_CHARGE_EXCEPTION_OVERLAP_MESSAGE) {
      return actionResponse(false, intent, eventUid, AP_CHARGE_EXCEPTION_OVERLAP_MESSAGE, 409);
    }
    if (
      intent === "apply-charge-exception" &&
      error instanceof Error &&
      error.message.includes("AP 충전 예외를 확인")
    ) {
      return actionResponse(false, intent, eventUid, "AP 충전 예외를 확인해주세요.", 400);
    }
    if (
      error instanceof Error &&
      ["카페 랭크를 먼저 입력해주세요.", "먼저 AP 모으기 계획에 추가해주세요."].includes(error.message)
    ) {
      return actionResponse(false, intent, eventUid, error.message, 400);
    }
    if (intent === "apply-charge-exception" && error instanceof Error && error.message.includes("겹쳐")) {
      return actionResponse(false, intent, eventUid, AP_CHARGE_EXCEPTION_OVERLAP_MESSAGE, 409);
    }
    const message =
      intent === "save-condition"
        ? "플레이 조건을 저장하지 못했어요. 다시 시도해주세요."
        : intent === "apply-charge-exception" || intent === "remove-charge-exception"
          ? "청휘석 플래너 설정을 저장하지 못했어요. 다시 시도해주세요."
          : "AP 모으기 계획을 저장하지 못했어요. 다시 시도해주세요.";
    return actionResponse(false, intent, eventUid, message, 500);
  }
};

function isUsableGuestSnapshot(snapshot: ReturnType<typeof useGuestPlanner>["snapshot"]) {
  return Boolean(snapshot && "envelope" in snapshot);
}

function calculateShopRequiredAp(
  shop: IntegratedPlannerShopEvent,
  state: PlannerStateDocumentV1["eventShops"][string],
): {
  requiredAp: number;
  breakdown: { firstClearAp: number; questSweepAp: number; extraSweepAp: number };
  hasUnobtainableTargets: boolean;
} {
  if (!shop.content || !state) throw new Error("상점 계산 상태를 확인할 수 없어요.");
  const { stages, shopResources, eventRewardBonus, minigameConfig } = shop.content;
  const clueExchange = resolveClueSearchExchange(minigameConfig, shopResources);
  const visibleShopResources = filterClueSearchShopResources(shopResources, clueExchange);
  const bonusSummary = calculateBonusSummary({
    eventRewardBonus,
    selectedStudentUids: state.selectedBonusStudentUids,
    selectedStudentUidsByItem:
      state.bonusStudentSelectionMode === "perItem" ? state.selectedBonusStudentUidsByItem : undefined,
  });
  const appliedBonusRatio = Object.fromEntries(
    bonusSummary.map((bonus) => [bonus.uid, bonus.appliedStrikerRatio.plus(bonus.appliedSpecialRatio)]),
  );
  const costs = minigameConfig
    ? calculateMinigamePaymentCosts(
        minigameConfig,
        state.minigamePlayCount,
        state.minigamePaymentQuantityMode,
        state.minigameStartRound,
      )
    : undefined;
  const minigamePaymentCosts =
    clueExchange?.supported && costs ? convertClueSearchCostsToPoints(costs, clueExchange) : costs;
  const calculation = calculateShopApRequirement({
    state: state as ShopState,
    stages,
    shopResources: visibleShopResources,
    appliedBonusRatio,
    minigamePaymentCosts,
    excludedShopResourceUids: clueExchange?.hiddenShopResourceUids,
    minigameConfig,
  });
  return {
    requiredAp: calculation.totalApWithExtras,
    breakdown: {
      firstClearAp: calculation.firstClearAp,
      questSweepAp: calculation.questSweepAp,
      extraSweepAp: calculation.extraSweepAp,
    },
    hasUnobtainableTargets: Object.keys(calculation.unobtainableTargets).length > 0,
  };
}

function getGuestShopState(plans: ReturnType<typeof guestPlannerEventShopPlans>, shop: IntegratedPlannerShopEvent) {
  if (!shop.shopStateUid) return null;
  return (
    plans.find((plan) => plan.shopStateUid === shop.shopStateUid && plan.timelineUid === shop.timelineUid)?.state ??
    null
  );
}

function updateCondition(state: ApPlannerState, field: ApConditionField, value: number | null): ApPlannerState {
  const next = { ...state };
  if (field === "accountLevel") next.accountLevel = value;
  else if (field === "cafeRank") {
    next.cafeRank = value;
    next.comfort =
      value === null
        ? null
        : state.comfort === null
          ? comfortMaximum(value)
          : Math.min(state.comfort, comfortMaximum(value));
  } else if (field === "comfort") {
    if (state.cafeRank === null) throw new Error("카페 랭크를 먼저 입력해주세요.");
    next.comfort = value === null ? comfortMaximum(state.cafeRank) : value;
  }
  const normalized = normalizeApPlannerState(next);
  if (!normalized) throw new Error("입력한 플레이 조건을 확인해주세요.");
  return normalized;
}

function ApMonthDivider({ month }: { month: string }) {
  const [year, number] = month.split("-");
  return (
    <div className="flex items-center gap-3 pb-2 pt-3">
      <span className="text-sm font-semibold tabular-nums text-muted-foreground">{Number(number)}월</span>
      <span className="h-px flex-1 bg-border" />
      <span className="sr-only">{year}년</span>
    </div>
  );
}

export default function ApPlannerRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const guestPlanner = useGuestPlanner();
  const [searchParams] = useSearchParams();
  const [hideTargetless, setHideTargetless] = useState(false);
  const [guestErrors, setGuestErrors] = useState<Record<string, string>>({});
  const eventUidFromQuery = searchParams.get("eventUid");
  const guestEnvelope =
    isUsableGuestSnapshot(guestPlanner.snapshot) && guestPlanner.snapshot && "envelope" in guestPlanner.snapshot
      ? guestPlanner.snapshot.envelope
      : null;
  const guestPlans = useMemo(() => (guestEnvelope ? guestPlannerEventShopPlans(guestEnvelope) : []), [guestEnvelope]);
  const guestApState = guestEnvelope?.document.ap ?? null;
  const apState = loaderData.signedIn ? (loaderData.accountState?.apPlanner ?? null) : guestApState;
  const effectiveApState = apState ?? createEmptyApPlannerState();
  const pyroxeneOptions = loaderData.signedIn
    ? (loaderData.accountState?.options ?? defaultPyroxenePlannerOptions)
    : (guestEnvelope?.document.pyroxene.options ?? defaultPyroxenePlannerOptions);
  const conditionsReady = loaderData.signedIn ? loaderData.accountStateStatus === "available" : Boolean(guestEnvelope);
  const isSaving = fetcher.state !== "idle";
  const actionEventUid = fetcher.data?.eventUid;
  const actionError = fetcher.data && !fetcher.data.success ? (fetcher.data.error ?? null) : null;

  // Ended events are hidden but still own the AP of their period, so overlap checks use the full list.
  const allEvents = useMemo<ApDisplayEvent[]>(() => {
    const timelineByUid = new Map(loaderData.timelineEvents.map((event) => [event.uid, event]));
    return loaderData.shopEvents
      .flatMap((shop) => {
        const timeline = timelineByUid.get(shop.timelineUid);
        if (timeline?.contentType !== "event" || !timeline.startAt) return [];
        return [
          {
            timelineUid: shop.timelineUid,
            name: timeline.name ?? shop.name,
            startAt: timeline.startAt,
            endAt: timeline.endAt,
            exchangeUntil: shop.endAt,
            shop,
          },
        ];
      })
      .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));
  }, [loaderData.shopEvents, loaderData.timelineEvents]);
  const events = useMemo(
    () => allEvents.filter((entry) => !entry.endAt || Date.parse(entry.endAt) > Date.parse(loaderData.now)),
    [allEvents, loaderData.now],
  );

  const calculatedEvents = useMemo<CalculatedApEvent[]>(() => {
    const previousPlannedEvents = allEvents.flatMap((entry) => {
      if (!effectiveApState.eventPlans[entry.timelineUid] || !entry.endAt) return [];
      return [{ timelineUid: entry.timelineUid, name: entry.name, startAt: entry.startAt, endAt: entry.endAt }];
    });
    return events.map((entry) => {
      const plan = effectiveApState.eventPlans[entry.timelineUid] ?? null;
      const shopError =
        loaderData.signedIn && loaderData.accountStateStatus !== "available"
          ? "계정 AP 플래너 정보를 불러오지 못했어요."
          : entry.shop.status !== "available"
            ? "이벤트 상점 정보를 불러오지 못했어요."
            : entry.shop.accountStateStatus !== "available" && loaderData.signedIn
              ? "상점 계산 상태를 불러오지 못했어요."
              : null;
      const guestStorageError =
        !loaderData.signedIn && guestPlanner.snapshot?.status === "corrupt"
          ? "게스트 플래너 저장을 읽지 못했어요."
          : !loaderData.signedIn && guestPlanner.snapshot?.status === "unavailable"
            ? "게스트 플래너 저장소를 사용할 수 없어요."
            : null;
      const shopState = loaderData.signedIn ? entry.shop.accountState : getGuestShopState(guestPlans, entry.shop);
      let shopTargetExists = false;
      let calculation: ApPlannerCalculation | null = null;
      let calculationError = shopError ?? guestStorageError;
      if (!calculationError && shopState) {
        try {
          const required = calculateShopRequiredAp(entry.shop, shopState);
          shopTargetExists = required.hasUnobtainableTargets || hasApShopTarget(required.requiredAp);
          if (shopTargetExists) {
            if (required.hasUnobtainableTargets) {
              calculationError = "선택한 스테이지에서 얻을 수 없는 이벤트 재화가 있어 AP를 계산할 수 없어요.";
            } else if (!entry.endAt) {
              calculationError = "이벤트 종료 시각을 확인할 수 없어 AP를 계산하지 못했어요.";
            } else {
              const event: ApPlannerEvent = {
                timelineUid: entry.timelineUid,
                name: entry.name,
                startAt: entry.startAt,
                endAt: entry.endAt,
                exchangeUntil: entry.exchangeUntil,
                requiredAp: required.requiredAp,
                requiredBreakdown: required.breakdown,
              };
              calculation = calculateApPlannerEvent({
                event,
                conditions: effectiveApState,
                plan,
                currentAt: loaderData.now,
                options: pyroxeneOptions,
                previousPlannedEvents,
              });
            }
          }
        } catch {
          calculationError = "이 이벤트의 AP 계산을 완료하지 못했어요.";
        }
      }
      return {
        event: entry,
        calculation,
        calculationError,
        shopTargetExists,
        plan,
        actionError: actionEventUid === entry.timelineUid ? actionError : (guestErrors[entry.timelineUid] ?? null),
      };
    });
  }, [
    actionError,
    actionEventUid,
    allEvents,
    effectiveApState,
    events,
    guestErrors,
    guestPlanner.snapshot,
    guestPlans,
    loaderData.accountStateStatus,
    loaderData.now,
    loaderData.signedIn,
    pyroxeneOptions,
  ]);

  const visibleEvents = calculatedEvents.filter(
    (entry) =>
      !hideTargetless ||
      entry.shopTargetExists ||
      entry.plan !== null ||
      entry.calculationError !== null ||
      eventUidFromQuery === entry.event.timelineUid,
  );
  const groupedEvents = new Map<string, CalculatedApEvent[]>();
  for (const entry of visibleEvents) {
    const month = dayjs(entry.event.startAt).tz(KST).format("YYYY-MM");
    groupedEvents.set(month, [...(groupedEvents.get(month) ?? []), entry]);
  }
  const deepLinkResolved = eventUidFromQuery ? events.some((event) => event.timelineUid === eventUidFromQuery) : true;
  const canEdit = loaderData.signedIn
    ? loaderData.accountStateStatus === "available"
    : Boolean(
        guestEnvelope && (guestPlanner.snapshot?.status === "ready" || guestPlanner.snapshot?.status === "memory"),
      );

  const submitAction = (values: Record<string, string>) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(values)) body.set(key, value);
    fetcher.submit(body, { method: "post" });
  };

  const updateGuestAp = async (update: (current: ApPlannerState) => ApPlannerState, eventUid?: string) => {
    const errorKey = eventUid ?? "global";
    try {
      const result = await guestPlanner.update((current) => {
        const currentAp = current.document.ap ?? createEmptyApPlannerState();
        const nextAp = normalizeApPlannerState(update(currentAp));
        if (!nextAp) throw new Error("AP 플래너 내용을 확인해주세요.");
        return { ...current, document: { ...current.document, ap: nextAp } };
      });
      if (!("envelope" in result) || result.status === "conflict") {
        setGuestErrors((current) => ({
          ...current,
          [errorKey]: "게스트 AP 플래너를 저장하지 못했어요. 입력을 보존하고 다시 시도해주세요.",
        }));
      } else {
        setGuestErrors((current) => {
          const next = { ...current };
          delete next[errorKey];
          return next;
        });
      }
    } catch {
      setGuestErrors((current) => ({
        ...current,
        [errorKey]: "게스트 AP 플래너를 저장하지 못했어요. 다시 시도해주세요.",
      }));
    }
  };

  const saveCondition = (field: ApConditionField, value: number | null) => {
    if (loaderData.signedIn) {
      submitAction({ intent: "save-condition", field, value: value === null ? "" : String(value) });
      return;
    }
    if (field === "apChargeCount") {
      const count = value ?? 0;
      void guestPlanner
        .update((current) => setGuestPlannerApChargeCount(current, count))
        .then((result) => {
          if (!("envelope" in result) || result.status === "conflict") {
            setGuestErrors((current) => ({
              ...current,
              global: "게스트 플래너를 저장하지 못했어요. 다시 시도해주세요.",
            }));
          } else {
            setGuestErrors((current) => {
              const next = { ...current };
              delete next.global;
              return next;
            });
          }
        })
        .catch(() =>
          setGuestErrors((current) => ({
            ...current,
            global: "게스트 플래너를 저장하지 못했어요. 다시 시도해주세요.",
          })),
        );
      return;
    }
    void updateGuestAp((current) => updateCondition(current, field, value));
  };

  const savePlan = (eventUid: string, operation: "add-plan" | "remove-plan") => {
    if (loaderData.signedIn) {
      submitAction({ intent: operation, eventUid });
      return;
    }
    void updateGuestAp((current) => {
      const eventPlans = { ...current.eventPlans };
      if (operation === "add-plan") eventPlans[eventUid] ??= { accessAt: null };
      else delete eventPlans[eventUid];
      return { ...current, eventPlans };
    }, eventUid);
  };

  const saveAccessAt = (eventUid: string, accessAt: string) => {
    if (loaderData.signedIn) {
      submitAction({ intent: "save-access-time", eventUid, accessAt });
      return;
    }
    void updateGuestAp((current) => {
      const plan = current.eventPlans[eventUid];
      if (!plan) throw new Error("먼저 AP 모으기 계획에 추가해주세요.");
      return { ...current, eventPlans: { ...current.eventPlans, [eventUid]: { ...plan, accessAt } } };
    }, eventUid);
  };

  const applyException = (eventUid: string, suggestion: ApRefillSuggestion) => {
    const exception: PyroxeneApChargeException = {
      uid: nanoid(12),
      startDate: suggestion.startDate,
      endDate: suggestion.endDate,
      count: suggestion.toCount,
    };
    if (loaderData.signedIn) {
      submitAction({ intent: "apply-charge-exception", eventUid, ...exception, count: String(exception.count) });
      return;
    }
    let overlapsLatestException = false;
    void guestPlanner
      .update((current) => {
        const result = addGuestPlannerApChargeException(current, exception);
        overlapsLatestException = result.overlap;
        return result.envelope;
      })
      .then((snapshot) => {
        if (overlapsLatestException) {
          setGuestErrors((current) => ({ ...current, [eventUid]: AP_CHARGE_EXCEPTION_OVERLAP_MESSAGE }));
          return;
        }
        if (!("envelope" in snapshot) || snapshot.status === "conflict") {
          setGuestErrors((current) => ({
            ...current,
            [eventUid]: "청휘석 플래너 설정을 저장하지 못했어요. 다시 시도해주세요.",
          }));
        } else {
          setGuestErrors((current) => {
            const next = { ...current };
            delete next[eventUid];
            return next;
          });
        }
      })
      .catch(() =>
        setGuestErrors((current) => ({
          ...current,
          [eventUid]: "청휘석 플래너 설정을 저장하지 못했어요. 다시 시도해주세요.",
        })),
      );
  };

  const removeException = (eventUid: string, uid: string) => {
    if (loaderData.signedIn) {
      submitAction({ intent: "remove-charge-exception", eventUid, uid });
      return;
    }
    void guestPlanner
      .update((current) => removeGuestPlannerApChargeException(current, uid))
      .then((snapshot) => {
        if (!("envelope" in snapshot) || snapshot.status === "conflict") {
          setGuestErrors((current) => ({
            ...current,
            [eventUid]: "청휘석 플래너 설정을 저장하지 못했어요. 다시 시도해주세요.",
          }));
        } else {
          setGuestErrors((current) => {
            const next = { ...current };
            delete next[eventUid];
            return next;
          });
        }
      })
      .catch(() =>
        setGuestErrors((current) => ({
          ...current,
          [eventUid]: "청휘석 플래너 설정을 저장하지 못했어요. 다시 시도해주세요.",
        })),
      );
  };

  const hasAnyDataError =
    loaderData.timelineEventsStatus === "unavailable" || loaderData.shopEventsStatus === "unavailable";
  const globalActionError = actionEventUid === undefined ? actionError : (guestErrors.global ?? null);
  const guestStatus = guestPlanner.snapshot?.status ?? "loading";
  const hasGuestDataError = !loaderData.signedIn && ["corrupt", "unavailable", "conflict"].includes(guestStatus);

  return (
    <Page
      title="AP 플래너"
      description="이벤트 상점 목표에 필요한 AP와 AP 모으기 순서를 확인해보세요"
      links={[
        {
          Icon: CreditCardIcon,
          title: "청휘석 플래너",
          shortTitle: "청휘석",
          description: "AP 충전 설정도 함께 관리해요",
          to: "/utils/pyroxene",
        },
        {
          Icon: CalendarIcon,
          title: "통합 플래너",
          shortTitle: "통합",
          description: "이벤트 일정을 날짜별로 확인해보세요",
          to: "/planner",
        },
      ]}
      panels={[
        {
          title: "플레이 조건",
          Icon: Cog6ToothIcon,
          children: (
            <ApPlannerConditionsPanelContent
              ready={conditionsReady}
              loading={!loaderData.signedIn && guestStatus === "loading"}
              state={effectiveApState}
              options={pyroxeneOptions}
              disabled={!canEdit || isSaving}
              onSave={saveCondition}
            />
          ),
        },
      ]}
    >
      <div className="space-y-3">
        {hasAnyDataError ? <Callout tone="destructive" title="일정이나 이벤트 상점 정보를 불러오지 못했어요." /> : null}
        {loaderData.signedIn && loaderData.accountStateStatus !== "available" ? (
          <Callout tone="destructive" title="계정 AP 플래너 정보를 불러오지 못했어요." />
        ) : null}
        {hasGuestDataError ? (
          <Callout
            tone={guestStatus === "conflict" ? "warning" : "destructive"}
            title={
              guestStatus === "conflict"
                ? "여러 탭의 게스트 계획을 안전하게 저장하지 못했어요."
                : "게스트 플래너 저장을 불러오지 못했어요."
            }
            description={guestStatus === "unavailable" ? "이 브라우저의 저장소를 사용할 수 없어요." : undefined}
          />
        ) : null}
        {!loaderData.signedIn && guestStatus === "memory" ? (
          <Callout tone="warning" title="게스트 AP 플래너를 브라우저에 저장하지 못했어요." />
        ) : null}
        {!loaderData.signedIn && guestStatus === "loading" ? (
          <div role="status" className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
            게스트 플래너를 불러오고 있어요.
          </div>
        ) : null}
        {globalActionError ? <Callout tone="destructive" title={globalActionError} /> : null}
        {eventUidFromQuery &&
        !deepLinkResolved &&
        loaderData.timelineEventsStatus === "available" &&
        loaderData.shopEventsStatus === "available" ? (
          <div role="status" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            요청한 이벤트를 찾지 못했어요.
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <h2 className="whitespace-nowrap text-lg font-semibold">이벤트별 AP</h2>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <span>상점 목표가 없는 이벤트 숨기기</span>
            <Toggle
              aria-label="상점 목표가 없는 이벤트 숨기기"
              initialState={hideTargetless}
              onChange={setHideTargetless}
              className="m-0"
            />
          </div>
        </div>
        {groupedEvents.size === 0 ? (
          <EmptyView text="표시할 이벤트 상점이 없어요" />
        ) : (
          [...groupedEvents.entries()].map(([month, monthEvents]) => (
            <section key={month} aria-label={`${month} 이벤트 AP`}>
              <ApMonthDivider month={month} />
              <div className="space-y-3">
                {monthEvents.map((entry) => (
                  <ApTimelineEvent
                    key={entry.event.timelineUid}
                    event={entry.event}
                    calculation={entry.calculation}
                    calculationError={entry.calculationError}
                    shopTargetExists={entry.shopTargetExists}
                    plan={entry.plan}
                    conditions={effectiveApState}
                    options={pyroxeneOptions}
                    actionError={entry.actionError}
                    disabled={!canEdit || isSaving}
                    deepLink={eventUidFromQuery === entry.event.timelineUid}
                    onAddPlan={() => savePlan(entry.event.timelineUid, "add-plan")}
                    onRemovePlan={() => savePlan(entry.event.timelineUid, "remove-plan")}
                    onSaveAccessAt={(accessAt) => saveAccessAt(entry.event.timelineUid, accessAt)}
                    onApplyException={(suggestion) => applyException(entry.event.timelineUid, suggestion)}
                    onRemoveException={(uid) => removeException(entry.event.timelineUid, uid)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </Page>
  );
}
