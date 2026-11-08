import {
  AdjustmentsHorizontalIcon,
  ArrowTrendingUpIcon,
  CalendarIcon,
  ChartBarIcon,
  ChevronRightIcon,
  Squares2X2Icon,
  WalletIcon,
} from "@heroicons/react/16/solid";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
  type MetaFunction,
  useFetcher,
  useLoaderData,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { useGuestPlanner } from "~/components/features/futures/useGuestPlanner";
import { usePyroxeneScheduleItems } from "~/components/features/futures/usePyroxeneScheduleItems";
import { usePyroxeneTimeline } from "~/components/features/futures/usePyroxeneTimeline";
import type { PlannerEventData, PlannerEventDataPatch } from "~/components/v2/features/pyroxene/EventCard";
import { AddIncomeDialog, IncomePlanAddButton, IncomePlanPanel } from "~/components/v2/features/pyroxene/IncomePlan";
import {
  formatInputAt,
  OwnedResourceList,
  OwnedResourcesDialog,
  OwnedResourcesHeaderAction,
  type OwnedResourceValues,
} from "~/components/v2/features/pyroxene/OwnedResources";
import { CalculationMethodDialog, PickupBasisPanel } from "~/components/v2/features/pyroxene/PickupBasis";
import { PlannerSchedule } from "~/components/v2/features/pyroxene/PlannerSchedule";
import { PLAN_SHEET_PANEL_ID, PlanSheet } from "~/components/v2/features/pyroxene/PlanSheet";
import { formatAmount, ResourceIcon } from "~/components/v2/features/pyroxene/pyroxene-ui";
import { AsideLinks } from "~/components/v2/layout/AsideLinks";
import { MobileActionBar } from "~/components/v2/layout/MobileActionBar";
import { PageAside } from "~/components/v2/layout/PageAside";
import { PageHeader } from "~/components/v2/layout/PageHeader";
import { PageMain } from "~/components/v2/layout/PageMain";
import { PanelSheet } from "~/components/v2/layout/PanelSheet";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { V2Page } from "~/components/v2/layout/V2Page";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  guestPlannerHasImportableData,
  removeGuestPlannerApChargeException,
  updateGuestPlannerOptions,
} from "~/domain/guest-planner";
import {
  createGuestRecord,
  type GuestPyroxeneRecord,
  guestPyroxeneRecordToTimelineItems,
} from "~/domain/guest-pyroxene-planner";
import { sortPlannerStateTimelineRecords, withPyroxeneEventDataPatch } from "~/domain/planner-state";
import { buildPyroxeneCalculationAssumptions } from "~/domain/pyroxene-assumptions";
import {
  defaultPyroxenePlannerOptions,
  type PyroxeneCalculationOptions,
  type PyroxenePlannerOptions,
} from "~/domain/pyroxene-planner";
import {
  buildPlannerTimelineRows,
  getActivePyroxenePackages,
  numberTargetEvents,
} from "~/domain/pyroxene-planner-view";
import { EMPTY_RECRUITMENT_STACKS, type RecruitmentStacks } from "~/domain/pyroxene-recruitment-goal";
import { buildPyroxeneDisplayTimeline } from "~/domain/pyroxene-schedule";
import {
  collectedSourceKeyForEventReward,
  createOptimisticApPackageTimelineItems,
  createOptimisticAttendanceTimelineItems,
  createOptimisticBuyTimelineItems,
  createOptimisticMonthlyPackageTimelineItems,
  createOptimisticOtherTimelineItems,
  extractPyroxeneTimelineBaseUid,
  getAttendanceStartDate,
  type PyroxeneMonthlyPackageType,
} from "~/domain/pyroxene-sources";
import type { PickupResources, PyroxeneTimelineEventData } from "~/domain/pyroxene-timeline";
import dayjs from "~/lib/dayjs";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { isPlannerStateRevisionConflictError, PLANNER_STATE_REVISION_CONFLICT_MESSAGE } from "~/models/planner-state";
import type { PyroxeneTimelineItem, PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";
import {
  createAttendance,
  createBuyPyroxene,
  createOtherPyroxeneGain,
  createPyroxeneApPackage,
  createPyroxeneMonthlyPackage,
  createPyroxeneOwnedResource,
  deleteCollectedSource,
  deletePyroxeneTimelineItem,
  getPyroxeneUserState,
  updatePyroxenePlannerOptions,
  upsertCollectedSources,
  upsertPyroxeneEventData,
} from "~/models/pyroxene-planner";
import { getRecruitedStudents } from "~/models/recruited-student";
import {
  deleteRecruitmentResult,
  getRecruitmentResultsByRecruitmentGroupUids,
  setRecruitmentResultCompletion,
} from "~/models/recruitment-result.server";
import { getPyroxenePlannerContents } from "~/views/pyroxene";
import { type ActionData, decodePyroxeneActionPayload } from "./utils.pyroxene._components/action-data";

// recharts is large, so the chart loads apart from the planner's first bundle.
const BalanceChart = lazy(() => import("~/components/v2/features/pyroxene/BalanceChart"));

export const PYROXENE_GUEST_IMPORT_HREF = "/planner/import?from=pyroxene";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const selectedEventUid = new URL(request.url).searchParams.get("eventUid");

  // contents와 인증은 서로 무관하므로 병렬 실행
  const [contents, currentUser] = await Promise.all([
    getPyroxenePlannerContents(env, false, ctx),
    getActiveSensei(env, request),
  ]);

  if (!currentUser) {
    return {
      contents,
      selectedEventUid,
      favoritedStudents: [],
      latestResources: {
        pyroxene: 0,
        oneTimeTicket: 0,
        tenTimeTicket: 0,
        inputAt: null,
        recruitmentStacks: EMPTY_RECRUITMENT_STACKS,
        stacksEntered: false,
      },
      timelineItems: [],
      calcOptions: defaultPyroxenePlannerOptions,
      eventData: [],
      recruitmentResultCompletions: [],
      recruitedStudentUids: [],
      collectedSourceKeys: [],
    };
  }

  // User state reads share one PostgreSQL client; unrelated repositories remain parallel.
  const recruitmentGroupUids = contents.flatMap((content) =>
    content.kind === "event" && content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
  );

  const [favoritedStudents, pyroxeneState, recruitmentResults, recruitedStudents] = await Promise.all([
    getUserFavoritedStudents(env, currentUser.id, undefined, { ctx }),
    getPyroxeneUserState(env, currentUser.id, { ctx }),
    getRecruitmentResultsByRecruitmentGroupUids(env, currentUser.id, recruitmentGroupUids),
    getRecruitedStudents(env, currentUser.id),
  ]);

  return {
    signedIn: true,
    contents,
    selectedEventUid,
    favoritedStudents: favoritedStudents.map(({ contentId, studentId }) => ({
      contentUid: contentId,
      studentUid: studentId,
    })),
    latestResources: {
      pyroxene: pyroxeneState.latestResources?.pyroxene ?? 0,
      oneTimeTicket: pyroxeneState.latestResources?.oneTimeTicket ?? 0,
      tenTimeTicket: pyroxeneState.latestResources?.tenTimeTicket ?? 0,
      inputAt: pyroxeneState.latestResources?.inputAt ?? null,
      recruitmentStacks: pyroxeneState.latestResources?.recruitmentStacks ?? EMPTY_RECRUITMENT_STACKS,
      stacksEntered: pyroxeneState.latestResources?.recruitmentStacks !== undefined,
    },
    timelineItems: pyroxeneState.timelineItems,
    calcOptions: pyroxeneState.options,
    eventData: pyroxeneState.eventData,
    recruitmentResultCompletions: recruitmentResults.flatMap((result) => {
      if (!result.completedAt) {
        return [];
      }

      const content = contents.find(
        (content) => content.kind === "event" && content.recruitmentGroupUid === result.recruitmentGroupUid,
      );
      return content ? [{ eventUid: content.uid, recruitmentGroupUid: result.recruitmentGroupUid }] : [];
    }),
    recruitedStudentUids: recruitedStudents.map(({ studentUid }) => studentUid),
    collectedSourceKeys: [...pyroxeneState.collectedSourceKeys],
  };
};

