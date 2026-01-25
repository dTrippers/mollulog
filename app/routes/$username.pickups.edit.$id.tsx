import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, redirect } from "react-router";
import { useLoaderData, useSearchParams, useSubmit } from "react-router";
import dayjs from "dayjs";
import { useState } from "react";
import { getAuthenticator } from "~/auth/authenticator.server";
import { SubTitle, Title } from "~/components/atoms/typography";
import { PickupHistoryEditor, PickupHistoryImporter } from "~/components/organisms/pickup";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { createPickupHistory, getPickupHistory, type PickupHistory, updatePickupHistory } from "~/models/pickup-history";
import { getAllStudents } from "~/models/student";
import { FormGroup } from "~/components/organisms/form";
import { ContentSelectForm } from "~/components/molecules/form";
import { FilterButtons } from "~/components/navigation";
import { Bars3Icon } from "@heroicons/react/16/solid";

const recruitmentEventsQuery = graphql(`
  query RecruitmentEvents {
    events(first: 9999) {
      nodes {
        uid name since until type rerun
        recruitments {
          student { uid name }
          pickup
        }
      }
    }
  }
`);

export const meta: MetaFunction = () => [
  { title: "모집 이력 관리 | 몰루로그" },
];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  let currentPickupHistory = null;
  if (params.id && params.id !== "new") {
    currentPickupHistory = await getPickupHistory(env, sensei.id, params.id, true);
  }

  const { data, error } = await runQuery(recruitmentEventsQuery, {});
  if (!data) {
    console.error(error);
    throw "failed to load data";
  }

  const now = dayjs();
  return {
    events: data.events.nodes.filter((event) => event.recruitments.length > 0 && dayjs(event.since).isBefore(now)).reverse(),
    tier3Students: (await getAllStudents(env))
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
  const data = await request.json<ActionData>();

  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  if (params.id && params.id !== "new") {
    await updatePickupHistory(env, sensei.id, params.id, data.eventUid, data.result, data.rawResult);
  } else {
    await createPickupHistory(env, sensei.id, data.eventUid, data.result, data.rawResult ?? null);
  }
  return redirect("/my?path=pickups");
}

export default function EditPickup() {
  const { events, tier3Students, currentPickupHistory } = useLoaderData<typeof loader>();

  let initialEventUid = null;
  if (currentPickupHistory) {
    initialEventUid = currentPickupHistory.eventId;
  } else {
    const [searchParams] = useSearchParams();
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
    currentPickupHistory.result.forEach((trial) => {
      initialTier3Count = (initialTier3Count ?? 0) + trial.tier3Count;
      initialTier3StudentUids = (initialTier3StudentUids ?? []).concat(trial.tier3StudentIds);
    });
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
      <FormGroup>
        <ContentSelectForm
          label="이벤트"
          description="모집을 진행한 이벤트를 선택해주세요."
          name="eventUid"
          contents={events}
          initialValue={initialEventUid ?? undefined}
          onSelect={setEventUid}
        />
      </FormGroup>

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
                exclusive atLeastOne
              />
            </div> 
          )}
          {editorMode === "edit" && (
            <PickupHistoryEditor
              tier3Students={tier3Students}
              initialTotalCount={initialTotalCount}
              initialTier3Count={initialTier3Count}
              initialTier3StudentIds={initialTier3StudentUids}
              onComplete={(result) => submit({
                eventUid,
                result: [{ trial: result.totalCount, tier3Count: result.tier3Count, tier3StudentIds: result.tier3StudentIds }],
              })}
            />
          )}
          {editorMode === "import" && (
            <PickupHistoryImporter
              tier3Students={tier3Students}
              initialTotalCount={initialTotalCount}
              initialTier3Count={initialTier3Count}
              initialTier3StudentIds={initialTier3StudentUids}
              initialRawData={currentPickupHistory?.rawResult ?? undefined}
              onComplete={({ totalCount, tier3Count, tier3StudentIds, rawData }) => submit({
                eventUid,
                result: [{ trial: totalCount, tier3Count, tier3StudentIds }],
                rawResult: rawData,
              })}
            />
          )}
        </>
      )}
    </>
  );
}
