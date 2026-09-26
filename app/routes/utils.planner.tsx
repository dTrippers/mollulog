import { CreditCardIcon, ShoppingBagIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, useFetcher, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { useGuestPyroxenePlanner, usePyroxeneScheduleItems } from "~/components/features/futures";
import { usePyroxeneTimeline } from "~/components/features/futures/usePyroxeneTimeline";
import Page from "~/components/features/layout/Page";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { createDefaultEventShopState, type EventShopState } from "~/domain/event-shop-state";
import {
  type AccountEventShopPlanLookup,
  compareGuestEventShopPlans,
  countUnresolvedGuestEventShopPlans,
  type GuestEventShopPlan,
  isDefaultEventShopState,
} from "~/domain/guest-event-shop-planner";
import {
  type GuestPyroxenePlannerData,
  type GuestPyroxeneRecord,
  guestPyroxeneRecordFingerprint,
  guestPyroxeneRecordToTimelineItems,
  guestPyroxeneTimelineItems,
  pyroxeneTimelineItemFingerprint,
} from "~/domain/guest-pyroxene-planner";
import {
  buildPlannerDisplayPeriods,
  buildPlannerPeriods,
  buildPublicPlannerPeriods,
  formatPlannerPeriodDate,
  formatPlannerPeriodEndDate,
  getPlannerMonthEndInstant,
  getPlannerPlannedEventUids,
  getPlannerRaidScheduleFacts,
  getPlannerTodayMonth,
  type PlannerScheduleContentInput,
  projectPlannerCalendarResources,
  shiftPlannerMonth,
  summarizePyroxeneTimeline,
} from "~/domain/integrated-planner";
import {
  defaultPyroxenePlannerOptions,
  normalizePyroxenePlannerOptions,
  type PyroxeneCalculationOptions,
  type PyroxenePlannerOptions,
} from "~/domain/pyroxene-planner";
import { extractPyroxeneTimelineBaseUid } from "~/domain/pyroxene-sources";
import type { GuestEventShopPlannerSnapshot } from "~/lib/guest-event-shop-planner.client";
import { readGuestEventShopPlanner, subscribeGuestEventShopPlanner } from "~/lib/guest-event-shop-planner.client";
import { updateGuestPyroxenePlanner } from "~/lib/guest-pyroxene-planner.client";
import { saveIntegratedPlannerRecruitmentPlan } from "~/models/integrated-planner";
import {
  createBuyPyroxene,
  createOtherPyroxeneGain,
  createPyroxeneApPackage,
  createPyroxeneMonthlyPackage,
  updatePyroxeneOneOffTimelineItem,
} from "~/models/pyroxene-planner";
import type { EventShopStateLookupResponse } from "~/routes/api.utils.planner.event-shop-states";
import { getIntegratedPlannerData } from "~/views/integrated-planner";
import { getPyroxenePlannerContents, type PyroxenePlannerContent } from "~/views/pyroxene";
import PlannerCalendar, { type PlannerCalendarShopPlan } from "./utils.planner._components/PlannerCalendar";
import type { PlannerQuickEditEntry } from "./utils.planner._components/PlannerQuickEdit";
import type {
  PlannerRecruitmentSavedState,
  PlannerRecruitmentSaveInput,
  PlannerRecruitmentSaveResult,
} from "./utils.planner._components/PlannerRecruitmentEditor";

export const meta: MetaFunction = () => [
  { title: "통합 플래너 | 몰루로그" },
  { name: "description", content: "모집·청휘석·이벤트 상점 계획을 날짜별로 확인하고 관리해보세요." },
];

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const user = await getActiveSensei(env, request);
  const data = await getIntegratedPlannerData(env, user?.id ?? null, ctx);
  return { ...data, signedIn: user !== null, now: new Date().toISOString() };
};

