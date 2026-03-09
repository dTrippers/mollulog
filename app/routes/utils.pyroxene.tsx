import { useEffect, useMemo, useState } from "react";
import { type MetaFunction, useFetcher, useLoaderData, useRevalidator, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { CalendarIcon, ChartBarIcon, PlusIcon } from "@heroicons/react/24/outline";
import { LockClosedIcon, ArrowPathIcon } from "@heroicons/react/24/solid";
import { getAuthenticator } from "~/auth/authenticator.server";
import { PyroxenePlannerInputPanel, PyroxenePlannerOptionsPanel, PyroxeneSchedule } from "~/components/futures";
import type { PickupResources, PyroxeneScheduleItem } from "~/components/futures";
import type { PyroxenePlannerOptions } from "~/models/pyroxene-planner";
import Page from "~/components/navigation/Page";
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
import { ErrorPage } from "~/components/organisms/error";


export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const contents = await getPyroxenePlannerContents(env);

  const currentUser = await getAuthenticator(env).isAuthenticated(request);
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

  const favoritedStudents = await getUserFavoritedStudents(env, currentUser.id);
  const latestResources = await getLatestPyroxeneOwnedResource(env, currentUser.id);
  const savedOptions = await getPyroxenePlannerOptions(env, currentUser.id);
  const eventData = await getAllPyroxeneEventData(env, currentUser.id);
  return {
    signedIn: currentUser !== null,
    contents,
    favoritedStudents: favoritedStudents.map(({ contentId, studentId }) => ({ contentUid: contentId, studentUid: studentId })),
    latestResources: {
      pyroxene: latestResources?.pyroxene ?? 0,
      oneTimeTicket: latestResources?.oneTimeTicket ?? 0,
      tenTimeTicket: latestResources?.tenTimeTicket ?? 0,
      inputAt: latestResources?.inputAt ?? null,
    },
    timelineItems: await getPyroxeneTimelineItems(env, currentUser.id),
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
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
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
      await createOtherPyroxeneGain(env, currentUser.id, createData.other.date, pyroxene, oneTimeTicket, tenTimeTicket, createData.other.description);
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
  const { signedIn, contents, favoritedStudents, timelineItems, eventData } = loaderData;

  const [initialDate, setInitialDate] = useState<Date | null>(loaderData.latestResources.inputAt ? new Date(loaderData.latestResources.inputAt) : null);
  const [initialResources, setInitialResources] = useState<PickupResources>(loaderData.latestResources);

  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const [revalidated, setRevalidated] = useState(false);

  const handleSaveOwnedResources = (eventUid: string | null, resources: PickupResources) => {
    setRevalidated(false);
    fetcher.submit(
      { createData: { ownedResources: { eventUid, ...resources } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleUpdateEventData = (eventUid: string, data: { completed?: boolean; expectedTrials?: number | null }) => {
    setRevalidated(false);
    fetcher.submit(
      { eventData: { eventUid, ...data } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleDeletePickupComplete = (eventUid: string) => {
    setRevalidated(false);
    fetcher.submit(
      { deleteData: { eventUid } },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const handleDeleteItem = (itemUid: string) => {
    setRevalidated(false);
    fetcher.submit(
      { deleteData: { itemUid } },
      { method: "DELETE", encType: "application/json" },
    );
  };

  const handleSaveBuy = (quantity: number, date: Date) => {
    setRevalidated(false);
    fetcher.submit(
      { createData: { buy: { quantity, date: date.toISOString() } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSavePackage = (startDate: Date, packageType: "half" | "full") => {
    setRevalidated(false);
    fetcher.submit(
      { createData: { package: { startDate: startDate.toISOString(), packageType } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveAttendance = (startDate: Date) => {
    setRevalidated(false);
    fetcher.submit(
      { createData: { attendance: { startDate: startDate.toISOString() } } },
      { method: "POST", encType: "application/json" },
    );
  };

  const handleSaveOther = (resources: PickupResources, description: string, date: Date) => {
    setRevalidated(false);
    fetcher.submit(
      { createData: { other: { resources, description, date: date.toISOString() } } },
      { method: "POST", encType: "application/json" },
    );
  };

  // Update state when loader data changes (e.g., after revalidation)
  useEffect(() => {
    setInitialDate(loaderData.latestResources.inputAt ? new Date(loaderData.latestResources.inputAt) : null);
    setInitialResources(loaderData.latestResources);
  }, [loaderData.latestResources]);

  useEffect(() => {
    if (loaderData.calcOptions) {
      setOptions(loaderData.calcOptions);
    }
  }, [loaderData.calcOptions]);

  useEffect(() => {
    if (!revalidated && fetcher.data && !fetcher.data.success && fetcher.state === "idle") {
      revalidator.revalidate();
      setRevalidated(true);
    }
  }, [fetcher.data, fetcher.state, fetcher.formMethod, revalidator, revalidated]);

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
    timeline: {
      display: ["event", "raid", "buy", "package_onetime"],
    },
  };

  const [options, setOptions] = useState<PyroxenePlannerOptions>(
    loaderData.calcOptions ?? defaultOptions
  );

  const eventDataMap = useMemo(() => {
    const map = new Map<string, { completed: boolean; expectedTrials: number | null }>();
    eventData.forEach((data) => {
      map.set(data.eventUid, {
        completed: data.completed,
        expectedTrials: data.expectedTrials,
      });
    });
    return map;
  }, [eventData]);

  const scheduleItems = useMemo(() => {
    const items: PyroxeneScheduleItem[] = [];
    contents.forEach((content) => {
      if (content.kind === "event") {
        items.push({
          event: {
            uid: content.uid,
            name: content.name,
            since: content.since,
            until: content.until,
            recruitments: content.recruitments.map((recruitment) => ({
              ...recruitment,
              favorited: favoritedStudents.some(({ contentUid, studentUid }) => contentUid === content.uid && studentUid === recruitment.student?.uid),
            })),
          },
        });
      } else if (content.kind === "raid") {
        items.push({ raid: { uid: content.uid, name: content.name, type: content.type, since: content.since, until: content.until } });
      }
    });
    timelineItems.forEach((item) => {
      if (item.source === "buy") {
        items.push({
          onetimeGain: { uid: item.uid, source: "buy", description: item.description, date: new Date(item.eventAt), pyroxeneDelta: item.pyroxeneDelta },
        });
      } else if (item.source === "package_onetime") {
        items.push({
          onetimeGain: { uid: item.uid, source: "package_onetime", description: item.description, date: new Date(item.eventAt), pyroxeneDelta: item.pyroxeneDelta },
        });
      } else if (item.source === "package_daily") {
        items.push({
          repeatedGain: {
            source: "package_daily", description: item.description, date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta,
            repeatIntervalDays: item.repeatIntervalDays!,
            repeatCount: item.repeatCount!,
          },
        });
      } else if (item.source === "attendance") {
        items.push({
          repeatedGain: {
            source: "attendance", description: item.description, date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta, repeatIntervalDays: item.repeatIntervalDays!,
          },
        });
      } else if (item.source === "other") {
        items.push({
          onetimeGain: {
            uid: item.uid, source: "other", description: item.description, date: new Date(item.eventAt),
            pyroxeneDelta: item.pyroxeneDelta, oneTimeTicketDelta: item.oneTimeTicketDelta, tenTimeTicketDelta: item.tenTimeTicketDelta
          },
        });
      }
    });
    return items;
  }, [contents, favoritedStudents, timelineItems]);

  const isSaving = fetcher.state === "submitting" || fetcher.state === "loading";

  return (
    <>
      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed bottom-4 right-8 z-50 flex items-center gap-2 px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-lg shadow-lg">
          <ArrowPathIcon className="size-4 animate-spin" />
          <span className="text-sm font-medium">저장중...</span>
        </div>
      )}

      <Page
        title="청휘석 플래너 (β)"
        description="현재 보유 재화, 각종 수급 계획을 바탕으로 관심 학생 모집 시점의 재화 수량을 예상해보세요"
        links={[
          {
            Icon: CalendarIcon,
            title: "미래시",
            description: "관심 학생의 모집 일정을 확인할 수 있어요",
            to: "/futures",
          },
        ]}
        panels={[
          {
            title: "재화 수급 계획",
            Icon: PlusIcon,
            description: "획득 일정과 수량을 입력해주세요",
            disabled: !signedIn,
            children: <PyroxenePlannerInputPanel
              onSaveBuy={(quantity, date) => handleSaveBuy(quantity, date)}
              onSavePackage={(startDate, packageType) => handleSavePackage(startDate, packageType)}
              onSaveAttendance={(startDate) => handleSaveAttendance(startDate)}
              onSaveOther={(resources, description, date) => handleSaveOther(resources, description, date)}
            />,
          },
          {
            title: "플래너 설정",
            Icon: ChartBarIcon,
            description: "계산 조건을 선택해주세요",
            foldable: signedIn,
            children: <PyroxenePlannerOptionsPanel options={options} onOptionsChange={(newOptions) => {
              setOptions(newOptions);
              fetcher.submit(
                { calcOptions: newOptions },
                { method: "POST", encType: "application/json" },
              );
            }} />,
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
  )
}
