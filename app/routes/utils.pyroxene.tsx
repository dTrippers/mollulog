import { useEffect, useMemo, useRef, useState } from "react";
import {
  type MetaFunction,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { CalendarIcon, ChartBarIcon, PlusIcon } from "@heroicons/react/24/outline";
import { LockClosedIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  PyroxenePlannerOptionsPanel,
  PyroxenePlannerSourcePanel,
  PyroxeneSchedule,
} from "~/components/features/futures";
import type { PickupResources, PyroxeneScheduleItem } from "~/components/features/futures";
import type { PyroxenePlannerOptions, PyroxeneTimelineItem, PyroxeneEventData } from "~/models/pyroxene-planner";
import Page from "~/components/features/layout/Page";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import {
  createPyroxeneOwnedResource,
  createBuyPyroxene,
  deletePyroxeneTimelineItem,
  getLatestPyroxeneOwnedResource,
  getPyroxeneTimelineItems,
  createPyroxenePackage,
  createAttendance,
  createOtherPyroxeneGain,
  getPyroxenePlannerOptions,
  upsertPyroxenePlannerOptions,
  getPyroxenePlannerContents,
  getAllPyroxeneEventData,
  upsertPyroxeneEventData,
  deletePyroxeneEventData,
} from "~/models/pyroxene-planner";
import { ErrorPage } from "~/components/features/layout";
import {
  createOptimisticAttendanceTimelineItems,
  createOptimisticBuyTimelineItems,
  createOptimisticOtherTimelineItems,
  createOptimisticPackageTimelineItems,
  DEFAULT_PYROXENE_TIMELINE_DISPLAY,
} from "~/models/pyroxene-sources";

const defaultOptions: PyroxenePlannerOptions = {
  event: {
    pickupChance: "average",
  },
  raid: {
    tier: "platinum",
  },
  tactical: {
    level: "in100",
  },
  consumption: {
    apChargeCount: 0,
  },
  timeline: {
    display: DEFAULT_PYROXENE_TIMELINE_DISPLAY,
  },
};

type StoredPyroxenePlannerOptions = Partial<
  Omit<PyroxenePlannerOptions, "event" | "raid" | "tactical" | "consumption" | "timeline">
> & {
  event?: Partial<PyroxenePlannerOptions["event"]>;
  raid?: Partial<PyroxenePlannerOptions["raid"]>;
  tactical?: Partial<PyroxenePlannerOptions["tactical"]>;
  consumption?: Partial<PyroxenePlannerOptions["consumption"]>;
  timeline?: Partial<PyroxenePlannerOptions["timeline"]>;
};

function normalizePyroxenePlannerOptions(options: StoredPyroxenePlannerOptions | null): PyroxenePlannerOptions {
  return {
    event: {
      ...defaultOptions.event,
      ...options?.event,
    },
    raid: {
      ...defaultOptions.raid,
      ...options?.raid,
    },
    tactical: {
      ...defaultOptions.tactical,
      ...options?.tactical,
    },
    consumption: {
      ...defaultOptions.consumption,
      ...options?.consumption,
    },
    timeline: {
      display: options?.timeline?.display ?? defaultOptions.timeline.display,
    },
  };
}

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
      calcOptions: null,
      eventData: [],
    };
  }

  // 사용자 데이터 쿼리 5개는 모두 독립적이므로 병렬 실행
  const [favoritedStudents, latestResources, savedOptions, eventData, timelineItems] = await Promise.all([
    getUserFavoritedStudents(env, currentUser.id),
    getLatestPyroxeneOwnedResource(env, currentUser.id),
    getPyroxenePlannerOptions(env, currentUser.id),
    getAllPyroxeneEventData(env, currentUser.id),
    getPyroxeneTimelineItems(env, currentUser.id),
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
      date: Date;
    };
    package?: {
      startDate: Date;
      packageType: "half" | "full";
    };
    attendance?: {
      startDate: Date;
    };
    other?: {
      resources: PickupResources;
      description: string;
      date: Date;
    };
  };

  deleteData: {
    eventUid?: string | null;
    itemUid?: string;
  };

  eventData?: {
    eventUid: string;
    completed?: boolean;
    expectedTrials?: number | null;
  };

  calcOptions?: PyroxenePlannerOptions;
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return { success: false };
  }

  const { createData, deleteData, eventData, calcOptions } = await request.json<ActionData>();
  if (request.method === "POST" && createData) {
    if (createData.ownedResources !== undefined) {
      const { eventUid, pyroxene, oneTimeTicket, tenTimeTicket } = createData.ownedResources;
      await createPyroxeneOwnedResource(env, currentUser.id, { pyroxene, oneTimeTicket, tenTimeTicket });
      // When completing a pickup, also mark the event as completed
      if (eventUid) {
        await upsertPyroxeneEventData(env, currentUser.id, eventUid, { completed: true });
      }
    }
    if (createData.buy?.quantity !== undefined) {
      await createBuyPyroxene(env, currentUser.id, createData.buy.date, createData.buy.quantity);
    }
    if (createData.package?.startDate !== undefined) {
      await createPyroxenePackage(env, currentUser.id, createData.package.startDate, createData.package.packageType);
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
  } else if (request.method === "POST" && eventData) {
    await upsertPyroxeneEventData(env, currentUser.id, eventData.eventUid, {
      completed: eventData.completed,
      expectedTrials: eventData.expectedTrials,
    });
  } else if (request.method === "POST" && calcOptions) {
    await upsertPyroxenePlannerOptions(env, currentUser.id, calcOptions);
  } else if (request.method === "DELETE" && deleteData) {
    if (deleteData.eventUid) {
      await deletePyroxeneEventData(env, currentUser.id, deleteData.eventUid);
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

  const fetcher = useFetcher<typeof action>();

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
    if (loaderData.calcOptions) {
      setOptions(normalizePyroxenePlannerOptions(loaderData.calcOptions));
    }
  }, [loaderData.calcOptions]);

  const handleSaveOwnedResources = (eventUid: string | null, resources: PickupResources) => {
    setInitialResources(resources);
    setInitialDate(new Date());
    if (eventUid) {
      setLocalEventData((prev) => {
        const exists = prev.some((d) => d.eventUid === eventUid);
        if (exists) {
          return prev.map((d) => (d.eventUid === eventUid ? { ...d, completed: true } : d));
        }
        return [...prev, { uid: "optimistic", userId: 0, eventUid, completed: true, expectedTrials: null }];
      });
    }
    fetcher.submit(
      { createData: { ownedResources: { eventUid, ...resources } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleUpdateEventData = (eventUid: string, data: { completed?: boolean; expectedTrials?: number | null }) => {
    setLocalEventData((prev) => {
      const exists = prev.some((d) => d.eventUid === eventUid);
      if (exists) {
        return prev.map((d) => (d.eventUid === eventUid ? { ...d, ...data } : d));
      }
      return [
        ...prev,
        {
          uid: "optimistic",
          userId: 0,
          eventUid,
          completed: data.completed ?? false,
          expectedTrials: data.expectedTrials ?? null,
        },
      ];
    });
    fetcher.submit({ eventData: { eventUid, ...data } }, { method: "POST", encType: "application/json" });
  };

  const handleDeletePickupComplete = (eventUid: string) => {
    setLocalEventData((prev) => prev.filter((d) => d.eventUid !== eventUid));
    fetcher.submit({ deleteData: { eventUid } }, { method: "DELETE", encType: "application/json" });
  };

  const handleDeleteItem = (itemUid: string) => {
    const baseUid = itemUid.split("::")[0];
    setLocalTimelineItems((prev) => prev.filter((item) => !item.uid.startsWith(baseUid)));
    fetcher.submit({ deleteData: { itemUid } }, { method: "DELETE", encType: "application/json" });
  };

  const handleSaveBuy = (quantity: number, date: Date) => {
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticBuyTimelineItems(quantity, date)]);
    fetcher.submit(
      { createData: { buy: { quantity, date: date.toISOString() } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSavePackage = (startDate: Date, packageType: "half" | "full") => {
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticPackageTimelineItems(startDate, packageType)]);
    fetcher.submit(
      { createData: { package: { startDate: startDate.toISOString(), packageType } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveAttendance = (startDate: Date) => {
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
    setLocalTimelineItems((prev) => [...prev, ...createOptimisticOtherTimelineItems(resources, description, date)]);
    fetcher.submit(
      { createData: { other: { resources, description, date: date.toISOString() } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const [options, setOptions] = useState<PyroxenePlannerOptions>(
    normalizePyroxenePlannerOptions(loaderData.calcOptions),
  );
  const optionsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        completed: data.completed,
        expectedTrials: data.expectedTrials,
      });
    }
    return map;
  }, [localEventData]);

  const scheduleItems = useMemo(() => {
    const items: PyroxeneScheduleItem[] = [];
    for (const content of contents) {
      if (content.kind === "event") {
        items.push({
          event: {
            uid: content.uid,
            name: content.name,
            since: content.since,
            until: content.until,
            earnablePyroxene: content.earnablePyroxene ?? null,
            recruitments: content.recruitments.map((recruitment) => ({
              ...recruitment,
              favorited: favoritedStudents.some(
                ({ contentUid, studentUid }) => contentUid === content.uid && studentUid === recruitment.student?.uid,
              ),
            })),
          },
        });
      } else if (content.kind === "raid") {
        items.push({
          raid: {
            uid: content.uid,
            name: content.name,
            type: content.type,
            since: content.since,
            until: content.until,
          },
        });
      }
    }
    for (const item of localTimelineItems) {
      if (item.source === "buy") {
        items.push({
          onetimeGain: {
            uid: item.uid,
            source: "buy",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
          },
        });
      } else if (item.source === "package_onetime") {
        items.push({
          onetimeGain: {
            uid: item.uid,
            source: "package_onetime",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
          },
        });
      } else if (item.source === "package_daily") {
        items.push({
          repeatedGain: {
            source: "package_daily",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
            repeatIntervalDays: item.repeatIntervalDays ?? 0,
            repeatCount: item.repeatCount ?? 0,
          },
        });
      } else if (item.source === "attendance") {
        items.push({
          repeatedGain: {
            source: "attendance",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
            repeatIntervalDays: item.repeatIntervalDays ?? 0,
          },
        });
      } else if (item.source === "other") {
        items.push({
          onetimeGain: {
            uid: item.uid,
            source: "other",
            description: item.description,
            date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
            oneTimeTicketDelta: item.oneTimeTicketDelta,
            tenTimeTicketDelta: item.tenTimeTicketDelta,
          },
        });
      }
    }
    return items;
  }, [contents, favoritedStudents, localTimelineItems]);

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
        title="청휘석 플래너 (β)"
        description="<재화 수급 계획> 메뉴에서 획득 일정과 수량을 입력하고, 관심 학생 모집 시점의 예상 청휘석을 계산해보세요"
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
                onSaveBuy={(quantity, date) => handleSaveBuy(quantity, date)}
                onSavePackage={(startDate, packageType) => handleSavePackage(startDate, packageType)}
                onSaveAttendance={(startDate) => handleSaveAttendance(startDate)}
                onSaveOther={(resources, description, date) => handleSaveOther(resources, description, date)}
              />
            ),
          },
          {
            title: "플래너 설정",
            Icon: ChartBarIcon,
            description: "계산 조건을 선택해주세요",
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
            onPickupComplete={(eventUid, resources) => handleSaveOwnedResources(eventUid, resources)}
            onDeletePickupComplete={(eventUid) => handleDeletePickupComplete(eventUid)}
            onDeleteItem={(itemUid) => handleDeleteItem(itemUid)}
            onUpdateEventData={handleUpdateEventData}
          />
        ) : (
          <ErrorPage Icon={LockClosedIcon} message="로그인 후 이용할 수 있어요" showButtons={false} />
        )}
      </Page>
    </>
  );
}