function integerField(formData: FormData, name: string, minimum: number, maximum = 10_000_000): number | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function guestOneOffEntry(record: GuestPyroxeneRecord, timeZone: string): PlannerQuickEditEntry | null {
  if (record.kind === "buy") {
    if (record.repeatType === "monthly_first") return null;
    const item = guestPyroxeneRecordToTimelineItems(record)[0];
    if (!item) return null;
    return {
      id: record.recordId,
      kind: "buy",
      date: formatPlannerPeriodDate(item.eventAt, timeZone),
      description: "청휘석 구매",
      quantity: record.quantity * (record.monthlyCount ?? 1),
      resources: { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 },
    };
  }
  if (record.kind === "other") {
    const item = guestPyroxeneRecordToTimelineItems(record)[0];
    if (!item) return null;
    return {
      id: record.recordId,
      kind: "other",
      date: formatPlannerPeriodDate(item.eventAt, timeZone),
      description: record.description,
      quantity: 0,
      resources: record.resources,
    };
  }
  return null;
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  const formData = await request.formData();
  const submissionId = formData.get("submissionId");
  const response = (success: boolean, error?: string, status = 200) =>
    data(
      {
        success,
        ...(typeof submissionId === "string" ? { submissionId } : {}),
        ...(error ? { error } : {}),
      },
      { status },
    );

  if (!currentUser) return response(false, "로그인이 필요해요.", 401);

  const intent = formData.get("intent");
  const kind = formData.get("kind");
  const date = formData.get("dateInstant");
  if (intent === "save-recruitment") {
    const eventUid = formData.get("eventUid");
    const rawStudentUids = formData.getAll("studentUid");
    if (
      typeof eventUid !== "string" ||
      eventUid.length === 0 ||
      eventUid.length > 512 ||
      !rawStudentUids.every((value) => typeof value === "string" && value.length > 0 && value.length <= 512) ||
      new Set(rawStudentUids).size !== rawStudentUids.length
    ) {
      return response(false, "모집 계획을 확인해주세요.", 400);
    }
    const studentUids = rawStudentUids as string[];
    try {
      const contents = await getPyroxenePlannerContents(env, false, ctx);
      const event = contents.find(
        (content): content is Extract<PyroxenePlannerContent, { kind: "event" }> =>
          content.kind === "event" && content.uid === eventUid,
      );
      if (!event?.recruitmentGroupUid) return response(false, "선택한 모집 일정을 확인할 수 없어요.", 404);
      const availableStudentUids = new Set(
        contents.flatMap((content) =>
          content.kind !== "event"
            ? []
            : content.recruitments.flatMap((recruitment) =>
                recruitment.student && (recruitment.sourceContentUid ?? content.uid) === eventUid
                  ? [recruitment.student.uid]
                  : [],
              ),
        ),
      );
      if (studentUids.some((studentUid) => !availableStudentUids.has(studentUid))) {
        return response(false, "선택한 학생을 해당 모집 일정에서 찾을 수 없어요.", 400);
      }

      await saveIntegratedPlannerRecruitmentPlan(env, currentUser.id, eventUid, studentUids, ctx);
      return response(true);
    } catch {
      return response(false, "모집 계획을 저장하지 못했어요. 입력을 보존했으니 다시 시도해주세요.", 500);
    }
  }

  if (typeof date !== "string" || !Number.isFinite(Date.parse(date))) {
    return response(false, "입력한 날짜나 요청을 확인해주세요.", 400);
  }

  if (intent === "create-package" && kind === "package") {
    const packageType = formData.get("packageType");
    if (packageType !== "half" && packageType !== "full" && packageType !== "ap") {
      return response(false, "패키지 종류를 확인해주세요.", 400);
    }
    try {
      if (packageType === "ap") {
        await createPyroxeneApPackage(env, currentUser.id, date, false);
      } else {
        await createPyroxeneMonthlyPackage(env, currentUser.id, date, packageType, false);
      }
      return response(true);
    } catch {
      return response(false, "패키지 계획을 저장하지 못했어요. 다시 시도해주세요.", 500);
    }
  }

  if ((intent !== "create" && intent !== "update") || (kind !== "buy" && kind !== "other")) {
    return response(false, "입력한 날짜나 요청을 확인해주세요.", 400);
  }

  const uid = formData.get("uid");
  if (intent === "update" && (typeof uid !== "string" || uid.length === 0 || uid.length > 200)) {
    return response(false, "수정할 항목을 확인할 수 없어요.", 400);
  }

  const pyroxene = kind === "buy" ? integerField(formData, "quantity", 1) : integerField(formData, "pyroxene", 0);
  const oneTimeTicket = kind === "other" ? integerField(formData, "oneTimeTicket", 0) : 0;
  const tenTimeTicket = kind === "other" ? integerField(formData, "tenTimeTicket", 0) : 0;
  const description = formData.get("description");
  if (pyroxene === null || oneTimeTicket === null || tenTimeTicket === null) {
    return response(false, kind === "buy" ? "구매 수량을 확인해주세요." : "재화 수량을 확인해주세요.", 400);
  }
  if (
    kind === "other" &&
    (typeof description !== "string" ||
      description.trim().length === 0 ||
      description.trim().length > 200 ||
      (pyroxene === 0 && oneTimeTicket === 0 && tenTimeTicket === 0))
  ) {
    return response(false, "이름과 입력할 재화 수량을 확인해주세요.", 400);
  }

  try {
    if (intent === "create") {
      if (kind === "buy") {
        await createBuyPyroxene(env, currentUser.id, date, pyroxene, { repeatType: "fixed_days", monthlyCount: 1 });
      } else {
        await createOtherPyroxeneGain(
          env,
          currentUser.id,
          date,
          pyroxene,
          oneTimeTicket,
          tenTimeTicket,
          (description as string).trim(),
        );
      }
      return response(true);
    }

    const updated = await updatePyroxeneOneOffTimelineItem(
      env,
      currentUser.id,
      uid as string,
      {
        source: kind,
        date,
        description: kind === "buy" ? "청휘석 구매" : (description as string).trim(),
        pyroxeneDelta: pyroxene,
        oneTimeTicketDelta: oneTimeTicket,
        tenTimeTicketDelta: tenTimeTicket,
      },
      { ctx },
    );
    return updated
      ? response(true)
      : response(
          false,
          "반복 계획이나 이미 변경된 항목은 이 화면에서 수정할 수 없어요. 상세 플래너에서 확인해주세요.",
          409,
        );
  } catch {
    return response(false, "청휘석 계획을 저장하지 못했어요. 입력을 보존했으니 다시 시도해주세요.", 500);
  }
};

const ZERO_RESOURCES = { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };

function defaultCalculationOptions(options: PyroxenePlannerOptions): PyroxeneCalculationOptions {
  return {
    event: options.event,
    raid: options.raid,
    tactical: options.tactical,
    consumption: options.consumption,
  };
}

function monthEnd(monthKey: string, timeZone: string): Date {
  return getPlannerMonthEndInstant(monthKey, timeZone);
}

function getGuestShopPlans(snapshot: GuestEventShopPlannerSnapshot | null): GuestEventShopPlan[] {
  if (!snapshot || (snapshot.status !== "ready" && snapshot.status !== "memory" && snapshot.status !== "conflict")) {
    return [];
  }
  return Object.values(snapshot.envelope.data.plans);
}