function preserveApChargeExceptions(
  submitted: PyroxenePlannerOptions,
  current: PyroxenePlannerOptions,
): PyroxenePlannerOptions {
  return {
    ...submitted,
    consumption: {
      ...submitted.consumption,
      apChargeExceptions: current.consumption.apChargeExceptions,
    },
  };
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "utils.pyroxene.action" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return { success: false };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return data({ success: false, error: "요청 payload를 읽을 수 없어요" }, { status: 400 });
  }

  let actionData: ActionData;
  try {
    actionData = decodePyroxeneActionPayload(body, request.method);
  } catch (error) {
    return data(
      { success: false, error: error instanceof Error ? error.message : "요청 payload가 올바르지 않아요" },
      { status: 400 },
    );
  }

  try {
    switch (actionData.intent) {
      case "save-owned-resources": {
        const { resources, recruitmentStacks, eventUid, collectedSourceKeys } = actionData.payload;
        const savedAt = new Date().toISOString();
        try {
          await createPyroxeneOwnedResource(
            env,
            currentUser.id,
            recruitmentStacks ? { ...resources, recruitmentStacks } : resources,
            { inputAt: savedAt },
          );
          if (eventUid) {
            const content = (await getPyroxenePlannerContents(env, false, ctx)).find(
              (content) => content.kind === "event" && content.uid === eventUid,
            );
            if (content?.kind !== "event" || !content.recruitmentGroupUid) {
              throw new Error(`Cannot resolve recruitment group for pyroxene completion: eventUid=${eventUid}`);
            }

            const recruitedStudents = content.recruitments.flatMap((recruitment) => {
              if (!recruitment.pickup || !recruitment.student) return [];
              return [
                {
                  studentUid: recruitment.student.uid,
                  tier: recruitment.student.initialTier || 3,
                  pickup: true,
                },
              ];
            });
            if (recruitedStudents.length === 0) {
              throw new Error(`Cannot resolve pickup students for pyroxene completion: eventUid=${eventUid}`);
            }

            await setRecruitmentResultCompletion(env, currentUser.id, content.recruitmentGroupUid, true, {
              contentUid: eventUid,
              recruitedStudents,
            });
          }
          if (collectedSourceKeys) {
            await upsertCollectedSources(env, currentUser.id, collectedSourceKeys);
          }
        } catch (error) {
          logger.error("Failed to save pyroxene owned resources", error, {
            operation: "save-owned-resources",
            userId: currentUser.id,
          });
          const revisionConflict = isPlannerStateRevisionConflictError(error);
          return data(
            {
              success: false,
              error: revisionConflict ? PLANNER_STATE_REVISION_CONFLICT_MESSAGE : "보유 재화를 저장하지 못했어요",
              ...(revisionConflict ? { revisionConflict: true } : {}),
            },
            { status: revisionConflict ? 409 : 500 },
          );
        }
        return { success: true, savedAt };
      }
      case "save-buy":
        await createBuyPyroxene(env, currentUser.id, actionData.payload.date, actionData.payload.quantity, {
          repeatType: actionData.payload.repeatType,
          monthlyCount: actionData.payload.monthlyCount,
        });
        break;
      case "save-monthly-package":
        await createPyroxeneMonthlyPackage(
          env,
          currentUser.id,
          actionData.payload.startDate,
          actionData.payload.packageType,
          actionData.payload.autoRepurchase,
        );
        if (actionData.payload.options) {
          await updatePyroxenePlannerOptions(
            env,
            currentUser.id,
            (current) => ({
              options: preserveApChargeExceptions(actionData.payload.options as PyroxenePlannerOptions, current),
              result: undefined,
            }),
            { ctx },
          );
        }
        break;
      case "save-ap-package":
        await createPyroxeneApPackage(
          env,
          currentUser.id,
          actionData.payload.startDate,
          actionData.payload.autoRepurchase,
        );
        if (actionData.payload.options) {
          await updatePyroxenePlannerOptions(
            env,
            currentUser.id,
            (current) => ({
              options: preserveApChargeExceptions(actionData.payload.options as PyroxenePlannerOptions, current),
              result: undefined,
            }),
            { ctx },
          );
        }
        break;
      case "save-attendance":
        await createAttendance(env, currentUser.id, actionData.payload.startDate);
        break;
      case "save-other":
        await createOtherPyroxeneGain(
          env,
          currentUser.id,
          actionData.payload.date,
          actionData.payload.resources.pyroxene,
          actionData.payload.resources.oneTimeTicket,
          actionData.payload.resources.tenTimeTicket,
          actionData.payload.description,
        );
        break;
      case "update-event-data":
        await upsertPyroxeneEventData(env, currentUser.id, actionData.payload.eventUid, {
          expectedTrials: actionData.payload.expectedTrials,
          pickupChance: actionData.payload.pickupChance,
          targetTiers: actionData.payload.targetTiers,
        });
        break;
      case "save-options":
        await updatePyroxenePlannerOptions(
          env,
          currentUser.id,
          (current) => ({
            options: preserveApChargeExceptions(actionData.payload.options, current),
            result: undefined,
          }),
          { ctx },
        );
        break;
      case "remove-ap-charge-exception":
        await updatePyroxenePlannerOptions(
          env,
          currentUser.id,
          (current) => ({
            options: {
              ...current,
              consumption: {
                ...current.consumption,
                apChargeExceptions: current.consumption.apChargeExceptions.filter(
                  (exception) => exception.uid !== actionData.payload.uid,
                ),
              },
            },
            result: undefined,
          }),
          { ctx },
        );
        break;
      case "collect-source":
        await upsertCollectedSources(env, currentUser.id, [actionData.payload.sourceKey]);
        break;
      case "uncollect-source":
        await deleteCollectedSource(env, currentUser.id, actionData.payload.sourceKey);
        break;
      case "delete-pickup-completion": {
        let recruitmentGroupUid = actionData.payload.recruitmentGroupUid ?? null;
        if (!recruitmentGroupUid) {
          for (const content of await getPyroxenePlannerContents(env, false, ctx)) {
            if (content.kind === "event" && content.uid === actionData.payload.eventUid) {
              recruitmentGroupUid = content.recruitmentGroupUid;
              break;
            }
          }
        }
        if (recruitmentGroupUid) {
          const [recruitmentResult] = await getRecruitmentResultsByRecruitmentGroupUids(env, currentUser.id, [
            recruitmentGroupUid,
          ]);
          if (recruitmentResult) {
            await deleteRecruitmentResult(env, currentUser.id, recruitmentResult.uid);
          }
        }
        break;
      }
      case "delete-timeline-item":
        await deletePyroxeneTimelineItem(env, currentUser.id, actionData.payload.itemUid);
        break;
    }
  } catch (error) {
    if (isPlannerStateRevisionConflictError(error)) {
      return data(
        { success: false, error: PLANNER_STATE_REVISION_CONFLICT_MESSAGE, revisionConflict: true },
        { status: 409 },
      );
    }
    logger.error("Failed to update pyroxene planner", error, {
      operation: actionData.intent,
      userId: currentUser.id,
    });
    throw error;
  }

  const sectionByIntent = {
    "save-buy": "buy",
    "save-owned-resources": "owned_resources",
    "save-monthly-package": "monthly_package",
    "save-ap-package": "ap_package",
    "save-attendance": "attendance",
    "save-other": "other",
    "update-event-data": "event_data",
    "save-options": "options",
    "remove-ap-charge-exception": "delete",
    "collect-source": "source",
    "uncollect-source": "source",
    "delete-pickup-completion": "delete",
    "delete-timeline-item": "delete",
  } as const;
  return { success: true, analyticsSection: sectionByIntent[actionData.intent] };
};

