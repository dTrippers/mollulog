import { CalendarIcon, ChartBarIcon, PlusIcon } from "@heroicons/react/24/outline";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ActionFunctionArgs,
  data,
  type LoaderFunctionArgs,
  type MetaFunction,
  useFetcher,
  useLoaderData,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  PyroxenePlannerOptionsPanel,
  PyroxenePlannerSourcePanel,
  PyroxeneSchedule,
  useGuestPyroxenePlanner,
  usePyroxeneScheduleItems,
} from "~/components/features/futures";
import Page from "~/components/features/layout/Page";
import { Button, Callout } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  createGuestRecord,
  type GuestPyroxeneRecord,
  guestPyroxeneRecordToTimelineItems,
  guestPyroxeneTimelineItems,
  hasGuestPyroxenePlannerData,
} from "~/domain/guest-pyroxene-planner";
import { defaultPyroxenePlannerOptions, type PyroxenePlannerOptions } from "~/domain/pyroxene-planner";
import {
  createOptimisticApPackageTimelineItems,
  createOptimisticAttendanceTimelineItems,
  createOptimisticBuyTimelineItems,
  createOptimisticMonthlyPackageTimelineItems,
  createOptimisticOtherTimelineItems,
  extractPyroxeneTimelineBaseUid,
  type PyroxeneMonthlyPackageType,
} from "~/domain/pyroxene-sources";
import type { PickupResources } from "~/domain/pyroxene-timeline";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import type { PyroxeneEventData, PyroxeneTimelineItem, PyroxeneTimelineRepeatType } from "~/models/pyroxene-planner";
import {
  createAttendance,
  createBuyPyroxene,
  createOtherPyroxeneGain,
  createPyroxeneApPackage,
  createPyroxeneMonthlyPackage,
  createPyroxeneOwnedResource,
  deleteCollectedSource,
  deletePyroxeneTimelineItem,
  getAllPyroxeneEventData,
  getCollectedSourceKeys,
  getLatestPyroxeneOwnedResource,
  getPyroxenePlannerOptions,
  getPyroxeneTimelineItems,
  upsertCollectedSources,
  upsertPyroxeneEventData,
  upsertPyroxenePlannerOptions,
} from "~/models/pyroxene-planner";
import { getRecruitedStudents } from "~/models/recruited-student";
import {
  deleteRecruitmentResult,
  getRecruitmentResultsByRecruitmentGroupUids,
  setRecruitmentResultCompletion,
} from "~/models/recruitment-result.server";
import { getPyroxenePlannerContents } from "~/views/pyroxene";
import { type ActionData, decodePyroxeneActionPayload } from "./utils.pyroxene._components/action-data";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;

  // contents와 인증은 서로 무관하므로 병렬 실행
  const [contents, currentUser] = await Promise.all([
    getPyroxenePlannerContents(env, false, ctx),
    getActiveSensei(env, request),
  ]);

  if (!currentUser) {
    return {
      contents,
      favoritedStudents: [],
      latestResources: {
        pyroxene: 0,
        oneTimeTicket: 0,
        tenTimeTicket: 0,
        inputAt: null,
      },
      timelineItems: [],
      calcOptions: defaultPyroxenePlannerOptions,
      eventData: [],
      recruitmentResultCompletions: [],
      recruitedStudentUids: [],
      collectedSourceKeys: [],
    };
  }

  // 사용자 데이터 쿼리 5개는 모두 독립적이므로 병렬 실행
  const recruitmentGroupUids = contents.flatMap((content) =>
    content.kind === "event" && content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
  );

  const [
    favoritedStudents,
    latestResources,
    savedOptions,
    eventData,
    timelineItems,
    recruitmentResults,
    recruitedStudents,
    collectedSources,
  ] = await Promise.all([
    getUserFavoritedStudents(env, currentUser.id, undefined, { ctx }),
    getLatestPyroxeneOwnedResource(env, currentUser.id),
    getPyroxenePlannerOptions(env, currentUser.id),
    getAllPyroxeneEventData(env, currentUser.id),
    getPyroxeneTimelineItems(env, currentUser.id),
    getRecruitmentResultsByRecruitmentGroupUids(env, currentUser.id, recruitmentGroupUids),
    getRecruitedStudents(env, currentUser.id),
    getCollectedSourceKeys(env, currentUser.id),
  ]);

  return {
    signedIn: true,
    contents,
    favoritedStudents: favoritedStudents.map(({ contentId, studentId }) => ({
      contentUid: contentId,
      studentUid: studentId,
    })),
    latestResources: {
      pyroxene: latestResources?.pyroxene ?? 0,
      oneTimeTicket: latestResources?.oneTimeTicket ?? 0,
      tenTimeTicket: latestResources?.tenTimeTicket ?? 0,
      inputAt: latestResources?.inputAt ?? null,
    },
    timelineItems,
    calcOptions: savedOptions,
    eventData,
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
    collectedSourceKeys: [...collectedSources],
  };
};

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

  switch (actionData.intent) {
    case "save-owned-resources": {
      const { resources, eventUid, collectedSourceKeys } = actionData.payload;
      const savedAt = new Date().toISOString();
      try {
        await createPyroxeneOwnedResource(env, currentUser.id, resources, { inputAt: savedAt });
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
        return data({ success: false, error: "보유 재화를 저장하지 못했어요" }, { status: 500 });
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
        await upsertPyroxenePlannerOptions(env, currentUser.id, actionData.payload.options);
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
        await upsertPyroxenePlannerOptions(env, currentUser.id, actionData.payload.options);
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
      });
      break;
    case "save-options":
      await upsertPyroxenePlannerOptions(env, currentUser.id, actionData.payload.options);
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

  return { success: true };
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
  error?: string;
  savedAt?: string | null;
};