function getLookupMap(
  response: EventShopStateLookupResponse | null,
  guestPlans: readonly GuestEventShopPlan[],
): Record<string, AccountEventShopPlanLookup> {
  const lookupByShopStateUid: Record<string, AccountEventShopPlanLookup> = Object.fromEntries(
    guestPlans.map(({ shopStateUid }) => [shopStateUid, { status: "unavailable" as const }]),
  );
  if (!response?.success) return lookupByShopStateUid;

  const plansByShopStateUid = new Map(guestPlans.map((plan) => [plan.shopStateUid, plan]));
  for (const row of response.states) {
    const plan = plansByShopStateUid.get(row.shopStateUid);
    if (!plan || plan.timelineUid !== row.timelineUid) continue;
    lookupByShopStateUid[row.shopStateUid] =
      row.status === "available" ? { status: "available", state: row.state } : { status: "unavailable" };
  }
  return lookupByShopStateUid;
}

function getShopDefaultsByStateUid(
  response: EventShopStateLookupResponse | null,
  guestPlans: readonly GuestEventShopPlan[],
  baseDefaults: Readonly<Record<string, EventShopState>>,
): Record<string, EventShopState> {
  const defaults = { ...baseDefaults };
  if (!response?.success) return defaults;
  const plansByShopStateUid = new Map(guestPlans.map((plan) => [plan.shopStateUid, plan]));
  for (const row of response.states) {
    const plan = plansByShopStateUid.get(row.shopStateUid);
    if (!plan || plan.timelineUid !== row.timelineUid || row.status !== "available") continue;
    if (row.defaultState) defaults[row.shopStateUid] = row.defaultState;
    else delete defaults[row.shopStateUid];
  }
  return defaults;
}