export const meta: MetaFunction = ({ location }) => {
  const title = "청휘석 플래너";
  const description = "현재 보유 재화, 각종 수급 계획을 바탕으로 관심 학생 모집 시점의 재화 수량을 예상해보세요";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

type OwnedResourcesActionResult = {
  success: boolean;
  analyticsSection?: "owned_resources";
  error?: string;
  revisionConflict?: boolean;
  savedAt?: string | null;
};

type PendingOwnedResourceSave = {
  eventUid: string | null;
  values: OwnedResourceValues;
  collectedSourceKeys: string[];
};

type LocalEventData = PlannerEventData & { eventUid: string };

function toPickupResources(resources: PickupResources): PickupResources {
  return {
    pyroxene: resources.pyroxene,
    oneTimeTicket: resources.oneTimeTicket,
    tenTimeTicket: resources.tenTimeTicket,
  };
}

function toLocalEventData(rows: (PlannerEventData & { eventUid: string })[]): LocalEventData[] {
  return rows.map(({ eventUid, completed, expectedTrials, pickupChance, targetTiers }) => ({
    eventUid,
    completed,
    expectedTrials,
    pickupChance: pickupChance ?? null,
    targetTiers,
  }));
}

const ZERO_RESOURCES: PickupResources = { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
const HIDE_UNTARGETED_STORAGE_KEY = "pyroxene-planner::hide-unfavorited-events";
const RESOURCES_DIALOG_PANEL = "resources";

type PyroxenePlanSavedSection =
  | "owned_resources"
  | "event_data"
  | "source"
  | "options"
  | "delete"
  | "buy"
  | "monthly_package"
  | "ap_package"
  | "attendance"
  | "other";

function isGuestSnapshotUsable(status: string | undefined): boolean {
  return status === "ready" || status === "memory";
}

export default function PyroxenePlanner() {
  const loaderData = useLoaderData<typeof loader>();
  const { signedIn, contents } = loaderData;
  const { showSignIn } = useSignIn();
  const guestPlanner = useGuestPlanner();

  const [initialDate, setInitialDate] = useState<Date | null>(
    loaderData.latestResources.inputAt ? new Date(loaderData.latestResources.inputAt) : null,
  );
  const [initialResources, setInitialResources] = useState<PickupResources>(
    toPickupResources(loaderData.latestResources),
  );
  const [stacks, setStacks] = useState<RecruitmentStacks>(loaderData.latestResources.recruitmentStacks);
  const [stacksEntered, setStacksEntered] = useState(loaderData.latestResources.stacksEntered);
  const [localTimelineItems, setLocalTimelineItems] = useState<PyroxeneTimelineItem[]>(loaderData.timelineItems ?? []);
  const [localEventData, setLocalEventData] = useState<LocalEventData[]>(toLocalEventData(loaderData.eventData ?? []));
  const [localCompletions, setLocalCompletions] = useState(loaderData.recruitmentResultCompletions ?? []);
  const [localCollectedSourceKeys, setLocalCollectedSourceKeys] = useState<string[]>(
    loaderData.collectedSourceKeys ?? [],
  );
  const [localFavoritedStudents, setLocalFavoritedStudents] = useState(loaderData.favoritedStudents ?? []);
  const [options, setOptions] = useState<PyroxenePlannerOptions>(loaderData.calcOptions);
  const [hideUntargeted, setHideUntargeted] = useState(false);
  const [resourcesDialogOpen, setResourcesDialogOpen] = useState(false);
  const [methodDialogOpen, setMethodDialogOpen] = useState(false);
  const [incomeAddOpen, setIncomeAddOpen] = useState(false);
  const [selectedEventMissing, setSelectedEventMissing] = useState(false);
  const selectedEventRef = useRef<HTMLDivElement>(null);
  const fetcher = useFetcher<Awaited<ReturnType<typeof action>>>();
  const ownedResourcesFetcher = useFetcher<OwnedResourcesActionResult>();
  const favoriteFetcher = useFetcher();
  const timelineSaveInFlight = useRef(false);
  const pendingOwnedResourceSave = useRef<PendingOwnedResourceSave | null>(null);
  const processedAnalyticsResponse = useRef<Awaited<ReturnType<typeof action>> | null>(null);
  const optionsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ownedResourceSaveError, setOwnedResourceSaveError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setHideUntargeted(localStorage.getItem(HIDE_UNTARGETED_STORAGE_KEY) === "true");
    } catch {
      // Unavailable storage keeps the default.
    }
  }, []);

  const handleHideUntargetedChange = (value: boolean) => {
    setHideUntargeted(value);
    try {
      localStorage.setItem(HIDE_UNTARGETED_STORAGE_KEY, String(value));
    } catch {
      // Unavailable storage keeps the choice for this tab only.
    }
  };

  const confirmOwnedResourceSave = useCallback(
    (pendingSave: PendingOwnedResourceSave, savedAt?: string | null) => {
      setInitialResources(pendingSave.values.resources);
      setStacks(pendingSave.values.stacks);
      setStacksEntered(true);
      setInitialDate(savedAt ? new Date(savedAt) : new Date());
      if (pendingSave.collectedSourceKeys.length > 0) {
        setLocalCollectedSourceKeys((prev) => [...new Set([...prev, ...pendingSave.collectedSourceKeys])]);
      }
      const eventUid = pendingSave.eventUid;
      if (eventUid && signedIn) {
        const content = contents.find((content) => content.kind === "event" && content.uid === eventUid);
        if (content?.kind === "event" && content.recruitmentGroupUid) {
          const recruitmentGroupUid = content.recruitmentGroupUid;
          setLocalCompletions((prev) =>
            prev.some((completion) => completion.eventUid === eventUid)
              ? prev
              : [...prev, { eventUid, recruitmentGroupUid }],
          );
        }
      }
    },
    [contents, signedIn],
  );

  // Server revalidation replaces the local copies.
  useEffect(() => {
    setInitialDate(loaderData.latestResources.inputAt ? new Date(loaderData.latestResources.inputAt) : null);
    setInitialResources(toPickupResources(loaderData.latestResources));
    setStacks(loaderData.latestResources.recruitmentStacks);
    setStacksEntered(loaderData.latestResources.stacksEntered);
  }, [loaderData.latestResources]);
  useEffect(() => setLocalTimelineItems(loaderData.timelineItems ?? []), [loaderData.timelineItems]);
  useEffect(() => setLocalEventData(toLocalEventData(loaderData.eventData ?? [])), [loaderData.eventData]);
  useEffect(
    () => setLocalCompletions(loaderData.recruitmentResultCompletions ?? []),
    [loaderData.recruitmentResultCompletions],
  );
  useEffect(() => setLocalCollectedSourceKeys(loaderData.collectedSourceKeys ?? []), [loaderData.collectedSourceKeys]);
  useEffect(() => setLocalFavoritedStudents(loaderData.favoritedStudents ?? []), [loaderData.favoritedStudents]);
  useEffect(() => {
    if (signedIn) setOptions(loaderData.calcOptions);
  }, [loaderData.calcOptions, signedIn]);

  // Guests read everything from the browser planner.
  useEffect(() => {
    const snapshot = guestPlanner.snapshot;
    if (signedIn || !snapshot || !(isGuestSnapshotUsable(snapshot.status) || snapshot.status === "conflict")) return;
    if (!("envelope" in snapshot)) return;
    const { document, favorites } = snapshot.envelope;
    const pyroxene = document.pyroxene;
    setInitialDate(pyroxene.resources ? new Date(pyroxene.resources.inputAt) : null);
    setInitialResources(pyroxene.resources ? toPickupResources(pyroxene.resources) : ZERO_RESOURCES);
    setStacks(pyroxene.resources?.recruitmentStacks ?? EMPTY_RECRUITMENT_STACKS);
    setStacksEntered(pyroxene.resources?.recruitmentStacks !== undefined);
    setLocalTimelineItems(pyroxene.records.map((item) => ({ ...item, userId: 0 })));
    setLocalEventData(
      Object.entries(pyroxene.eventData).map(([eventUid, state]) => ({
        eventUid,
        completed: state.completed,
        expectedTrials: state.expectedTrials,
        pickupChance: state.pickupChance ?? null,
        targetTiers: state.targetTiers,
      })),
    );
    setLocalCollectedSourceKeys(pyroxene.collectedSourceKeys);
    setLocalFavoritedStudents(favorites);
    setOptions(pyroxene.options);
  }, [guestPlanner.snapshot, signedIn]);

  useEffect(() => {
    if (fetcher.state === "idle") timelineSaveInFlight.current = false;
  }, [fetcher.state]);

  useEffect(() => {
    const result = fetcher.data;
    if (
      fetcher.state !== "idle" ||
      !result ||
      !("success" in result) ||
      result.success !== true ||
      !("analyticsSection" in result) ||
      !result.analyticsSection ||
      result === processedAnalyticsResponse.current
    ) {
      return;
    }
    processedAnalyticsResponse.current = result;
    trackGoogleAnalyticsEvent("pyroxene_plan_saved", { section: result.analyticsSection });
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
    if (ownedResourcesFetcher.state !== "idle") return;
    const pendingSave = pendingOwnedResourceSave.current;
    if (!pendingSave) return;
    pendingOwnedResourceSave.current = null;
    if (!ownedResourcesFetcher.data?.success) {
      setOwnedResourceSaveError(ownedResourcesFetcher.data?.error ?? "보유 재화를 저장하지 못했어요");
      return;
    }
    setOwnedResourceSaveError(null);
    trackGoogleAnalyticsEvent("pyroxene_plan_saved", { section: "owned_resources" });
    confirmOwnedResourceSave(pendingSave, ownedResourcesFetcher.data.savedAt);
  }, [confirmOwnedResourceSave, ownedResourcesFetcher.data, ownedResourcesFetcher.state]);

  const trackGuestSave = (section: PyroxenePlanSavedSection) => (snapshot: { status: string }) => {
    if (isGuestSnapshotUsable(snapshot.status)) trackGoogleAnalyticsEvent("pyroxene_plan_saved", { section });
  };

  const handleSaveOwnedResources = (
    eventUid: string | null,
    values: OwnedResourceValues,
    collectedSourceKeys: string[] = [],
  ) => {
    const ownedResources = toPickupResources(values.resources);
    const inputAt = new Date().toISOString();
    if (!signedIn) {
      confirmOwnedResourceSave({ eventUid, values, collectedSourceKeys }, inputAt);
      void guestPlanner
        .update((envelope) => ({
          ...envelope,
          document: {
            ...envelope.document,
            pyroxene: {
              ...envelope.document.pyroxene,
              resources: { ...ownedResources, inputAt, recruitmentStacks: values.stacks },
              collectedSourceKeys: [
                ...new Set([...envelope.document.pyroxene.collectedSourceKeys, ...collectedSourceKeys]),
              ].sort(),
            },
          },
        }))
        .then(trackGuestSave("owned_resources"));
      return;
    }
    setOwnedResourceSaveError(null);
    pendingOwnedResourceSave.current = { eventUid, values, collectedSourceKeys };
    ownedResourcesFetcher.submit(
      {
        intent: "save-owned-resources",
        payload: { resources: ownedResources, recruitmentStacks: values.stacks, eventUid, collectedSourceKeys },
      },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleCollectedSourceChange = (sourceKey: string, collected: boolean) => {
    if (localCollectedSourceKeys.includes(sourceKey) === collected) return;
    setLocalCollectedSourceKeys((prev) =>
      collected ? (prev.includes(sourceKey) ? prev : [...prev, sourceKey]) : prev.filter((key) => key !== sourceKey),
    );
    if (!signedIn) {
      void guestPlanner
        .update((envelope) => ({
          ...envelope,
          document: {
            ...envelope.document,
            pyroxene: {
              ...envelope.document.pyroxene,
              collectedSourceKeys: collected
                ? [...new Set([...envelope.document.pyroxene.collectedSourceKeys, sourceKey])].sort()
                : envelope.document.pyroxene.collectedSourceKeys.filter((key) => key !== sourceKey),
            },
          },
        }))
        .then(trackGuestSave("source"));
      return;
    }
    fetcher.submit(
      { intent: collected ? "collect-source" : "uncollect-source", payload: { sourceKey } },
      { method: collected ? "POST" : "DELETE", encType: "application/json" },
    );
  };

  const handleUpdateEventData = (eventUid: string, patch: PlannerEventDataPatch) => {
    setLocalEventData((prev) => {
      const current = prev.find((entry) => entry.eventUid === eventUid) ?? {
        eventUid,
        completed: false,
        expectedTrials: null,
        pickupChance: null,
      };
      const next: LocalEventData = {
        ...current,
        ...(patch.expectedTrials !== undefined ? { expectedTrials: patch.expectedTrials } : {}),
        ...(patch.pickupChance !== undefined ? { pickupChance: patch.pickupChance } : {}),
        ...(patch.targetTiers !== undefined ? { targetTiers: patch.targetTiers } : {}),
      };
      return [...prev.filter((entry) => entry.eventUid !== eventUid), next];
    });
    if (!signedIn) {
      void guestPlanner
        .update((envelope) => ({
          ...envelope,
          document: {
            ...envelope.document,
            pyroxene: {
              ...envelope.document.pyroxene,
              eventData: withPyroxeneEventDataPatch(envelope.document.pyroxene.eventData, eventUid, patch),
            },
          },
        }))
        .then(trackGuestSave("event_data"));
      return;
    }
    fetcher.submit(
      { intent: "update-event-data", payload: { eventUid, ...patch } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleDeleteCompletion = (eventUid: string) => {
    if (!signedIn) return;
    const completion = localCompletions.find((entry) => entry.eventUid === eventUid);
    if (!completion) return;
    setLocalCompletions((prev) => prev.filter((entry) => entry.eventUid !== eventUid));
    fetcher.submit(
      {
        intent: "delete-pickup-completion",
        payload: { eventUid, recruitmentGroupUid: completion.recruitmentGroupUid },
      },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const handleDeleteItem = (itemUid: string) => {
    const baseUid = extractPyroxeneTimelineBaseUid(itemUid);
    if (!localTimelineItems.some((item) => item.uid.startsWith(baseUid))) return;
    setLocalTimelineItems((prev) => prev.filter((item) => !item.uid.startsWith(baseUid)));
    if (!signedIn) {
      void guestPlanner
        .update((envelope) => ({
          ...envelope,
          document: {
            ...envelope.document,
            pyroxene: {
              ...envelope.document.pyroxene,
              records: envelope.document.pyroxene.records.filter(
                (record) => extractPyroxeneTimelineBaseUid(record.uid) !== baseUid,
              ),
            },
          },
        }))
        .then(trackGuestSave("delete"));
      return;
    }
    fetcher.submit(
      { intent: "delete-timeline-item", payload: { itemUid } },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const handleFavoriteChange = (contentUid: string, studentUid: string, favorited: boolean) => {
    const without = <T extends { contentUid: string; studentUid: string }>(list: T[]) =>
      list.filter((favorite) => !(favorite.contentUid === contentUid && favorite.studentUid === studentUid));
    setLocalFavoritedStudents((current) =>
      favorited ? [...without(current), { contentUid, studentUid }] : without(current),
    );
    if (!signedIn) {
      void guestPlanner.update((envelope) => ({
        ...envelope,
        favorites: favorited
          ? [...without(envelope.favorites), { contentUid, studentUid }]
          : without(envelope.favorites),
      }));
      return;
    }
    favoriteFetcher.submit(
      { favorite: { contentUid, studentUid, favorited } },
      { action: "/api/contents", method: "POST", encType: "application/json" },
    );
  };

  const saveGuestRecord = (record: GuestPyroxeneRecord, replaceAttendance = false) => {
    setLocalTimelineItems((prev) => [
      ...(replaceAttendance ? prev.filter((item) => item.source !== "attendance") : prev),
      ...guestPyroxeneRecordToTimelineItems(record),
    ]);
    const section =
      record.kind === "buy"
        ? "buy"
        : record.kind === "monthlyPackage"
          ? "monthly_package"
          : record.kind === "apPackage"
            ? "ap_package"
            : record.kind === "attendance"
              ? "attendance"
              : "other";
    void guestPlanner
      .update((envelope) => {
        const retained = replaceAttendance
          ? envelope.document.pyroxene.records.filter((item) => item.source !== "attendance")
          : envelope.document.pyroxene.records;
        return {
          ...envelope,
          document: {
            ...envelope.document,
            pyroxene: {
              ...envelope.document.pyroxene,
              records: sortPlannerStateTimelineRecords([...retained, ...guestPyroxeneRecordToTimelineItems(record)]),
            },
          },
        };
      })
      .then(trackGuestSave(section));
  };

  const ensureTimelineSourcesVisible = (sourceTypes: PyroxenePlannerOptions["timeline"]["display"]) => {
    const display = new Set(options.timeline.display);
    const missing = sourceTypes.filter((type) => !display.has(type));
    if (missing.length === 0) return options;
    if (optionsSaveTimer.current) clearTimeout(optionsSaveTimer.current);
    const nextOptions = { ...options, timeline: { ...options.timeline, display: [...display, ...missing] } };
    setOptions(nextOptions);
    if (!signedIn) void guestPlanner.update((envelope) => updateGuestPlannerOptions(envelope, nextOptions));
    return nextOptions;
  };

  // Returns false when another timeline save is still running.
  const beginTimelineSave = () => {
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) return false;
    timelineSaveInFlight.current = true;
    return true;
  };

  const handleSaveBuy = (
    quantity: number,
    date: Date,
    buyOptions?: { repeatType?: PyroxeneTimelineRepeatType; monthlyCount?: number },
  ) => {
    if (!beginTimelineSave()) return;
    if (!signedIn) {
      saveGuestRecord(
        createGuestRecord({ kind: "buy", quantity, date: date.toISOString(), ...buyOptions }) as GuestPyroxeneRecord,
      );
      timelineSaveInFlight.current = false;
      return;
    }
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticBuyTimelineItems(quantity, date, buyOptions)]);
    fetcher.submit(
      { intent: "save-buy", payload: { quantity, date: date.toISOString(), ...buyOptions } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveMonthlyPackage = (
    startDate: Date,
    packageType: PyroxeneMonthlyPackageType,
    autoRepurchase: boolean,
  ) => {
    if (!beginTimelineSave()) return;
    if (!signedIn) {
      saveGuestRecord(
        createGuestRecord({
          kind: "monthlyPackage",
          startDate: startDate.toISOString(),
          packageType,
          autoRepurchase,
        }) as GuestPyroxeneRecord,
      );
      ensureTimelineSourcesVisible(["package_onetime"]);
      timelineSaveInFlight.current = false;
      return;
    }
    setLocalTimelineItems((prev) => [
      ...prev,
      ...createOptimisticMonthlyPackageTimelineItems(startDate, packageType, autoRepurchase),
    ]);
    const nextOptions = ensureTimelineSourcesVisible(["package_onetime"]);
    fetcher.submit(
      {
        intent: "save-monthly-package",
        payload: { startDate: startDate.toISOString(), packageType, autoRepurchase, options: nextOptions },
      },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveApPackage = (startDate: Date, autoRepurchase: boolean) => {
    if (!beginTimelineSave()) return;
    if (!signedIn) {
      saveGuestRecord(
        createGuestRecord({
          kind: "apPackage",
          startDate: startDate.toISOString(),
          autoRepurchase,
        }) as GuestPyroxeneRecord,
      );
      ensureTimelineSourcesVisible(["package_ap"]);
      timelineSaveInFlight.current = false;
      return;
    }
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticApPackageTimelineItems(startDate, autoRepurchase)]);
    const nextOptions = ensureTimelineSourcesVisible(["package_ap"]);
    fetcher.submit(
      {
        intent: "save-ap-package",
        payload: { startDate: startDate.toISOString(), autoRepurchase, options: nextOptions },
      },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveAttendance = (startDate: Date) => {
    if (!beginTimelineSave()) return;
    if (!signedIn) {
      saveGuestRecord(
        createGuestRecord({ kind: "attendance", startDate: startDate.toISOString() }) as GuestPyroxeneRecord,
        true,
      );
      timelineSaveInFlight.current = false;
      return;
    }
    setLocalTimelineItems((prev) => [
      ...prev.filter((item) => item.source !== "attendance"),
      ...createOptimisticAttendanceTimelineItems(startDate),
    ]);
    fetcher.submit(
      { intent: "save-attendance", payload: { startDate: startDate.toISOString() } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveOther = (resources: PickupResources, description: string, date: Date) => {
    if (!beginTimelineSave()) return;
    if (!signedIn) {
      saveGuestRecord(
        createGuestRecord({ kind: "other", resources, description, date: date.toISOString() }) as GuestPyroxeneRecord,
      );
      timelineSaveInFlight.current = false;
      return;
    }
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticOtherTimelineItems(resources, description, date)]);
    fetcher.submit(
      { intent: "save-other", payload: { resources, description, date: date.toISOString() } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleOptionsChange = (newOptions: PyroxenePlannerOptions) => {
    if (JSON.stringify(newOptions) === JSON.stringify(options)) return;
    setOptions(newOptions);
    if (optionsSaveTimer.current) clearTimeout(optionsSaveTimer.current);
    optionsSaveTimer.current = setTimeout(() => {
      if (!signedIn) {
        void guestPlanner
          .update((envelope) => updateGuestPlannerOptions(envelope, newOptions))
          .then(trackGuestSave("options"));
        return;
      }
      fetcher.submit(
        { intent: "save-options", payload: { options: newOptions } },
        { method: "POST", encType: "application/json" },
      );
    }, 500);
  };

  const handleRemoveApChargeException = (uid: string) => {
    if (!options.consumption.apChargeExceptions.some((exception) => exception.uid === uid)) return;
    setOptions((current) => ({
      ...current,
      consumption: {
        ...current.consumption,
        apChargeExceptions: current.consumption.apChargeExceptions.filter((exception) => exception.uid !== uid),
      },
    }));
    if (!signedIn) {
      void guestPlanner
        .update((envelope) => removeGuestPlannerApChargeException(envelope, uid))
        .then(trackGuestSave("delete"));
      return;
    }
    fetcher.submit(
      { intent: "remove-ap-charge-exception", payload: { uid } },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const eventDataMap = useMemo(() => {
    const map = new Map<string, PlannerEventData & PyroxeneTimelineEventData>();
    for (const { eventUid, ...rest } of localEventData) map.set(eventUid, { ...rest, completed: false });
    for (const completion of localCompletions) {
      const existing = map.get(completion.eventUid);
      map.set(completion.eventUid, { expectedTrials: null, ...existing, completed: true });
    }
    return map;
  }, [localEventData, localCompletions]);

  const scheduleItems = usePyroxeneScheduleItems(contents, localFavoritedStudents, localTimelineItems);

  // The display filter does not change the calculation, so it stays out of the calculation input.
  const calcOptions = useMemo<PyroxeneCalculationOptions>(
    () => ({ event: options.event, raid: options.raid, tactical: options.tactical, consumption: options.consumption }),
    [options.event, options.raid, options.tactical, options.consumption],
  );
  const { timeline, pending: timelinePending } = usePyroxeneTimeline({
    initialDate,
    initialResources,
    eventDataMap,
    scheduleItems,
    options: calcOptions,
    collectedSourceKeys: localCollectedSourceKeys,
    recruitmentStacks: stacks,
  });
  const displayTimeline = useMemo(
    () => buildPyroxeneDisplayTimeline(timeline, scheduleItems, initialDate ?? new Date(), initialResources),
    [initialDate, initialResources, scheduleItems, timeline],
  );
  const markers = useMemo(() => numberTargetEvents(timeline), [timeline]);

  const sourceSets = useMemo(() => {
    const now = dayjs();
    const collectable = new Set<string>();
    const rewards = new Map<string, PickupResources>();
    for (const item of scheduleItems) {
      if (!item.event?.earnablePyroxene) continue;
      const key = collectedSourceKeyForEventReward(item.event.uid);
      rewards.set(key, { pyroxene: item.event.earnablePyroxene, oneTimeTicket: 0, tenTimeTicket: 0 });
      if (!dayjs(item.event.since).isAfter(now)) collectable.add(key);
    }
    return { collectable, rewards };
  }, [scheduleItems]);
  const completedEventUids = useMemo(
    () => new Set([...eventDataMap].flatMap(([uid, value]) => (value.completed ? [uid] : []))),
    [eventDataMap],
  );
  const rows = useMemo(
    () =>
      buildPlannerTimelineRows(displayTimeline, {
        display: options.timeline.display,
        hideUntargeted,
        selectedEventUid: loaderData.selectedEventUid,
        completedEventUids,
        collectedSourceKeys: new Set(localCollectedSourceKeys),
        collectableSourceKeys: sourceSets.collectable,
        collectedSourceResources: sourceSets.rewards,
        markers,
      }),
    [
      displayTimeline,
      options.timeline.display,
      hideUntargeted,
      loaderData.selectedEventUid,
      completedEventUids,
      localCollectedSourceKeys,
      sourceSets,
      markers,
    ],
  );
  const recruitedStudentUids = useMemo(
    () => new Set(loaderData.recruitedStudentUids),
    [loaderData.recruitedStudentUids],
  );
  const activePackages = useMemo(
    () => getActivePyroxenePackages(scheduleItems, initialDate ?? new Date()),
    [scheduleItems, initialDate],
  );
  const attendanceStart = useMemo(() => {
    const rewardDates = localTimelineItems
      .filter((item) => item.source === "attendance")
      .map((item) => new Date(item.eventAt));
    return getAttendanceStartDate(rewardDates);
  }, [localTimelineItems]);
  const assumptions = useMemo(
    () => buildPyroxeneCalculationAssumptions(scheduleItems, options.event.pickupChance, initialDate ?? new Date()),
    [scheduleItems, options.event.pickupChance, initialDate],
  );

  const selectedEventUid = loaderData.selectedEventUid;
  const selectedEventVisible =
    selectedEventUid !== null &&
    rows.some((row) => row.kind === "event" && row.entry.source.event?.uid === selectedEventUid);
  useEffect(() => {
    setSelectedEventMissing(false);
    if (!selectedEventUid || timelinePending) return;
    const target = selectedEventRef.current;
    if (!selectedEventVisible || !target) {
      setSelectedEventMissing(true);
      return;
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }, [timelinePending, selectedEventVisible, selectedEventUid]);

  const ownedValues = useMemo<OwnedResourceValues>(
    () => ({ resources: initialResources, stacks }),
    [initialResources, stacks],
  );
  const saving = Boolean(signedIn) && (fetcher.state !== "idle" || ownedResourcesFetcher.state !== "idle");
  const guestStatus = guestPlanner.snapshot?.status;
  const hasGuestLegacyConflicts =
    guestPlanner.snapshot && "envelope" in guestPlanner.snapshot
      ? guestPlanner.snapshot.envelope.legacyConflicts.length > 0
      : false;
  const hasGuestData =
    guestPlanner.snapshot &&
    (isGuestSnapshotUsable(guestStatus) || guestStatus === "conflict") &&
    "envelope" in guestPlanner.snapshot
      ? guestPlanner.snapshot.legacySources.pyroxeneCorrupt ||
        guestPlanner.snapshot.legacySources.eventShopsCorrupt ||
        guestPlannerHasImportableData(guestPlanner.snapshot.envelope, new Set(localCollectedSourceKeys))
      : false;
  const revisionConflictError =
    fetcher.data &&
    "revisionConflict" in fetcher.data &&
    fetcher.data.revisionConflict === true &&
    "error" in fetcher.data
      ? String(fetcher.data.error)
      : null;

  const notice = revisionConflictError ? (
    <StatusNotice tone="danger">{revisionConflictError}</StatusNotice>
  ) : ownedResourceSaveError ? (
    <StatusNotice tone="danger">{ownedResourceSaveError}</StatusNotice>
  ) : signedIn && hasGuestLegacyConflicts ? (
    <StatusNotice tone="warning" action={<ImportLink />}>
      이전 화면과 이 화면에서 같은 항목을 다르게 바꾼 계획이 있어요. 내용을 확인하고 사용할 값을 선택해주세요.
    </StatusNotice>
  ) : signedIn && hasGuestData ? (
    <StatusNotice tone="neutral" action={<ImportLink />}>
      로그인하기 전에 입력한 데이터가 있어요. 계정에 저장된 내용과 비교해 사용할 데이터를 선택해주세요.
    </StatusNotice>
  ) : !signedIn && guestStatus === "memory" ? (
    <StatusNotice tone="warning">이 브라우저에 저장하지 못했어요. 탭을 닫으면 입력한 내용이 사라져요.</StatusNotice>
  ) : !signedIn && guestStatus === "corrupt" ? (
    <StatusNotice
      tone="danger"
      action={
        <Button size="sm" variant="danger-subtle" onClick={guestPlanner.reset}>
          저장된 데이터 초기화
        </Button>
      }
    >
      저장된 데이터를 불러오지 못했어요.
    </StatusNotice>
  ) : !signedIn && hasGuestLegacyConflicts ? (
    <StatusNotice tone="warning">
      이전 화면과 이 화면에서 같은 항목을 다르게 바꾼 계획이 있어요. 덮어쓰지 않았으니 로그인 후 확인해주세요.
    </StatusNotice>
  ) : !signedIn && guestStatus === "conflict" ? (
    <StatusNotice tone="warning">다른 탭에서 로그인하지 않은 상태의 플래너가 바뀌었어요.</StatusNotice>
  ) : !signedIn && guestStatus === "unavailable" ? (
    <StatusNotice tone="danger">브라우저 플래너 저장소를 사용할 수 없어요.</StatusNotice>
  ) : !signedIn ? (
    <StatusNotice
      tone="neutral"
      action={
        <Button size="sm" variant="primary" onClick={showSignIn}>
          로그인
        </Button>
      }
    >
      지금은 이 브라우저에만 저장돼요. 로그인하면 계정에 저장하고 다른 기기에서도 볼 수 있어요.
    </StatusNotice>
  ) : null;

  const incomeHandlers = {
    onOptionsChange: handleOptionsChange,
    onRemoveApChargeException: handleRemoveApChargeException,
    onDeleteItem: handleDeleteItem,
    onSaveBuy: handleSaveBuy,
    onSaveMonthlyPackage: handleSaveMonthlyPackage,
    onSaveApPackage: handleSaveApPackage,
    onSaveAttendance: handleSaveAttendance,
    onSaveOther: handleSaveOther,
  };

  const basisPanel = (
    <PickupBasisPanel
      value={options.event.pickupChance}
      onChange={(pickupChance) => handleOptionsChange({ ...options, event: { pickupChance } })}
      onShowMethod={() => setMethodDialogOpen(true)}
    />
  );
  const incomeAddButton = <IncomePlanAddButton onClick={() => setIncomeAddOpen(true)} />;
  const incomePanel = (
    <IncomePlanPanel
      options={options}
      activePackages={activePackages}
      attendanceStart={attendanceStart}
      saving={saving}
      handlers={incomeHandlers}
    />
  );

  return (
    <V2Page width="wide">
      <PageHeader
        title="청휘석 플래너"
        description="관심 학생을 모집할 때 청휘석이 충분한지 미리 계산해요"
        trailing={
          signedIn ? (
            <span role="status" className="text-xs text-v2-fg-tertiary">
              {saving ? "저장 중…" : null}
            </span>
          ) : null
        }
      />
      <PageMain>
        <div className="@container flex flex-col gap-v2-block-gap">
          {notice}
          <section aria-label="청휘석 변화" className="rounded-lg bg-v2-surface p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold text-v2-fg">청휘석 변화</h2>
              <p className="flex items-center gap-3 text-xs text-v2-fg-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-v2-accent" />
                  예상 잔액
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-2.5 w-3 rounded-sm bg-v2-accent/15" />
                  상하위 10% 이내 (10번 중 8번은 이 안)
                </span>
              </p>
            </div>
            <Suspense fallback={<div className="h-56" />}>
              <BalanceChart timeline={timeline} markers={markers} />
            </Suspense>
          </section>
          <PlannerSchedule
            rows={rows}
            pending={timelinePending}
            display={options.timeline.display}
            onDisplayChange={(display) =>
              handleOptionsChange({ ...options, timeline: { ...options.timeline, display } })
            }
            hideUntargeted={hideUntargeted}
            onHideUntargetedChange={handleHideUntargetedChange}
            selectedEventUid={selectedEventUid}
            selectedEventRef={selectedEventRef}
            selectedEventMissing={selectedEventMissing}
            eventDataMap={eventDataMap}
            defaultBasis={options.event.pickupChance}
            recruitedStudentUids={recruitedStudentUids}
            currentStacks={stacks}
            canRecordCompletion={Boolean(signedIn)}
            eventHandlers={{
              onFavoriteChange: handleFavoriteChange,
              onUpdateEventData: handleUpdateEventData,
              onComplete: (eventUid, values) => handleSaveOwnedResources(eventUid, values),
              onDeleteCompletion: handleDeleteCompletion,
            }}
            incomeHandlers={{ onDeleteItem: handleDeleteItem, onCollectedSourceChange: handleCollectedSourceChange }}
          />
        </div>
      </PageMain>
      <PageAside>
        <PanelSheet
          panelId={RESOURCES_DIALOG_PANEL}
          title="보유 재화"
          description={formatInputAt(initialDate)}
          Icon={WalletIcon}
          headerAction={<OwnedResourcesHeaderAction onEdit={() => setResourcesDialogOpen(true)} />}
        >
          <OwnedResourceList values={ownedValues} stacksEntered={stacksEntered} />
        </PanelSheet>
        <PanelSheet panelId="basis" title="계산 기준" Icon={ChartBarIcon}>
          {basisPanel}
        </PanelSheet>
        <PanelSheet panelId="income" title="수급 계획" Icon={ArrowTrendingUpIcon} headerAction={incomeAddButton}>
          {incomePanel}
        </PanelSheet>
        <AsideLinks
          items={[
            { key: "futures", title: "미래시", Icon: CalendarIcon, to: "/futures" },
            { key: "planner", title: "통합 플래너", Icon: Squares2X2Icon, to: "/planner" },
          ]}
        />
      </PageAside>
      <MobileActionBar
        leading={
          <button
            type="button"
            onClick={() => setResourcesDialogOpen(true)}
            aria-label={`보유 재화 수정, 청휘석 ${formatAmount(initialResources.pyroxene)}, 10회 모집 티켓 ${initialResources.tenTimeTicket}, 1회 모집 티켓 ${initialResources.oneTimeTicket}`}
            className={cn(
              "flex h-full min-h-12 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg bg-v2-elevated px-4 py-1.5 text-left shadow-lg hover:bg-v2-hover",
              v2FocusRing,
            )}
          >
            <span className="flex min-w-0 flex-1 flex-col items-start">
              <span className="flex items-center gap-3 text-base font-semibold text-v2-fg tabular-nums">
                <span className="inline-flex items-center gap-0.5">
                  <ResourceIcon resource="pyroxene" className="size-7" />
                  {formatAmount(initialResources.pyroxene)}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <ResourceIcon resource="tenTimeTicket" className="size-7" />
                  {formatAmount(initialResources.tenTimeTicket)}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <ResourceIcon resource="oneTimeTicket" className="size-7" />
                  {formatAmount(initialResources.oneTimeTicket)}
                </span>
              </span>
              <span className="text-xs text-v2-fg-tertiary tabular-nums">{formatInputAt(initialDate)}</span>
            </span>
            <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
          </button>
        }
        panels={[{ panelId: PLAN_SHEET_PANEL_ID, title: "계획", Icon: AdjustmentsHorizontalIcon }]}
      />
      <PlanSheet
        title="계획"
        Icon={AdjustmentsHorizontalIcon}
        sections={[
          { key: "basis", title: "계산 기준", Icon: ChartBarIcon, content: basisPanel },
          {
            key: "income",
            title: "수급 계획",
            Icon: ArrowTrendingUpIcon,
            headerAction: incomeAddButton,
            content: incomePanel,
          },
        ]}
      />
      <OwnedResourcesDialog
        open={resourcesDialogOpen}
        title="보유 재화"
        submitLabel="저장"
        initialValues={ownedValues}
        onClose={() => setResourcesDialogOpen(false)}
        onSubmit={(values) => {
          handleSaveOwnedResources(null, values);
          setResourcesDialogOpen(false);
        }}
      />
      <AddIncomeDialog
        open={incomeAddOpen}
        onClose={() => setIncomeAddOpen(false)}
        saving={saving}
        handlers={incomeHandlers}
      />
      <CalculationMethodDialog
        open={methodDialogOpen}
        onClose={() => setMethodDialogOpen(false)}
        assumptions={assumptions}
      />
    </V2Page>
  );
}

function ImportLink() {
  return (
    <a
      href={PYROXENE_GUEST_IMPORT_HREF}
      className="text-sm font-medium text-v2-link underline-offset-2 hover:underline"
    >
      내용 확인
    </a>
  );
}