type PendingOwnedResourceSave = {
  eventUid: string | null;
  resources: PickupResources;
  collectedSourceKeys: string[];
};

function toPickupResources(resources: PickupResources): PickupResources {
  return {
    pyroxene: resources.pyroxene,
    oneTimeTicket: resources.oneTimeTicket,
    tenTimeTicket: resources.tenTimeTicket,
  };
}

function zeroPickupResources(): PickupResources {
  return { pyroxene: 0, oneTimeTicket: 0, tenTimeTicket: 0 };
}

export default function PyroxenePlanner() {
  const loaderData = useLoaderData<typeof loader>();
  const { signedIn, contents } = loaderData;
  const { showSignIn } = useSignIn();
  const guestPlanner = useGuestPyroxenePlanner();
  const loaderResources = toPickupResources(loaderData.latestResources);

  const [initialDate, setInitialDate] = useState<Date | null>(
    loaderData.latestResources.inputAt ? new Date(loaderData.latestResources.inputAt) : null,
  );
  const [initialResources, setInitialResources] = useState<PickupResources>(loaderResources);

  // Local optimistic state for timeline items and event data
  const [localTimelineItems, setLocalTimelineItems] = useState<PyroxeneTimelineItem[]>(loaderData.timelineItems ?? []);
  const [localEventData, setLocalEventData] = useState<PyroxeneEventData[]>(loaderData.eventData ?? []);
  const [localRecruitmentResultCompletions, setLocalRecruitmentResultCompletions] = useState<
    { eventUid: string; recruitmentGroupUid: string }[]
  >(loaderData.recruitmentResultCompletions ?? []);
  const [localCollectedSourceKeys, setLocalCollectedSourceKeys] = useState<string[]>(
    loaderData.collectedSourceKeys ?? [],
  );
  const [localFavoritedStudents, setLocalFavoritedStudents] = useState(loaderData.favoritedStudents ?? []);
  const fetcher = useFetcher<Awaited<ReturnType<typeof action>>>();
  const ownedResourcesFetcher = useFetcher<OwnedResourcesActionResult>();
  const favoriteFetcher = useFetcher();
  const timelineSaveInFlight = useRef(false);
  const pendingOwnedResourceSave = useRef<PendingOwnedResourceSave | null>(null);
  const [ownedResourceSaveError, setOwnedResourceSaveError] = useState<string | null>(null);

  const confirmOwnedResourceSave = useCallback(
    (pendingSave: PendingOwnedResourceSave, savedAt?: string | null) => {
      setInitialResources(pendingSave.resources);
      setInitialDate(savedAt ? new Date(savedAt) : new Date());
      if (pendingSave.collectedSourceKeys.length > 0) {
        setLocalCollectedSourceKeys((prev) => [...new Set([...prev, ...pendingSave.collectedSourceKeys])]);
      }
      if (pendingSave.eventUid && signedIn) {
        const content = contents.find((content) => content.kind === "event" && content.uid === pendingSave.eventUid);
        if (content?.kind === "event" && content.recruitmentGroupUid) {
          const recruitmentGroupUid = content.recruitmentGroupUid;
          setLocalRecruitmentResultCompletions((prev) => {
            if (prev.some((completion) => completion.eventUid === pendingSave.eventUid)) {
              return prev;
            }
            return [...prev, { eventUid: pendingSave.eventUid as string, recruitmentGroupUid }];
          });
        }
      }
    },
    [contents, signedIn],
  );

  // Sync from loader data after server revalidation
  useEffect(() => {
    setInitialDate(loaderData.latestResources.inputAt ? new Date(loaderData.latestResources.inputAt) : null);
    setInitialResources(toPickupResources(loaderData.latestResources));
  }, [loaderData.latestResources]);

  useEffect(() => {
    setLocalTimelineItems(loaderData.timelineItems ?? []);
  }, [loaderData.timelineItems]);

  useEffect(() => {
    setLocalEventData(loaderData.eventData ?? []);
  }, [loaderData.eventData]);

  useEffect(() => {
    setLocalRecruitmentResultCompletions(loaderData.recruitmentResultCompletions ?? []);
  }, [loaderData.recruitmentResultCompletions]);

  useEffect(() => {
    setLocalCollectedSourceKeys(loaderData.collectedSourceKeys ?? []);
  }, [loaderData.collectedSourceKeys]);

  useEffect(() => {
    setLocalFavoritedStudents(loaderData.favoritedStudents ?? []);
  }, [loaderData.favoritedStudents]);

  useEffect(() => {
    if (signedIn || !guestPlanner.snapshot || guestPlanner.snapshot.status === "corrupt") return;
    const data = guestPlanner.snapshot.envelope.data;
    setInitialDate(data.resources ? new Date(data.resources.inputAt) : null);
    setInitialResources(data.resources ? toPickupResources(data.resources) : zeroPickupResources());
    setLocalTimelineItems(guestPyroxeneTimelineItems(data));
    setLocalEventData(
      Object.entries(data.eventTrials).map(([eventUid, expectedTrials]) => ({
        uid: `guest-${eventUid}`,
        userId: 0,
        eventUid,
        completed: false,
        expectedTrials,
      })),
    );
    setLocalCollectedSourceKeys(data.collectedSourceKeys);
    setLocalFavoritedStudents(data.favoriteStudents);
    setOptions(data.options);
  }, [guestPlanner.snapshot, signedIn]);

  useEffect(() => {
    if (signedIn) setOptions(loaderData.calcOptions);
  }, [loaderData.calcOptions, signedIn]);

  useEffect(() => {
    if (fetcher.state === "idle") {
      timelineSaveInFlight.current = false;
    }
  }, [fetcher.state]);

  useEffect(() => {
    if (ownedResourcesFetcher.state !== "idle") return;

    const pendingSave = pendingOwnedResourceSave.current;
    if (!pendingSave) return;

    pendingOwnedResourceSave.current = null;
    if (!ownedResourcesFetcher.data?.success) {
      setOwnedResourceSaveError("보유 재화를 저장하지 못했어요");
      return;
    }

    setOwnedResourceSaveError(null);
    confirmOwnedResourceSave(pendingSave, ownedResourcesFetcher.data.savedAt);
  }, [confirmOwnedResourceSave, ownedResourcesFetcher.data, ownedResourcesFetcher.state]);

  const handleSaveOwnedResources = (
    eventUid: string | null,
    resources: PickupResources,
    collectedSourceKeys: string[] = [],
  ) => {
    const ownedResources = toPickupResources(resources);
    const inputAt = new Date();
    if (!signedIn) {
      confirmOwnedResourceSave({ eventUid, resources: ownedResources, collectedSourceKeys }, inputAt.toISOString());
      void guestPlanner.update((data) => ({
        ...data,
        resources: { ...ownedResources, inputAt: inputAt.toISOString() },
        collectedSourceKeys: [...new Set([...data.collectedSourceKeys, ...collectedSourceKeys])],
      }));
      return;
    }

    setOwnedResourceSaveError(null);
    pendingOwnedResourceSave.current = { eventUid, resources: ownedResources, collectedSourceKeys };
    ownedResourcesFetcher.submit(
      {
        intent: "save-owned-resources",
        payload: { resources: ownedResources, eventUid, collectedSourceKeys },
      },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleCollectedSourceChange = (sourceKey: string, collected: boolean) => {
    setLocalCollectedSourceKeys((prev) => {
      if (collected) {
        return prev.includes(sourceKey) ? prev : [...prev, sourceKey];
      }
      return prev.filter((key) => key !== sourceKey);
    });
    if (!signedIn) {
      void guestPlanner.update((data) => ({
        ...data,
        collectedSourceKeys: collected
          ? [...new Set([...data.collectedSourceKeys, sourceKey])]
          : data.collectedSourceKeys.filter((key) => key !== sourceKey),
      }));
      return;
    }
    fetcher.submit(
      { intent: collected ? "collect-source" : "uncollect-source", payload: { sourceKey } },
      { method: collected ? "POST" : "DELETE", encType: "application/json" },
    );
  };

  const handleUpdateEventData = (eventUid: string, data: { expectedTrials?: number | null }) => {
    setLocalEventData((prev) => {
      const exists = prev.some((d) => d.eventUid === eventUid);
      if (exists) {
        return prev.map((d) => (d.eventUid === eventUid ? { ...d, expectedTrials: data.expectedTrials ?? null } : d));
      }
      return [
        ...prev,
        {
          uid: "optimistic",
          userId: 0,
          eventUid,
          completed: false,
          expectedTrials: data.expectedTrials ?? null,
        },
      ];
    });
    if (!signedIn) {
      void guestPlanner.update((current) => {
        const eventTrials = { ...current.eventTrials };
        if (data.expectedTrials === null || data.expectedTrials === undefined) delete eventTrials[eventUid];
        else eventTrials[eventUid] = data.expectedTrials;
        return { ...current, eventTrials };
      });
      return;
    }
    fetcher.submit(
      { intent: "update-event-data", payload: { eventUid, ...data } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleDeletePickupComplete = (eventUid: string) => {
    if (!signedIn) return;
    const recruitmentResultCompletion = localRecruitmentResultCompletions.find(
      (completion) => completion.eventUid === eventUid,
    );
    setLocalRecruitmentResultCompletions((prev) => prev.filter((completion) => completion.eventUid !== eventUid));
    fetcher.submit(
      {
        intent: "delete-pickup-completion",
        payload: { eventUid, recruitmentGroupUid: recruitmentResultCompletion?.recruitmentGroupUid ?? null },
      },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const handleDeleteItem = (itemUid: string) => {
    const baseUid = extractPyroxeneTimelineBaseUid(itemUid);
    setLocalTimelineItems((prev) => prev.filter((item) => !item.uid.startsWith(baseUid)));
    if (!signedIn) {
      void guestPlanner.update((data) => ({
        ...data,
        records: data.records.filter((record) => record.recordId !== baseUid),
      }));
      return;
    }
    fetcher.submit(
      { intent: "delete-timeline-item", payload: { itemUid } },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const handleFavoriteChange = (contentUid: string, studentUid: string, favorited: boolean) => {
    setLocalFavoritedStudents((current) => {
      const withoutTarget = current.filter(
        (favorite) => !(favorite.contentUid === contentUid && favorite.studentUid === studentUid),
      );
      return favorited ? [...withoutTarget, { contentUid, studentUid }] : withoutTarget;
    });
    if (!signedIn) {
      void guestPlanner.update((data) => {
        const withoutTarget = data.favoriteStudents.filter(
          (favorite) => !(favorite.contentUid === contentUid && favorite.studentUid === studentUid),
        );
        return {
          ...data,
          favoriteStudents: favorited ? [...withoutTarget, { contentUid, studentUid }] : withoutTarget,
        };
      });
      return;
    }
    favoriteFetcher.submit(
      { favorite: { contentUid, studentUid, favorited } },
      { action: "/api/contents", method: "POST", encType: "application/json" },
    );
  };

  const saveGuestRecord = (record: GuestPyroxeneRecord, replaceAttendance = false) => {
    setLocalTimelineItems((prev) => {
      const current = replaceAttendance ? prev.filter((item) => item.source !== "attendance") : prev;
      return [...current, ...guestPyroxeneRecordToTimelineItems(record)];
    });
    void guestPlanner.update((data) => ({
      ...data,
      records: [
        ...(replaceAttendance ? data.records.filter((item) => item.kind !== "attendance") : data.records),
        record,
      ],
    }));
  };

  const handleSaveBuy = (
    quantity: number,
    date: Date,
    options?: { repeatType?: PyroxeneTimelineRepeatType; monthlyCount?: number },
  ) => {
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) {
      return;
    }
    timelineSaveInFlight.current = true;
    if (!signedIn) {
      saveGuestRecord(
        createGuestRecord({ kind: "buy", quantity, date: date.toISOString(), ...options }) as GuestPyroxeneRecord,
      );
      timelineSaveInFlight.current = false;
      return;
    }
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticBuyTimelineItems(quantity, date, options)]);
    fetcher.submit(
      { intent: "save-buy", payload: { quantity, date: date.toISOString(), ...options } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveMonthlyPackage = (
    startDate: Date,
    packageType: PyroxeneMonthlyPackageType,
    autoRepurchase: boolean,
  ) => {
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) {
      return;
    }
    timelineSaveInFlight.current = true;
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
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) {
      return;
    }
    timelineSaveInFlight.current = true;
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
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) {
      return;
    }
    timelineSaveInFlight.current = true;
    if (!signedIn) {
      saveGuestRecord(
        createGuestRecord({ kind: "attendance", startDate: startDate.toISOString() }) as GuestPyroxeneRecord,
        true,
      );
      timelineSaveInFlight.current = false;
      return;
    }
    setLocalTimelineItems((prev) => {
      const withoutAttendance = prev.filter((item) => item.source !== "attendance");
      return [...withoutAttendance, ...createOptimisticAttendanceTimelineItems(startDate)];
    });
    fetcher.submit(
      { intent: "save-attendance", payload: { startDate: startDate.toISOString() } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveOther = (resources: PickupResources, description: string, date: Date) => {
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) {
      return;
    }
    timelineSaveInFlight.current = true;
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

  const [options, setOptions] = useState<PyroxenePlannerOptions>(loaderData.calcOptions);
  const optionsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ensureTimelineSourcesVisible = (sourceTypes: PyroxenePlannerOptions["timeline"]["display"]) => {
    const display = new Set(options.timeline.display);
    let changed = false;
    for (const sourceType of sourceTypes) {
      if (!display.has(sourceType)) {
        display.add(sourceType);
        changed = true;
      }
    }
    if (!changed) {
      return options;
    }
    if (optionsSaveTimer.current) {
      clearTimeout(optionsSaveTimer.current);
    }

    const nextOptions = {
      ...options,
      timeline: {
        ...options.timeline,
        display: Array.from(display),
      },
    };
    setOptions(nextOptions);
    if (!signedIn) {
      void guestPlanner.update((data) => ({ ...data, options: nextOptions, optionsChanged: true }));
    }
    return nextOptions;
  };

  const handleOptionsChange = (newOptions: PyroxenePlannerOptions) => {
    setOptions(newOptions);
    if (optionsSaveTimer.current) {
      clearTimeout(optionsSaveTimer.current);
    }
    optionsSaveTimer.current = setTimeout(() => {
      if (!signedIn) {
        void guestPlanner.update((data) => ({ ...data, options: newOptions, optionsChanged: true }));
        return;
      }
      fetcher.submit(
        { intent: "save-options", payload: { options: newOptions } },
        { method: "POST", encType: "application/json" },
      );
    }, 500);
  };

  const eventDataMap = useMemo(() => {
    const map = new Map<string, { completed: boolean; expectedTrials: number | null }>();
    for (const data of localEventData) {
      map.set(data.eventUid, {
        completed: false,
        expectedTrials: data.expectedTrials,
      });
    }
    for (const completion of localRecruitmentResultCompletions) {
      const existing = map.get(completion.eventUid);
      map.set(completion.eventUid, {
        completed: true,
        expectedTrials: existing?.expectedTrials ?? null,
      });
    }
    return map;
  }, [localEventData, localRecruitmentResultCompletions]);

  const scheduleItems = usePyroxeneScheduleItems(contents, localFavoritedStudents, localTimelineItems);

  const isTimelineSaving = Boolean(signedIn) && (fetcher.state === "submitting" || fetcher.state === "loading");
  const isSaving =
    Boolean(signedIn) &&
    (fetcher.state === "submitting" ||
      fetcher.state === "loading" ||
      ownedResourcesFetcher.state === "submitting" ||
      ownedResourcesFetcher.state === "loading");
  const guestDataStatus = guestPlanner.snapshot?.status;
  const hasGuestData = guestPlanner.snapshot ? hasGuestPyroxenePlannerData(guestPlanner.snapshot.envelope.data) : false;

  return (
    <>
      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed bottom-[var(--mobile-bottom-offset)] right-4 z-layer-toast flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900 md:right-8 lg:bottom-4">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">저장중...</span>
        </div>
      )}

      <Page
        title="청휘석 플래너"
        description="청휘석 획득/소비 조건을 입력하고 관심 학생 모집 시점의 예상 청휘석을 계산해보세요"
        links={[
          {
            Icon: CalendarIcon,
            title: "미래시",
            description: "관심 학생을 등록해주세요",
            to: "/futures",
          },
        ]}
        panels={[
          {
            title: "수급/소비 계획",
            Icon: PlusIcon,
            description: "청휘석 수급/소비처를 등록해주세요",
            children: (
              <PyroxenePlannerSourcePanel
                options={options}
                onOptionsChange={handleOptionsChange}
                onSaveBuy={(quantity, date, options) => handleSaveBuy(quantity, date, options)}
                onSaveMonthlyPackage={(startDate, packageType, autoRepurchase) =>
                  handleSaveMonthlyPackage(startDate, packageType, autoRepurchase)
                }
                onSaveApPackage={(startDate, autoRepurchase) => handleSaveApPackage(startDate, autoRepurchase)}
                onSaveAttendance={(startDate) => handleSaveAttendance(startDate)}
                onSaveOther={(resources, description, date) => handleSaveOther(resources, description, date)}
                savingTimelineItem={isTimelineSaving}
              />
            ),
          },
          {
            title: "플래너 설정",
            Icon: ChartBarIcon,
            description: "시뮬레이션 조건을 선택해주세요",
            collapsible: true,
            children: <PyroxenePlannerOptionsPanel options={options} onOptionsChange={handleOptionsChange} />,
          },
        ]}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            {ownedResourceSaveError ? <Callout tone="destructive" title={ownedResourceSaveError} /> : null}
            {signedIn && hasGuestData ? (
              <Callout
                tone="info"
                title="비로그인 상태에서 입력한 데이터가 있어요"
                description="계정에 저장된 내용과 비교 후 최근 데이터를 선택해주세요."
              >
                <div className="mt-2">
                  <Button text="내용 확인" to="/utils/pyroxene/import" size="sm" variant="primary" />
                </div>
              </Callout>
            ) : !signedIn && guestDataStatus === "memory" ? (
              <Callout
                tone="warning"
                title="이 브라우저에 저장하지 못했어요"
                description="현재 탭에서는 계속 사용할 수 있지만, 탭을 닫으면 입력한 내용이 사라져요."
              />
            ) : !signedIn && guestDataStatus === "corrupt" ? (
              <Callout tone="destructive" title="저장된 데이터를 불러오지 못했어요">
                <div className="mt-2">
                  <Button text="저장된 데이터 초기화" size="sm" variant="danger-subtle" onClick={guestPlanner.reset} />
                </div>
              </Callout>
            ) : !signedIn ? (
              <Callout
                tone="info"
                title="로그인 후 더 많은 정보를 관리할 수 있어요"
                description="정보를 안전하게 저장하고 필요할 때마다 불러와 사용해보세요."
              >
                <div className="mt-2">
                  <Button text="로그인하기" size="sm" variant="primary" onClick={showSignIn} />
                </div>
              </Callout>
            ) : null}
          </div>
          <PyroxeneSchedule
            initialDate={initialDate}
            initialResources={initialResources}
            eventDataMap={eventDataMap}
            scheduleItems={scheduleItems}
            options={options}
            collectedSourceKeys={localCollectedSourceKeys}
            recruitedStudentUids={loaderData.recruitedStudentUids}
            onPickupComplete={(eventUid, resources, collectedSourceKeys) =>
              handleSaveOwnedResources(eventUid, resources, collectedSourceKeys)
            }
            onDeletePickupComplete={(eventUid) => handleDeletePickupComplete(eventUid)}
            onDeleteItem={(itemUid) => handleDeleteItem(itemUid)}
            onUpdateEventData={handleUpdateEventData}
            onCollectedSourceChange={handleCollectedSourceChange}
            allowPickupCompletion={Boolean(signedIn)}
            onFavoriteChange={handleFavoriteChange}
          />
        </div>
      </Page>
    </>
  );
}