export default function IntegratedPlannerRoute() {
  const loaderData = useLoaderData<typeof loader>();
  const displayTimeZone = useDisplayTimeZone();
  const pyroxeneGuestPlanner = usePyroxeneScheduleGuestState();
  const recruitmentFetcher = useFetcher<typeof action>();
  const [guestShopSnapshot, setGuestShopSnapshot] = useState<GuestEventShopPlannerSnapshot | null>(null);
  const [guestShopComparison, setGuestShopComparison] = useState<{
    signature: string;
    response: EventShopStateLookupResponse;
    requestFailed: boolean;
  } | null>(null);
  const [visibleMonthCount, setVisibleMonthCount] = useState(1);
  const [guestRecruitmentIsSaving, setGuestRecruitmentIsSaving] = useState(false);
  const [guestRecruitmentSaveResult, setGuestRecruitmentSaveResult] = useState<PlannerRecruitmentSaveResult | null>(
    null,
  );

  useEffect(() => {
    const refresh = () => setGuestShopSnapshot(readGuestEventShopPlanner());
    refresh();
    return subscribeGuestEventShopPlanner(refresh);
  }, []);

  const guestShopPlans = useMemo(() => getGuestShopPlans(guestShopSnapshot), [guestShopSnapshot]);
  const guestShopPlanSignature = useMemo(
    () =>
      JSON.stringify(
        guestShopPlans
          .map(({ timelineUid, shopStateUid }) => ({ timelineUid, shopStateUid }))
          .sort((left, right) => left.shopStateUid.localeCompare(right.shopStateUid)),
      ),
    [guestShopPlans],
  );

  useEffect(() => {
    if (!loaderData.signedIn || guestShopPlans.length === 0) return;
    const controller = new AbortController();
    const chunks: GuestEventShopPlan[][] = [];
    for (let index = 0; index < guestShopPlans.length; index += 500) {
      chunks.push(guestShopPlans.slice(index, index + 500));
    }

    void Promise.all(
      chunks.map(async (plans) => {
        try {
          const response = await fetch("/api/utils/planner/event-shop-states", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              events: plans.map(({ timelineUid, shopStateUid }) => ({ timelineUid, shopStateUid })),
            }),
            signal: controller.signal,
          });
          const body = (await response.json()) as EventShopStateLookupResponse;
          return response.ok && body.success ? { body, failed: false } : { body, failed: true };
        } catch {
          return { body: null, failed: true };
        }
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const states: EventShopStateLookupResponse["states"] = [];
      let requestFailed = false;
      results.forEach((result, index) => {
        const chunk = chunks[index] ?? [];
        requestFailed ||= result.failed;
        if (result.body?.success) {
          states.push(...result.body.states);
          return;
        }
        states.push(
          ...chunk.map(({ timelineUid, shopStateUid }) => ({
            timelineUid,
            shopStateUid,
            status: "unavailable" as const,
          })),
        );
      });

      const response: EventShopStateLookupResponse = { success: true, states };
      setGuestShopComparison({ signature: guestShopPlanSignature, response, requestFailed });
    });

    return () => controller.abort();
  }, [guestShopPlanSignature, guestShopPlans, loaderData.signedIn]);

  const initialMonth = useMemo(
    () => getPlannerTodayMonth(loaderData.now, displayTimeZone),
    [displayTimeZone, loaderData.now],
  );
  const todayDateKey = useMemo(
    () => formatPlannerPeriodDate(loaderData.now, displayTimeZone),
    [displayTimeZone, loaderData.now],
  );
  const lastVisibleMonth = shiftPlannerMonth(initialMonth, visibleMonthCount - 1);
  const timelineEndDate = useMemo(
    () => monthEnd(lastVisibleMonth, displayTimeZone),
    [displayTimeZone, lastVisibleMonth],
  );

  const accountState = loaderData.accountState;
  const isSignedIn = loaderData.signedIn;
  const guestData =
    !isSignedIn && (pyroxeneGuestPlanner.status === "ready" || pyroxeneGuestPlanner.status === "memory")
      ? pyroxeneGuestPlanner.data
      : null;
  const selectedPlannerOptions = isSignedIn
    ? (accountState?.options ?? defaultPyroxenePlannerOptions)
    : (guestData?.options ?? defaultPyroxenePlannerOptions);
  const localTimelineItems = useMemo(
    () => (isSignedIn ? (accountState?.timelineItems ?? []) : guestData ? guestPyroxeneTimelineItems(guestData) : []),
    [accountState?.timelineItems, guestData, isSignedIn],
  );
  const favoritedStudents = useMemo(
    () => (isSignedIn ? (accountState?.favoritedStudents ?? []) : (guestData?.favoriteStudents ?? [])),
    [accountState?.favoritedStudents, guestData?.favoriteStudents, isSignedIn],
  );
  const eventTrials = useMemo(
    () =>
      isSignedIn
        ? (accountState?.eventData.map(({ eventUid, expectedTrials }) => ({ eventUid, expectedTrials })) ?? [])
        : Object.entries(guestData?.eventTrials ?? {}).map(([eventUid, expectedTrials]) => ({
            eventUid,
            expectedTrials,
          })),
    [accountState?.eventData, guestData?.eventTrials, isSignedIn],
  );
  const collectedSourceKeys = useMemo(
    () => (isSignedIn ? (accountState?.collectedSourceKeys ?? []) : (guestData?.collectedSourceKeys ?? [])),
    [accountState?.collectedSourceKeys, guestData?.collectedSourceKeys, isSignedIn],
  );
  const recruitmentCompletions = useMemo(
    () => (isSignedIn ? (accountState?.recruitmentCompletions ?? []) : []),
    [accountState?.recruitmentCompletions, isSignedIn],
  );
  const recruitmentSavedStates = useMemo<PlannerRecruitmentSavedState[]>(() => {
    const favoritesByEventUid = new Map<string, string[]>();
    for (const favorite of favoritedStudents) {
      const favoriteStudentUids = favoritesByEventUid.get(favorite.contentUid) ?? [];
      favoriteStudentUids.push(favorite.studentUid);
      favoritesByEventUid.set(favorite.contentUid, favoriteStudentUids);
    }
    const trialsByEventUid = new Map(eventTrials.map(({ eventUid, expectedTrials }) => [eventUid, expectedTrials]));
    const eventUids = new Set([...favoritesByEventUid.keys(), ...trialsByEventUid.keys()]);
    return [...eventUids].map((eventUid) => ({
      eventUid,
      expectedTrials: trialsByEventUid.get(eventUid) ?? null,
      favoriteStudentUids: favoritesByEventUid.get(eventUid) ?? [],
    }));
  }, [eventTrials, favoritedStudents]);
  const currentResources = isSignedIn ? accountState?.latestResources : guestData?.resources;
  const hasResourceInput = Boolean(currentResources?.inputAt);
  const initialResources = currentResources ?? ZERO_RESOURCES;
  const initialDate = useMemo(
    () => (currentResources?.inputAt ? new Date(currentResources.inputAt) : null),
    [currentResources?.inputAt],
  );

  const unresolvedGuestPyroxeneUnitCount = useMemo(() => {
    const guest = pyroxeneGuestPlanner.data;
    if (!isSignedIn || !guest) return 0;
    if (loaderData.accountStateStatus !== "available" || !accountState) {
      return (
        Number(guest.resources !== null) +
        Number(guest.optionsChanged) +
        guest.records.length +
        Object.keys(guest.eventTrials).length +
        new Set(guest.favoriteStudents.map(({ contentUid, studentUid }) => `${contentUid}\u0000${studentUid}`)).size +
        new Set(guest.collectedSourceKeys).size
      );
    }

    const accountRecordsByUid = new Map<string, typeof accountState.timelineItems>();
    for (const item of accountState.timelineItems) {
      const baseUid = extractPyroxeneTimelineBaseUid(item.uid);
      accountRecordsByUid.set(baseUid, [...(accountRecordsByUid.get(baseUid) ?? []), item]);
    }
    const accountRecordFingerprints = new Set(
      [...accountRecordsByUid.values()].map((items) => items.map(pyroxeneTimelineItemFingerprint).sort().join("|")),
    );
    const accountEventTrials = new Map(
      accountState.eventData.map(({ eventUid, expectedTrials }) => [eventUid, expectedTrials]),
    );
    const accountFavoriteKeys = new Set(
      accountState.favoritedStudents.map(({ contentUid, studentUid }) => `${contentUid}\u0000${studentUid}`),
    );
    const accountSourceKeys = new Set(accountState.collectedSourceKeys);
    let unresolved = 0;

    if (guest.resources) {
      const accountResources = accountState.latestResources;
      const sameResources =
        accountResources.inputAt !== null &&
        accountResources.inputAt === guest.resources.inputAt &&
        accountResources.pyroxene === guest.resources.pyroxene &&
        accountResources.oneTimeTicket === guest.resources.oneTimeTicket &&
        accountResources.tenTimeTicket === guest.resources.tenTimeTicket;
      if (!sameResources) unresolved += 1;
    }
    if (
      guest.optionsChanged &&
      JSON.stringify(normalizePyroxenePlannerOptions(guest.options)) !==
        JSON.stringify(normalizePyroxenePlannerOptions(accountState.options))
    ) {
      unresolved += 1;
    }
    for (const record of guest.records) {
      if (!accountRecordFingerprints.has(guestPyroxeneRecordFingerprint(record))) unresolved += 1;
    }
    for (const [eventUid, expectedTrials] of Object.entries(guest.eventTrials)) {
      if (accountEventTrials.get(eventUid) !== expectedTrials) unresolved += 1;
    }
    for (const favorite of guest.favoriteStudents) {
      if (!accountFavoriteKeys.has(`${favorite.contentUid}\u0000${favorite.studentUid}`)) unresolved += 1;
    }
    for (const sourceKey of new Set(guest.collectedSourceKeys)) {
      if (!accountSourceKeys.has(sourceKey)) unresolved += 1;
    }
    return unresolved;
  }, [accountState, isSignedIn, loaderData.accountStateStatus, pyroxeneGuestPlanner.data]);

  const baseShopDefaultsByStateUid = useMemo(() => {
    const defaults: Record<string, EventShopState> = {};
    const recruitedStudentUids = isSignedIn ? accountState?.recruitedStudentUids : [];
    if (!recruitedStudentUids) return defaults;
    for (const event of loaderData.shopEvents) {
      if (!event.shopStateUid || !event.content) continue;
      defaults[event.shopStateUid] = createDefaultEventShopState(event.content.stages, recruitedStudentUids);
    }
    return defaults;
  }, [accountState?.recruitedStudentUids, isSignedIn, loaderData.shopEvents]);

  const oneOffEntries = useMemo<PlannerQuickEditEntry[]>(() => {
    if (isSignedIn) {
      return (accountState?.timelineItems ?? []).flatMap((item) => {
        if (
          (item.source !== "buy" && item.source !== "other") ||
          item.repeatType !== "fixed_days" ||
          item.repeatIntervalDays !== null ||
          item.repeatCount !== null ||
          item.autoRepurchase
        ) {
          return [];
        }
        return [
          {
            id: item.uid,
            kind: item.source,
            date: formatPlannerPeriodDate(item.eventAt, displayTimeZone),
            description: item.description,
            quantity: item.source === "buy" ? item.pyroxeneDelta : 0,
            resources: {
              pyroxene: item.source === "other" ? item.pyroxeneDelta : 0,
              oneTimeTicket: item.oneTimeTicketDelta,
              tenTimeTicket: item.tenTimeTicketDelta,
            },
          },
        ];
      });
    }
    return (guestData?.records ?? []).flatMap((record) => {
      const entry = guestOneOffEntry(record, displayTimeZone);
      return entry ? [entry] : [];
    });
  }, [accountState?.timelineItems, displayTimeZone, guestData?.records, isSignedIn]);

  const eventDataMap = useMemo(() => {
    const map = new Map<string, { completed: boolean; expectedTrials: number | null }>();
    for (const event of eventTrials) {
      map.set(event.eventUid, { completed: false, expectedTrials: event.expectedTrials });
    }
    for (const completion of recruitmentCompletions) {
      const existing = map.get(completion.eventUid);
      map.set(completion.eventUid, { completed: true, expectedTrials: existing?.expectedTrials ?? null });
    }
    return map;
  }, [eventTrials, recruitmentCompletions]);

  const pyroxeneScheduleContents = useMemo(
    () => (loaderData.pyroxeneSchedulesStatus === "available" ? loaderData.pyroxeneSchedules : []),
    [loaderData.pyroxeneSchedules, loaderData.pyroxeneSchedulesStatus],
  );
  const plannerContents = useMemo<PlannerScheduleContentInput[]>(() => {
    if (loaderData.timelineEventsStatus !== "available") {
      return loaderData.pyroxeneSchedules.filter((content) => content.kind === "raid");
    }
    const timelineEventsByUid = new Map(loaderData.timelineEvents.map((event) => [event.uid, event]));
    const scheduleEventUids = new Set(
      loaderData.pyroxeneSchedules.flatMap((content) =>
        content.kind === "event" && !content.uid.startsWith("group:") && !content.tags.includes("main_story_reward")
          ? [content.uid]
          : [],
      ),
    );
    const scheduleContents = loaderData.pyroxeneSchedules.flatMap((content) => {
      if (content.kind !== "event" || content.uid.startsWith("group:") || content.tags.includes("main_story_reward")) {
        return [content];
      }
      const event = timelineEventsByUid.get(content.uid);
      if (!event) return [];
      return [
        {
          ...content,
          actualEndAt: event.endAt,
          endless: event.endless,
          runType: event.runType,
        },
      ];
    });
    const supplementalEvents = loaderData.timelineEvents
      .filter(
        (event) =>
          event.contentType === "event" &&
          !event.uid.startsWith("group:") &&
          !event.tags.includes("main_story_reward") &&
          !scheduleEventUids.has(event.uid),
      )
      .map((event) => ({
        kind: "event" as const,
        uid: event.uid,
        name: event.name,
        imageUrl: event.imageUrl,
        since: event.startAt,
        until: event.endAt ?? event.startAt,
        actualEndAt: event.endAt,
        endless: event.endless,
        runType: event.runType,
        tags: event.tags,
      }));
    return [...scheduleContents, ...supplementalEvents];
  }, [loaderData.pyroxeneSchedules, loaderData.timelineEvents, loaderData.timelineEventsStatus]);
  const scheduleItems = usePyroxeneScheduleItems(pyroxeneScheduleContents, favoritedStudents, localTimelineItems);
  const calculationOptions = useMemo(() => defaultCalculationOptions(selectedPlannerOptions), [selectedPlannerOptions]);
  const accountRecruitmentSaveResult = useMemo<PlannerRecruitmentSaveResult | null>(() => {
    const result = recruitmentFetcher.data;
    if (!result || typeof result.submissionId !== "string") return null;
    return {
      submissionId: result.submissionId,
      success: result.success,
      ...(typeof result.error === "string" ? { error: result.error } : {}),
    };
  }, [recruitmentFetcher.data]);
  const recruitmentSaveResult = isSignedIn ? accountRecruitmentSaveResult : guestRecruitmentSaveResult;
  const recruitmentIsSaving = isSignedIn ? recruitmentFetcher.state !== "idle" : guestRecruitmentIsSaving;
  const handleSaveRecruitment = useCallback(
    (input: PlannerRecruitmentSaveInput) => {
      const submissionId = input.submissionId || crypto.randomUUID();
      if (isSignedIn) {
        const formData = new FormData();
        formData.set("intent", "save-recruitment");
        formData.set("submissionId", submissionId);
        formData.set("eventUid", input.eventUid);
        for (const studentUid of input.favoriteStudentUids) formData.append("studentUid", studentUid);
        recruitmentFetcher.submit(formData, { method: "post" });
        return;
      }

      setGuestRecruitmentSaveResult(null);
      if (pyroxeneGuestPlanner.status !== "ready") {
        const error =
          pyroxeneGuestPlanner.status === "corrupt"
            ? "게스트 계획을 읽을 수 없어 모집 계획을 저장하지 못했어요."
            : pyroxeneGuestPlanner.status === "memory"
              ? "브라우저 저장을 사용할 수 없어 모집 계획을 저장하지 못했어요."
              : "게스트 계획을 불러오는 중이에요. 잠시 후 다시 시도해주세요.";
        setGuestRecruitmentSaveResult({ submissionId, success: false, error });
        return;
      }

      setGuestRecruitmentIsSaving(true);
      void updateGuestPyroxenePlanner((current) => {
        const selectedStudentUids = new Set(input.favoriteStudentUids);
        return {
          ...current,
          favoriteStudents: [
            ...current.favoriteStudents.filter((favorite) => favorite.contentUid !== input.eventUid),
            ...[...selectedStudentUids].map((studentUid) => ({ contentUid: input.eventUid, studentUid })),
          ],
        };
      })
        .then((snapshot) => {
          setGuestRecruitmentSaveResult(
            snapshot.status === "ready"
              ? { submissionId, success: true }
              : {
                  submissionId,
                  success: false,
                  error:
                    snapshot.status === "corrupt"
                      ? "게스트 계획을 읽을 수 없어 모집 계획을 저장하지 못했어요."
                      : "브라우저 저장에 실패했어요. 입력은 유지했으니 다시 시도해주세요.",
                },
          );
        })
        .catch(() => {
          setGuestRecruitmentSaveResult({
            submissionId,
            success: false,
            error: "모집 계획을 저장하지 못했어요. 입력은 유지했으니 다시 시도해주세요.",
          });
        })
        .finally(() => setGuestRecruitmentIsSaving(false));
    },
    [isSignedIn, pyroxeneGuestPlanner.status, recruitmentFetcher.submit],
  );
  const calculation = usePyroxeneTimeline({
    initialResources,
    initialDate,
    eventDataMap,
    scheduleItems,
    options: calculationOptions,
    collectedSourceKeys,
    endDate: timelineEndDate,
  });

  const pyroxeneInputAvailable = isSignedIn
    ? loaderData.accountStateStatus === "available" && accountState !== null
    : pyroxeneGuestPlanner.status === "ready" || pyroxeneGuestPlanner.status === "memory";
  const pyroxeneForecastStatus = useMemo(() => {
    if (loaderData.pyroxeneSchedulesStatus !== "available") return "unavailable" as const;
    if (!isSignedIn && pyroxeneGuestPlanner.status === "loading") return "pending" as const;
    if (!pyroxeneInputAvailable) return "unavailable" as const;
    if (calculation.error) return "unavailable" as const;
    if (!hasResourceInput) return "input-needed" as const;
    if (calculation.pending) return "pending" as const;
    return "ready" as const;
  }, [
    calculation.error,
    calculation.pending,
    hasResourceInput,
    isSignedIn,
    loaderData.pyroxeneSchedulesStatus,
    pyroxeneGuestPlanner.status,
    pyroxeneInputAvailable,
  ]);
  const timelineResources = useMemo(
    () => summarizePyroxeneTimeline(calculation.timeline, displayTimeZone),
    [calculation.timeline, displayTimeZone],
  );
  const dailyResources = pyroxeneForecastStatus === "ready" ? timelineResources : {};
  const calendarResources = useMemo(() => projectPlannerCalendarResources(dailyResources), [dailyResources]);
  const raidScheduleFacts = useMemo(() => getPlannerRaidScheduleFacts(timelineResources), [timelineResources]);

  const currentGuestShopComparison =
    guestShopComparison?.signature === guestShopPlanSignature ? guestShopComparison : null;
  const guestShopLookups = useMemo(
    () => getLookupMap(currentGuestShopComparison?.response ?? null, guestShopPlans),
    [currentGuestShopComparison?.response, guestShopPlans],
  );
  const shopComparisonDefaults = useMemo(
    () =>
      getShopDefaultsByStateUid(
        currentGuestShopComparison?.response ?? null,
        guestShopPlans,
        baseShopDefaultsByStateUid,
      ),
    [baseShopDefaultsByStateUid, currentGuestShopComparison?.response, guestShopPlans],
  );
  const guestShopComparisons = useMemo(
    () => compareGuestEventShopPlans(guestShopPlans, guestShopLookups, shopComparisonDefaults),
    [guestShopLookups, guestShopPlans, shopComparisonDefaults],
  );
  const guestShopComparisonPending =
    loaderData.signedIn && guestShopPlans.length > 0 && currentGuestShopComparison === null;
  const hasUnavailableGuestShopComparison =
    !guestShopComparisonPending && guestShopComparisons.some(({ status }) => status === "unavailable");
  const unresolvedGuestShopPlanCount = !loaderData.signedIn
    ? 0
    : guestShopComparisonPending || hasUnavailableGuestShopComparison
      ? null
      : countUnresolvedGuestEventShopPlans(guestShopPlans, guestShopLookups, shopComparisonDefaults);
  const calendarShopPlans = useMemo<PlannerCalendarShopPlan[]>(() => {
    const guestPlansByShopStateUid = new Map(guestShopPlans.map((plan) => [plan.shopStateUid, plan]));
    return loaderData.shopEvents.map((event) => {
      const defaultState = event.shopStateUid ? (baseShopDefaultsByStateUid[event.shopStateUid] ?? null) : null;
      const guestPlan = event.shopStateUid ? guestPlansByShopStateUid.get(event.shopStateUid) : undefined;
      const savedState = isSignedIn
        ? event.accountStateStatus === "available"
          ? event.accountState
          : null
        : (guestPlan?.state ?? null);
      const state = isSignedIn && event.accountStateStatus === "unavailable" ? null : (savedState ?? defaultState);
      return {
        timelineUid: event.timelineUid,
        shopStateUid: event.shopStateUid,
        name: event.name,
        startAt: event.startAt,
        endAt: event.endAt,
        startDate: event.startAt ? formatPlannerPeriodDate(event.startAt, displayTimeZone) : null,
        endDate: event.endAt ? formatPlannerPeriodEndDate(event.endAt, displayTimeZone) : null,
        state,
        defaultState,
      };
    });
  }, [baseShopDefaultsByStateUid, displayTimeZone, guestShopPlans, isSignedIn, loaderData.shopEvents]);

  const shopPeriods = useMemo(
    () =>
      calendarShopPlans.map((plan) => ({
        timelineUid: plan.timelineUid,
        name: plan.name,
        startAt: plan.startAt,
        endAt: plan.endAt,
        planned: Boolean(plan.state && plan.defaultState && !isDefaultEventShopState(plan.state, plan.defaultState)),
      })),
    [calendarShopPlans],
  );

  const periods = useMemo(
    () =>
      buildPlannerPeriods({
        contents: plannerContents,
        scheduleItems,
        favorites: favoritedStudents,
        eventTrials,
        shopPeriods,
        timeZone: displayTimeZone,
      }),
    [displayTimeZone, eventTrials, favoritedStudents, plannerContents, scheduleItems, shopPeriods],
  );

  const publicPeriods = useMemo(
    () =>
      buildPublicPlannerPeriods({
        contents: plannerContents,
        scheduleItems,
        shopPeriods: shopPeriods.map((period) => ({ ...period, planned: false })),
        timeZone: displayTimeZone,
      }),
    [displayTimeZone, plannerContents, scheduleItems, shopPeriods],
  );

  const plannedEventUids = useMemo(
    () => getPlannerPlannedEventUids({ favorites: favoritedStudents, eventTrials }),
    [eventTrials, favoritedStudents],
  );
  const displayPeriods = useMemo(
    () => buildPlannerDisplayPeriods(periods, publicPeriods, plannedEventUids),
    [periods, plannedEventUids, publicPeriods],
  );

  const scheduleAvailability = useMemo(() => {
    const shopsAvailable =
      loaderData.shopEventsStatus === "available" &&
      !loaderData.shopEvents.some((event) => event.status === "unavailable");
    const eventsAvailable = loaderData.timelineEventsStatus === "available";
    const recruitmentAvailable =
      loaderData.pyroxeneSchedulesStatus === "available" && loaderData.recruitmentGroupsStatus === "available";
    return {
      dateFacts: eventsAvailable && recruitmentAvailable && shopsAvailable,
      ongoing: eventsAvailable && recruitmentAvailable,
    };
  }, [
    loaderData.pyroxeneSchedulesStatus,
    loaderData.recruitmentGroupsStatus,
    loaderData.shopEvents,
    loaderData.shopEventsStatus,
    loaderData.timelineEventsStatus,
  ]);

  const statusMessages = useMemo(() => {
    const messages: string[] = [];
    if (loaderData.pyroxeneSchedulesStatus === "unavailable")
      messages.push("모집과 공개 일정 일부를 확인할 수 없어요.");
    if (loaderData.timelineEventsStatus === "unavailable") messages.push("이벤트 원본 일정 정보를 확인할 수 없어요.");
    if (loaderData.recruitmentGroupsStatus === "unavailable") messages.push("모집 기간을 확인할 수 없어요.");
    if (loaderData.shopEventsStatus === "unavailable") messages.push("이벤트 상점 일정을 확인할 수 없어요.");
    else if (loaderData.shopEvents.some((event) => event.status === "unavailable")) {
      messages.push("일부 이벤트 상점 정보나 교환 기간을 확인할 수 없어요.");
    }
    if (isSignedIn && loaderData.shopEvents.some((event) => event.accountStateStatus === "unavailable")) {
      messages.push("일부 계정 이벤트 상점 계획을 확인할 수 없어요.");
    }
    if (isSignedIn && loaderData.accountStateStatus === "unavailable") {
      messages.push("계정의 청휘석 계획을 확인할 수 없어요.");
    }
    if (isSignedIn && accountState?.recruitedStudentUids === null) {
      messages.push("계정 모집 정보가 없어 기본 이벤트 상점 계획을 확인할 수 없어요.");
    }
    if (isSignedIn && pyroxeneGuestPlanner.status === "loading") {
      messages.push("게스트 청휘석 계획을 확인하고 있어요.");
    }
    if (isSignedIn && pyroxeneGuestPlanner.status === "corrupt") {
      messages.push("게스트 청휘석 계획 저장을 읽지 못해 가져오기 항목을 확인할 수 없어요.");
    }
    if (isSignedIn && pyroxeneGuestPlanner.status === "memory") {
      messages.push("게스트 청휘석 계획은 브라우저 저장소에 기록되지 않은 임시 상태예요.");
    }
    if (isSignedIn && guestShopComparisonPending) messages.push("게스트 상점 계획과 계정 계획을 비교하고 있어요.");
    if (isSignedIn && hasUnavailableGuestShopComparison) {
      messages.push("일부 게스트 상점 계획과 계정 계획을 비교할 수 없어요.");
    }
    if (!isSignedIn && pyroxeneGuestPlanner.status === "corrupt") {
      messages.push("이 브라우저의 청휘석 계획을 읽지 못했어요. 저장 내용을 확인해주세요.");
    }
    if (!isSignedIn && pyroxeneGuestPlanner.status === "memory") {
      messages.push("청휘석 계획을 브라우저에 저장하지 못했어요. 현재 입력은 이 화면을 벗어나면 사라질 수 있어요.");
    }
    if (guestShopSnapshot?.status === "corrupt") {
      messages.push("이 브라우저의 이벤트 상점 계획을 읽지 못했어요. 저장 내용을 확인해주세요.");
    }
    if (guestShopSnapshot?.status === "unavailable") {
      messages.push("이 브라우저의 이벤트 상점 계획 저장소를 사용할 수 없어요.");
    }
    if (guestShopSnapshot?.status === "memory") {
      messages.push(
        "이벤트 상점 계획을 브라우저에 저장하지 못했어요. 현재 입력은 이 화면을 벗어나면 사라질 수 있어요.",
      );
    }
    if (guestShopSnapshot?.status === "conflict") {
      messages.push(
        "여러 탭에서 수정한 이벤트 상점 계획을 안전하게 저장하지 못했어요. 비교 화면에서 계획을 확인해주세요.",
      );
    }
    return messages;
  }, [
    guestShopComparisonPending,
    guestShopSnapshot?.status,
    hasUnavailableGuestShopComparison,
    isSignedIn,
    loaderData,
    accountState?.recruitedStudentUids,
    pyroxeneGuestPlanner.status,
  ]);

  const handleLoadMore = useCallback(() => setVisibleMonthCount((count) => count + 1), []);

  return (
    <Page
      title="통합 플래너"
      description="모집·청휘석·이벤트 상점 계획을 날짜별로 확인해보세요. 재화 증감은 기존 계산 기준의 예상이에요."
      contentWidth="full"
      maxWidth="wide"
      layout="vertical"
      panels={[
        ...(isSignedIn && unresolvedGuestPyroxeneUnitCount > 0
          ? [
              {
                title: `게스트 청휘석 계획 확인 · ${unresolvedGuestPyroxeneUnitCount}개`,
                description: "계정에 반영되지 않았거나 내용이 다른 청휘석 계획을 확인할 수 있어요.",
                Icon: CreditCardIcon,
                children: (
                  <Link
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                    to="/utils/pyroxene/import"
                  >
                    게스트 계획 비교·가져오기
                  </Link>
                ),
              },
            ]
          : []),
      ]}
      links={
        isSignedIn && unresolvedGuestShopPlanCount !== null && unresolvedGuestShopPlanCount > 0
          ? [
              {
                title: `로그인 전 상점 계획 차이 · ${unresolvedGuestShopPlanCount}개`,
                shortTitle: "상점 비교",
                description: "로그인 전에 입력한 계획이 계정에 없거나 내용이 달라요.",
                Icon: ShoppingBagIcon,
                to: "/utils/planner/import",
              },
            ]
          : []
      }
    >
      <PlannerCalendar
        initialMonth={initialMonth}
        todayDateKey={todayDateKey}
        periods={displayPeriods}
        scheduleAvailability={scheduleAvailability}
        calendarResources={calendarResources}
        raidScheduleFacts={raidScheduleFacts}
        forecastStatus={pyroxeneForecastStatus}
        statusMessages={statusMessages}
        isSignedIn={isSignedIn}
        timeZone={displayTimeZone}
        oneOffEntries={oneOffEntries}
        guestStorageStatus={pyroxeneGuestPlanner.status}
        recruitmentSavedStates={recruitmentSavedStates}
        recruitmentIsSaving={recruitmentIsSaving}
        recruitmentSaveResult={recruitmentSaveResult}
        onSaveRecruitment={handleSaveRecruitment}
        shopPlans={calendarShopPlans}
        monthCount={visibleMonthCount}
        onLoadMore={handleLoadMore}
      />
    </Page>
  );
}

function usePyroxeneScheduleGuestState(): {
  status: "ready" | "memory" | "corrupt" | "loading";
  data: GuestPyroxenePlannerData | null;
} {
  const { snapshot } = useGuestPyroxenePlanner();
  if (!snapshot) return { status: "loading", data: null };
  if (snapshot.status === "corrupt") return { status: "corrupt", data: null };
  return { status: snapshot.status, data: snapshot.envelope.data };
}
