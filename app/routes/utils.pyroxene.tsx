import { CalendarIcon, ChartBarIcon, PlusIcon } from "@heroicons/react/24/outline";
import { ArrowPathIcon, LockClosedIcon } from "@heroicons/react/24/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type ActionFunctionArgs,
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
  usePyroxeneScheduleItems,
} from "~/components/features/futures";
import type { PickupResources } from "~/components/features/futures";
import { ErrorPage } from "~/components/features/layout";
import Page from "~/components/features/layout/Page";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import type {
  PyroxeneEventData,
  PyroxenePlannerOptions,
  PyroxeneTimelineItem,
  PyroxeneTimelineRepeatType,
} from "~/models/pyroxene-planner";
import {
  createAttendance,
  createBuyPyroxene,
  createOtherPyroxeneGain,
  createPyroxeneApPackage,
  createPyroxeneMonthlyPackage,
  createPyroxeneOwnedResource,
  defaultPyroxenePlannerOptions,
  deleteCollectedSource,
  deletePyroxeneTimelineItem,
  getAllPyroxeneEventData,
  getCollectedSourceKeys,
  getLatestPyroxeneOwnedResource,
  getPyroxenePlannerContents,
  getPyroxenePlannerOptions,
  getPyroxeneTimelineItems,
  upsertCollectedSources,
  upsertPyroxeneEventData,
  upsertPyroxenePlannerOptions,
} from "~/models/pyroxene-planner";
import {
  type PyroxeneMonthlyPackageType,
  extractPyroxeneTimelineBaseUid,
  createOptimisticApPackageTimelineItems,
  createOptimisticAttendanceTimelineItems,
  createOptimisticBuyTimelineItems,
  createOptimisticMonthlyPackageTimelineItems,
  createOptimisticOtherTimelineItems,
} from "~/domain/pyroxene-sources";
import {
  deleteRecruitmentResult,
  getRecruitmentResultsByRecruitmentGroupUids,
  setRecruitmentResultCompletion,
} from "~/models/recruitment-result";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;

  // contents와 인증은 서로 무관하므로 병렬 실행
  const [contents, currentUser] = await Promise.all([getPyroxenePlannerContents(env), getActiveSensei(env, request)]);

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
      collectedSourceKeys: [],
    };
  }

  // 사용자 데이터 쿼리 5개는 모두 독립적이므로 병렬 실행
  const recruitmentGroupUids = contents.flatMap((content) =>
    content.kind === "event" && content.recruitmentGroupUid ? [content.recruitmentGroupUid] : [],
  );

  const [favoritedStudents, latestResources, savedOptions, eventData, timelineItems, recruitmentResults, collectedSources] =
    await Promise.all([
      getUserFavoritedStudents(env, currentUser.id),
      getLatestPyroxeneOwnedResource(env, currentUser.id),
      getPyroxenePlannerOptions(env, currentUser.id),
      getAllPyroxeneEventData(env, currentUser.id),
      getPyroxeneTimelineItems(env, currentUser.id),
      getRecruitmentResultsByRecruitmentGroupUids(env, currentUser.id, recruitmentGroupUids),
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
    collectedSourceKeys: [...collectedSources],
  };
};

