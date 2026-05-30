import { Bars3Icon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, redirect } from "react-router";
import { useLoaderData, useSearchParams, useSubmit } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EventSelector } from "~/components/features/events";
import { FilterButtons, SubTitle, Title } from "~/components/primitives";
import { compareInstantDesc, isInstantBefore, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { resolveContentName } from "~/models/content-name";
import {
  type PickupHistory,
  createPickupHistory,
  getPickupHistory,
  updatePickupHistory,
} from "~/models/pickup-history";
import { getAllStudents } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories";
import PickupHistoryEditor from "./$username.pickups._components/PickupHistoryEditor";
import PickupHistoryImporter from "./$username.pickups._components/PickupHistoryImporter";

const PICKUP_EVENT_SELECTOR_LIMIT = 20;

export const meta: MetaFunction = () => [{ title: "모집 이력 관리 | 몰루로그" }];

function getRouteUsername(params: { username?: string }) {
  const usernameParam = params.username;
  if (!usernameParam?.startsWith("@")) {
    throw new Response("Not Found", { status: 404 });
  }

  return usernameParam.replace("@", "");
}

function redirectToCanonicalEditor(params: { id?: string }) {
  return redirect(`/my?path=pickups/edit/${params.id ?? "new"}`);
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  if (getRouteUsername(params) !== sensei.username) {
    return redirectToCanonicalEditor(params);
  }

  const recruitmentRepository = new RecruitmentRepository(env);
  let currentPickupHistory = null;
  if (params.id && params.id !== "new") {
    currentPickupHistory = await getPickupHistory(env, sensei.id, params.id, true);
  }

  const now = nowUtcIso();

  const [allGroups, allStudentsList] = await Promise.all([
    recruitmentRepository.getAllHistorical(),
    getAllStudents(env),
  ]);

  const pickupGroups = allGroups.filter(
    (g) => g.recruitments.some((r) => r.pickup && r.student) && isInstantBefore(g.startAt, now),
  );
  const timelineContents = await getTimelineContentsByRecruitmentGroupUids(
    env,
    pickupGroups.map((group) => group.uid),
  );
  const timelineContentMap = new Map(
    timelineContents.map((content) => [content.recruitmentGroupUid, content] as const),
  );

  const events = await Promise.all(
    pickupGroups.map(async (group) => {
      const name =
        timelineContentMap.get(group.uid)?.name ??
        (await resolveContentName(env, {
          uid: group.uid,
          contentType: group.contentType ?? "pickup",
          contentUid: group.contentUid ?? null,
        }));
      return {
        uid: group.uid,
        name,
        since: toUtcIso(group.startAt),
        until: group.endAt ? toUtcIso(group.endAt) : null,
        recruitments: group.recruitments
          .filter((r) => r.pickup && r.student)
          .map((r) => ({
            student: r.student ? { uid: r.student.uid, name: r.student.name ?? "" } : null,
            pickup: r.pickup,
          })),
      };
    }),
  );

  events.sort((a, b) => compareInstantDesc(a.since, b.since));

  return {
    events,
    tier3Students: allStudentsList
      .filter((student) => student.initialTier === 3)
      .sort((a, b) => b.order - a.order)
      .map((student) => ({ uid: student.uid, name: student.name })),
    currentPickupHistory,
  };
};

type ActionData = {
  eventUid: string;
  result: PickupHistory["result"];
  rawResult?: string;
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  if (getRouteUsername(params) !== sensei.username) {
    return redirectToCanonicalEditor(params);
  }

  const data = await request.json<ActionData>();

  if (params.id && params.id !== "new") {
    await updatePickupHistory(env, sensei.id, params.id, data.eventUid, data.result, data.rawResult);
  } else {
    await createPickupHistory(env, sensei.id, data.eventUid, data.result, data.rawResult ?? null);
  }
  return redirect("/my?path=pickups");
};

export default function EditPickup() {
  const { events, tier3Students, currentPickupHistory } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  let initialEventUid = null;
  if (currentPickupHistory) {
    initialEventUid = currentPickupHistory.eventId;
  } else {
    const eventId = searchParams.get("eventId");
    if (eventId) {
      initialEventUid = eventId;
    }
  }

  let initialTotalCount: number | undefined = undefined;
  let initialTier3Count: number | undefined = undefined;
  let initialTier3StudentUids: string[] | undefined = undefined;
  if (currentPickupHistory?.result) {
    initialTotalCount = Math.max(...currentPickupHistory.result.map((trial) => trial.trial));
    for (const trial of currentPickupHistory.result) {
      initialTier3Count = (initialTier3Count ?? 0) + trial.tier3Count;
      initialTier3StudentUids = (initialTier3StudentUids ?? ([] as string[])).concat(trial.tier3StudentIds);
    }
  }

  const initialEvent = initialEventUid ? events.find((event) => event.uid === initialEventUid) : null;
  const [eventUid, setEventUid] = useState<string | null>(initialEvent?.uid ?? null);

  const [editorMode, setEditorMode] = useState<"edit" | "import">(currentPickupHistory?.rawResult ? "import" : "edit");

  const rawSubmit = useSubmit();
  const submit = (data: ActionData) => rawSubmit(data, { method: "post", encType: "application/json" });

  return (
    <>
      <Title text="모집 이력 관리" />

      <SubTitle text="모집 이벤트" />
      <EventSelector
        label="이벤트"
        description="모집을 진행한 이벤트를 선택해주세요."
        name="eventUid"
        events={events}
        currentEventUid={eventUid}
        maxVisibleEvents={PICKUP_EVENT_SELECTOR_LIMIT}
        placeholder="이벤트 선택"
        searchPlaceholder="이벤트 또는 모집 학생 이름으로 찾기"
        onSelect={setEventUid}
      />

      {eventUid && (
        <>
          <SubTitle text="모집 결과" />
          {!currentPickupHistory && (
            <div className="mb-4">
              <FilterButtons
                Icon={Bars3Icon}
                buttonProps={[
                  { text: "직접 추가", active: editorMode === "edit", onToggle: () => setEditorMode("edit") },
                  { text: "외부 데이터", active: editorMode === "import", onToggle: () => setEditorMode("import") },
                ]}
                exclusive
                atLeastOne
              />
            </div>
          )}
          {editorMode === "edit" && (
            <PickupHistoryEditor
              tier3Students={tier3Students}
              initialTotalCount={initialTotalCount}
              initialTier3Count={initialTier3Count}
              initialTier3StudentIds={initialTier3StudentUids}
              onComplete={(result) =>
                submit({
                  eventUid,
                  result: [
                    {
                      trial: result.totalCount,
                      tier3Count: result.tier3Count,
                      tier3StudentIds: result.tier3StudentIds,
                    },
                  ],
                })
              }
            />
          )}
          {editorMode === "import" && (
            <PickupHistoryImporter
              tier3Students={tier3Students}
              initialTotalCount={initialTotalCount}
              initialTier3Count={initialTier3Count}
              initialTier3StudentIds={initialTier3StudentUids}
              initialRawData={currentPickupHistory?.rawResult ?? undefined}
              onComplete={({ totalCount, tier3Count, tier3StudentIds, rawData }) =>
                submit({
                  eventUid,
                  result: [{ trial: totalCount, tier3Count, tier3StudentIds }],
                  rawResult: rawData,
                })
              }
            />
          )}
        </>
      )}
    </>
  );
}