export type ActionData = {
  createData: {
    ownedResources?: {
      eventUid?: string | null;
      pyroxene: number;
      oneTimeTicket: number;
      tenTimeTicket: number;
    };
    buy?: {
      quantity: number;
      date: string;
      repeatType?: PyroxeneTimelineRepeatType;
      monthlyCount?: number;
    };
    monthlyPackage?: {
      startDate: string;
      packageType: PyroxeneMonthlyPackageType;
      autoRepurchase?: boolean;
    };
    apPackage?: {
      startDate: string;
      autoRepurchase?: boolean;
    };
    attendance?: {
      startDate: string;
    };
    other?: {
      resources: PickupResources;
      description: string;
      date: string;
    };
  };

  deleteData: {
    eventUid?: string | null;
    recruitmentGroupUid?: string | null;
    itemUid?: string;
  };

  eventData?: {
    eventUid: string;
    expectedTrials?: number | null;
  };

  calcOptions?: PyroxenePlannerOptions;

  collectedSource?: {
    sourceKey?: string;
    sourceKeys?: string[];
  };
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return { success: false };
  }

  const { createData, deleteData, eventData, calcOptions, collectedSource } = await request.json<ActionData>();
  if (request.method === "POST") {
    if (createData) {
      if (createData.ownedResources !== undefined) {
        const { eventUid, pyroxene, oneTimeTicket, tenTimeTicket } = createData.ownedResources;
        await createPyroxeneOwnedResource(env, currentUser.id, { pyroxene, oneTimeTicket, tenTimeTicket });
        if (eventUid) {
          const content = (await getPyroxenePlannerContents(env)).find(
            (content) => content.kind === "event" && content.uid === eventUid,
          );
          if (!content || content.kind !== "event" || !content.recruitmentGroupUid) {
            throw new Error(`Cannot resolve recruitment group for pyroxene completion: eventUid=${eventUid}`);
          }

          const recruitedStudents = content.recruitments.flatMap((recruitment) => {
            if (!recruitment.pickup || !recruitment.student) {
              return [];
            }

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
      }
      if (createData.buy?.quantity !== undefined) {
        await createBuyPyroxene(env, currentUser.id, createData.buy.date, createData.buy.quantity, {
          repeatType: createData.buy.repeatType,
          monthlyCount: createData.buy.monthlyCount,
        });
      }
      if (createData.monthlyPackage?.startDate !== undefined) {
        await createPyroxeneMonthlyPackage(
          env,
          currentUser.id,
          createData.monthlyPackage.startDate,
          createData.monthlyPackage.packageType,
          createData.monthlyPackage.autoRepurchase ?? false,
        );
      }
      if (createData.apPackage?.startDate !== undefined) {
        await createPyroxeneApPackage(
          env,
          currentUser.id,
          createData.apPackage.startDate,
          createData.apPackage.autoRepurchase ?? false,
        );
      }
      if (createData.attendance?.startDate !== undefined) {
        await createAttendance(env, currentUser.id, createData.attendance.startDate);
      }
      if (createData.other?.resources !== undefined) {
        const { pyroxene, oneTimeTicket, tenTimeTicket } = createData.other.resources;
        await createOtherPyroxeneGain(
          env,
          currentUser.id,
          createData.other.date,
          pyroxene,
          oneTimeTicket,
          tenTimeTicket,
          createData.other.description,
        );
      }
    }

    if (eventData) {
      await upsertPyroxeneEventData(env, currentUser.id, eventData.eventUid, {
        expectedTrials: eventData.expectedTrials,
      });
    }
    if (calcOptions) {
      await upsertPyroxenePlannerOptions(env, currentUser.id, calcOptions);
    }
    if (collectedSource) {
      const sourceKeys = [
        ...(collectedSource.sourceKey ? [collectedSource.sourceKey] : []),
        ...(collectedSource.sourceKeys ?? []),
      ];
      await upsertCollectedSources(env, currentUser.id, sourceKeys);
    }
  } else if (request.method === "DELETE") {
    if (collectedSource?.sourceKey) {
      await deleteCollectedSource(env, currentUser.id, collectedSource.sourceKey);
    }
    if (!deleteData) {
      return { success: true };
    }
    let recruitmentGroupUid = deleteData.recruitmentGroupUid ?? null;
    if (!recruitmentGroupUid && deleteData.eventUid) {
      for (const content of await getPyroxenePlannerContents(env)) {
        if (content.kind === "event" && content.uid === deleteData.eventUid) {
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
    if (deleteData.itemUid) {
      await deletePyroxeneTimelineItem(env, currentUser.id, deleteData.itemUid);
    }
  }
  return { success: true };
};

export const meta: MetaFunction = () => {
  const title = "청휘석 플래너";
  const description = "현재 보유 재화, 각종 수급 계획을 바탕으로 관심 학생 모집 시점의 재화 수량을 예상해보세요";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export default function PyroxenePlanner() {
  const loaderData = useLoaderData<typeof loader>();
  const { signedIn, contents, favoritedStudents } = loaderData;

  const [initialDate, setInitialDate] = useState<Date | null>(
    loaderData.latestResources.inputAt ? new Date(loaderData.latestResources.inputAt) : null,
  );
  const [initialResources, setInitialResources] = useState<PickupResources>(loaderData.latestResources);

  // Local optimistic state for timeline items and event data
  const [localTimelineItems, setLocalTimelineItems] = useState<PyroxeneTimelineItem[]>(loaderData.timelineItems ?? []);
  const [localEventData, setLocalEventData] = useState<PyroxeneEventData[]>(loaderData.eventData ?? []);
  const [localRecruitmentResultCompletions, setLocalRecruitmentResultCompletions] = useState<
    { eventUid: string; recruitmentGroupUid: string }[]
  >(loaderData.recruitmentResultCompletions ?? []);
  const [localCollectedSourceKeys, setLocalCollectedSourceKeys] = useState<string[]>(
    loaderData.collectedSourceKeys ?? [],
  );

  const fetcher = useFetcher<typeof action>();
  const timelineSaveInFlight = useRef(false);

  // Sync from loader data after server revalidation
  useEffect(() => {
    setInitialDate(loaderData.latestResources.inputAt ? new Date(loaderData.latestResources.inputAt) : null);
    setInitialResources(loaderData.latestResources);
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
    setOptions(loaderData.calcOptions);
  }, [loaderData.calcOptions]);

  useEffect(() => {
    if (fetcher.state === "idle") {
      timelineSaveInFlight.current = false;
    }
  }, [fetcher.state]);

  const handleSaveOwnedResources = (
    eventUid: string | null,
    resources: PickupResources,
    collectedSourceKeys: string[] = [],
  ) => {
    setInitialResources(resources);
    setInitialDate(new Date());
    if (collectedSourceKeys.length > 0) {
      setLocalCollectedSourceKeys((prev) => [...new Set([...prev, ...collectedSourceKeys])]);
    }
    if (eventUid) {
      const content = contents.find((content) => content.kind === "event" && content.uid === eventUid);
      if (content?.kind === "event" && content.recruitmentGroupUid) {
        const recruitmentGroupUid = content.recruitmentGroupUid;
        setLocalRecruitmentResultCompletions((prev) => {
          if (prev.some((completion) => completion.eventUid === eventUid)) {
            return prev;
          }
          return [...prev, { eventUid, recruitmentGroupUid }];
        });
      }
    }
    fetcher.submit(
      {
        createData: { ownedResources: { eventUid, ...resources } },
        collectedSource: { sourceKeys: collectedSourceKeys },
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
    fetcher.submit(
      { collectedSource: { sourceKey } },
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
    fetcher.submit({ eventData: { eventUid, ...data } }, { method: "POST", encType: "application/json" });
  };

  const handleDeletePickupComplete = (eventUid: string) => {
    const recruitmentResultCompletion = localRecruitmentResultCompletions.find(
      (completion) => completion.eventUid === eventUid,
    );
    setLocalRecruitmentResultCompletions((prev) => prev.filter((completion) => completion.eventUid !== eventUid));
    fetcher.submit(
      { deleteData: { eventUid, recruitmentGroupUid: recruitmentResultCompletion?.recruitmentGroupUid ?? null } },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const handleDeleteItem = (itemUid: string) => {
    const baseUid = extractPyroxeneTimelineBaseUid(itemUid);
    setLocalTimelineItems((prev) => prev.filter((item) => !item.uid.startsWith(baseUid)));
    fetcher.submit({ deleteData: { itemUid } }, { method: "DELETE", encType: "application/json" });
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
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticBuyTimelineItems(quantity, date, options)]);
    fetcher.submit(
      { createData: { buy: { quantity, date: date.toISOString(), ...options } } },
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
    setLocalTimelineItems((prev) => [
      ...prev,
      ...createOptimisticMonthlyPackageTimelineItems(startDate, packageType, autoRepurchase),
    ]);
    const nextOptions = ensureTimelineSourcesVisible(["package_onetime"]);
    fetcher.submit(
      {
        createData: { monthlyPackage: { startDate: startDate.toISOString(), packageType, autoRepurchase } },
        calcOptions: nextOptions,
      },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveApPackage = (startDate: Date, autoRepurchase: boolean) => {
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) {
      return;
    }
    timelineSaveInFlight.current = true;
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticApPackageTimelineItems(startDate, autoRepurchase)]);
    const nextOptions = ensureTimelineSourcesVisible(["package_ap"]);
    fetcher.submit(
      { createData: { apPackage: { startDate: startDate.toISOString(), autoRepurchase } }, calcOptions: nextOptions },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveAttendance = (startDate: Date) => {
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) {
      return;
    }
    timelineSaveInFlight.current = true;
    setLocalTimelineItems((prev) => {
      const withoutAttendance = prev.filter((item) => item.source !== "attendance");
      return [...withoutAttendance, ...createOptimisticAttendanceTimelineItems(startDate)];
    });
    fetcher.submit(
      { createData: { attendance: { startDate: startDate.toISOString() } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveOther = (resources: PickupResources, description: string, date: Date) => {
    if (fetcher.state !== "idle" || timelineSaveInFlight.current) {
      return;
    }
    timelineSaveInFlight.current = true;
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticOtherTimelineItems(resources, description, date)]);
    fetcher.submit(
      { createData: { other: { resources, description, date: date.toISOString() } } },
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
    return nextOptions;
  };

  const handleOptionsChange = (newOptions: PyroxenePlannerOptions) => {
    setOptions(newOptions);
    if (optionsSaveTimer.current) {
      clearTimeout(optionsSaveTimer.current);
    }
    optionsSaveTimer.current = setTimeout(() => {
      fetcher.submit({ calcOptions: newOptions }, { method: "POST", encType: "application/json" });
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

  const scheduleItems = usePyroxeneScheduleItems(contents, favoritedStudents, localTimelineItems);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";

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
            disabled: !signedIn,
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
                savingTimelineItem={isSaving}
              />
            ),
          },
          {
            title: "플래너 설정",
            Icon: ChartBarIcon,
            description: "시뮬레이션 조건을 선택해주세요",
            disabled: !signedIn,
            foldable: signedIn,
            children: <PyroxenePlannerOptionsPanel options={options} onOptionsChange={handleOptionsChange} />,
          },
        ]}
      >
        {signedIn ? (
          <PyroxeneSchedule
            initialDate={initialDate}
            initialResources={initialResources}
            eventDataMap={eventDataMap}
            scheduleItems={scheduleItems}
            options={options}
            collectedSourceKeys={localCollectedSourceKeys}
            onPickupComplete={(eventUid, resources, collectedSourceKeys) =>
              handleSaveOwnedResources(eventUid, resources, collectedSourceKeys)
            }
            onDeletePickupComplete={(eventUid) => handleDeletePickupComplete(eventUid)}
            onDeleteItem={(itemUid) => handleDeleteItem(itemUid)}
            onUpdateEventData={handleUpdateEventData}
            onCollectedSourceChange={handleCollectedSourceChange}
          />
        ) : (
          <ErrorPage Icon={LockClosedIcon} message="로그인 후 이용할 수 있어요" showButtons={false} />
        )}
      </Page>
    </>
  );
}
