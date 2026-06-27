import { DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { type ActionFunctionArgs, type LoaderFunctionArgs, type MetaFunction, redirect } from "react-router";
import { useLoaderData, useSearchParams, useSubmit } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EventSelector } from "~/components/features/events";
import { Button, SubTitle, Textarea, Title } from "~/components/primitives";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { compareInstantDesc, formatInstant, isInstantBefore, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { type PickupHistory, getPickupHistory } from "~/models/pickup-history";
import {
  createRecruitmentResultStudentsFromPickupHistory,
  getRecruitmentResult,
  getRecruitmentResultComment,
  getRecruitmentResultTier3CountFromPickupHistory,
  getRecruitmentResultTrialFromPickupHistory,
  mergeEditableRecruitmentResultStudents,
  upsertRecruitmentResult,
} from "~/models/recruitment-result";
import { resolveRecruitmentResultStudents } from "~/domain/recruitment-result";
import { getAllHistoricalRecruitmentGroups, getRecruitmentGroupByUid } from "~/models/recruitment";
import { getAllStudents } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import PickupHistoryEditor from "./$username.pickups._components/PickupHistoryEditor";
import PickupHistoryImporter from "./$username.pickups._components/PickupHistoryImporter";

const PICKUP_EVENT_SELECTOR_LIMIT = 20;

export const meta: MetaFunction = () => [{ title: "모집 이력 관리 | 몰루로그" }];

function isPickupRecruitmentStudent<
  T extends {
    pickup: boolean;
    recruitmentType?: string | null;
    student: { uid: string } | null;
  },
>(recruitment: T): recruitment is T & { student: NonNullable<T["student"]> } {
  return recruitment.pickup && recruitment.recruitmentType !== "given" && recruitment.student !== null;
}

function canExchangeRecruitmentStudent<
  T extends {
    pickup: boolean;
    recruitmentType?: string | null;
    student: { uid: string } | null;
  },
>(recruitment: T): recruitment is T & { student: NonNullable<T["student"]> } {
  return isPickupRecruitmentStudent(recruitment);
}

type EditablePickupHistory = Omit<PickupHistory, "result"> & {
  result: {
    trial: number | null;
    tier3Count: number;
    tier3StudentIds: string[];
  }[];
  comment?: string | null;
  exchangedStudentIds?: string[];
};

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

function getSaveUnavailableReason({
  eventUid,
  totalCount,
  tier3Count,
  tier3StudentCount,
  skipTier3StudentList,
  exchangedStudentCount,
}: {
  eventUid: string | null;
  totalCount?: number;
  tier3Count?: number;
  tier3StudentCount: number;
  skipTier3StudentList: boolean;
  exchangedStudentCount: number;
}) {
  if (!eventUid) {
    return "모집 이벤트를 선택해주세요.";
  }
  if (totalCount === undefined || totalCount <= 0) {
    return "총 모집 횟수를 입력해주세요.";
  }
  if (tier3Count === undefined || tier3Count < 0) {
    return "모집한 ★3 횟수를 입력해주세요.";
  }
  if (tier3Count > totalCount) {
    return "모집한 ★3 횟수는 총 모집 횟수보다 클 수 없어요.";
  }
  if (!skipTier3StudentList && tier3StudentCount !== tier3Count) {
    return `모집한 ★3 학생을 ${tier3Count}명 선택해주세요. 현재 ${tier3StudentCount}명이 선택됐어요.`;
  }
  const maxExchangedStudentCount = Math.floor(totalCount / 200);
  if (exchangedStudentCount > maxExchangedStudentCount) {
    return `모집 포인트 교환 학생은 최대 ${maxExchangedStudentCount}명까지 입력할 수 있어요.`;
  }

  return null;
}

export function getVisibleTier3StudentUids(studentUids: string[], tier3Count?: number) {
  if (tier3Count === undefined) {
    return studentUids;
  }

  return studentUids.slice(0, Math.max(0, tier3Count));
}

export function shouldSkipTier3StudentListInitially(tier3Count?: number, tier3StudentUids: string[] = []) {
  return (tier3Count ?? 0) > 0 && tier3StudentUids.length === 0;
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

  let currentPickupHistory: EditablePickupHistory | null = null;
  let currentRecruitmentResult: Awaited<ReturnType<typeof getRecruitmentResult>> = null;
  let currentRecruitmentResultComment: string | null = null;
  if (params.id && params.id !== "new") {
    currentRecruitmentResult = await getRecruitmentResult(env, sensei.id, params.id);
    currentRecruitmentResultComment = currentRecruitmentResult
      ? await getRecruitmentResultComment(env, sensei.id, currentRecruitmentResult.commentPostUid)
      : null;
  }

  const now = nowUtcIso();

  const [allGroups, allStudentsList] = await Promise.all([
    getAllHistoricalRecruitmentGroups(env),
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
  const allStudentsMap = Object.fromEntries(allStudentsList.map((student) => [student.uid, student] as const));

  const missingTimelineGroupUids = pickupGroups
    .filter((group) => !timelineContentMap.has(group.uid))
    .map((group) => group.uid);
  if (missingTimelineGroupUids.length > 0) {
    throw routeError(500, "pickup_history.timeline_content_missing", "모집 이력 정보를 불러오지 못했어요", {
      recruitmentGroupUids: missingTimelineGroupUids,
    });
  }

  const events = pickupGroups.map((group) => {
    const timelineContent = timelineContentMap.get(group.uid);
    if (!timelineContent) {
      throw new Error(`timeline content is missing for recruitment group: ${group.uid}`);
    }

    return {
      uid: group.uid,
      name: timelineContent.name,
      since: toUtcIso(group.startAt),
      until: group.endAt ? toUtcIso(group.endAt) : null,
      isSpoiler: timelineContent.isSpoiler,
      recruitments: group.recruitments
        .filter((r) => r.pickup && r.student)
        .map((r) => ({
          student: r.student ? { uid: r.student.uid, name: r.student.name ?? "" } : null,
          pickup: r.pickup,
          recruitmentType: r.recruitmentType,
        })),
    };
  });

  events.sort((a, b) => compareInstantDesc(a.since, b.since));

  if (params.id && params.id !== "new") {
    if (currentRecruitmentResult) {
      const recruitmentGroup = allGroups.find((group) => group.uid === currentRecruitmentResult.recruitmentGroupUid);
      const tier3StudentIds = resolveRecruitmentResultStudents(currentRecruitmentResult.recruitedStudents, {
        allStudentsMap,
        group: recruitmentGroup,
      })
        .filter((student) => student.tier === 3)
        .map((student) => student.uid);
      currentPickupHistory = {
        uid: currentRecruitmentResult.uid,
        userId: currentRecruitmentResult.userId,
        eventId: currentRecruitmentResult.recruitmentGroupUid,
        result: [
          {
            trial: currentRecruitmentResult.trial,
            tier3Count: currentRecruitmentResult.tier3Count ?? tier3StudentIds.length,
            tier3StudentIds,
          },
        ],
        rawResult: currentRecruitmentResult.rawResult,
        comment: currentRecruitmentResultComment,
        exchangedStudentIds: currentRecruitmentResult.exchangedStudents.map((student) => student.studentUid),
      };
    } else {
      currentPickupHistory = await getPickupHistory(env, sensei.id, params.id, true);
    }
  }

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
  exchangedStudentIds?: string[];
  rawResult?: string;
  comment?: string | null;
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
  const recruitmentGroup = await getRecruitmentGroupByUid(env, data.eventUid);
  if (!recruitmentGroup) {
    throw routeError(400, "pickup_history.recruitment_group_missing", "모집 이벤트를 찾을 수 없어요", {
      recruitmentGroupUid: data.eventUid,
    });
  }
  const timelineContent = (await getTimelineContentsByRecruitmentGroupUids(env, [data.eventUid]))[0];
  const exchangeableStudentMap = new Map(
    recruitmentGroup.recruitments.flatMap((recruitment) => {
      if (!canExchangeRecruitmentStudent(recruitment)) {
        return [];
      }
      return [[recruitment.student.uid, recruitment.student] as const];
    }),
  );
  const exchangedStudents = (data.exchangedStudentIds ?? []).map((studentUid) => {
    const student = exchangeableStudentMap.get(studentUid);
    if (!student) {
      throw routeError(400, "pickup_history.exchange_student_invalid", "모집 포인트 교환 학생을 확인할 수 없어요", {
        recruitmentGroupUid: data.eventUid,
        studentUid,
      });
    }

    return {
      studentUid,
      tier: student.initialTier,
      pickup: true,
    };
  });
  const trial = getRecruitmentResultTrialFromPickupHistory({ result: data.result });
  const exchangeCountLimit = Math.floor((trial ?? 0) / 200);
  if (exchangedStudents.length > exchangeCountLimit) {
    throw routeError(
      400,
      "pickup_history.exchange_student_count_invalid",
      "모집 포인트 교환 학생 수가 모집 횟수와 맞지 않아요",
      {
        trial,
        exchangedStudentCount: exchangedStudents.length,
        exchangeCountLimit,
      },
    );
  }

  const pickupStudentUids = new Set(
    recruitmentGroup.recruitments.flatMap((recruitment) =>
      isPickupRecruitmentStudent(recruitment) ? [recruitment.student.uid] : [],
    ),
  );
  const groupStudentInitialTiers = Object.fromEntries(
    recruitmentGroup.recruitments.flatMap((recruitment) =>
      recruitment.student ? [[recruitment.student.uid, recruitment.student.initialTier] as const] : [],
    ),
  );
  const existingRecruitmentResult =
    params.id && params.id !== "new" ? await getRecruitmentResult(env, sensei.id, params.id) : null;
  const recruitedStudents = existingRecruitmentResult
    ? mergeEditableRecruitmentResultStudents({
        existingStudents: existingRecruitmentResult.recruitedStudents,
        history: { result: data.result },
        lookup: { group: recruitmentGroup },
        pickupStudentUids,
        studentInitialTiers: groupStudentInitialTiers,
      })
    : createRecruitmentResultStudentsFromPickupHistory(
        { result: data.result },
        pickupStudentUids,
        groupStudentInitialTiers,
      );
  const tier3Count = getRecruitmentResultTier3CountFromPickupHistory({ result: data.result });

  await upsertRecruitmentResult(env, sensei.id, {
    uid: params.id && params.id !== "new" ? params.id : undefined,
    recruitmentGroupUid: data.eventUid,
    contentUid: timelineContent?.uid ?? null,
    completedAt: nowUtcIso(),
    recruitedStudents,
    exchangedStudents,
    tier3Count,
    trial,
    rawResult: data.rawResult ?? null,
    comment: data.comment ?? null,
  });
  return redirect("/my?path=pickups");
};

export default function EditPickup() {
  const { events, tier3Students, currentPickupHistory } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const displayTimeZone = useDisplayTimeZone();
  const isEditing = currentPickupHistory !== null;

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
    const recordedTrials = currentPickupHistory.result
      .map((trial) => trial.trial)
      .filter((trial): trial is number => trial !== null);
    initialTotalCount = recordedTrials.length > 0 ? Math.max(...recordedTrials) : undefined;
    for (const trial of currentPickupHistory.result) {
      initialTier3Count = (initialTier3Count ?? 0) + trial.tier3Count;
      initialTier3StudentUids = (initialTier3StudentUids ?? ([] as string[])).concat(trial.tier3StudentIds);
    }
  }

  const initialEvent = initialEventUid ? events.find((event) => event.uid === initialEventUid) : null;
  const [eventUid, setEventUid] = useState<string | null>(isEditing ? initialEventUid : (initialEvent?.uid ?? null));
  const selectedEvent = eventUid ? events.find((event) => event.uid === eventUid) : null;
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [tier3Count, setTier3Count] = useState(initialTier3Count);
  const [tier3StudentUids, setTier3StudentUids] = useState(initialTier3StudentUids ?? []);
  const [skipTier3StudentList, setSkipTier3StudentList] = useState(
    shouldSkipTier3StudentListInitially(initialTier3Count, initialTier3StudentUids),
  );
  const [exchangedStudentUids, setExchangedStudentUids] = useState(currentPickupHistory?.exchangedStudentIds ?? []);

  const [showImporter, setShowImporter] = useState(false);
  const [comment, setComment] = useState(currentPickupHistory?.comment ?? "");
  const visibleTier3StudentUids = getVisibleTier3StudentUids(tier3StudentUids, tier3Count);
  const submittedTier3StudentUids = skipTier3StudentList ? [] : visibleTier3StudentUids;
  const saveUnavailableReason = getSaveUnavailableReason({
    eventUid,
    totalCount,
    tier3Count,
    tier3StudentCount: submittedTier3StudentUids.length,
    skipTier3StudentList,
    exchangedStudentCount: exchangedStudentUids.length,
  });

  const rawSubmit = useSubmit();
  const submit = (data: ActionData) => rawSubmit(data, { method: "post", encType: "application/json" });
  const handleTotalCountChange = (value?: number) => {
    setTotalCount(value);
    const exchangeCountLimit = Math.floor((value ?? 0) / 200);
    if (exchangedStudentUids.length > exchangeCountLimit) {
      setExchangedStudentUids((prev) => prev.slice(0, exchangeCountLimit));
    }
  };
  const handleTier3CountChange = (value?: number) => {
    setTier3Count(value);
  };
  const handleSave = () => {
    if (saveUnavailableReason || !eventUid || totalCount === undefined || tier3Count === undefined) {
      return;
    }

    submit({
      eventUid,
      result: [
        {
          trial: totalCount,
          tier3Count,
          tier3StudentIds: submittedTier3StudentUids,
        },
      ],
      exchangedStudentIds: exchangedStudentUids,
      comment: comment.trim() || null,
    });
  };

  return (
    <>
      <Title text="모집 이력 관리" />

      <SubTitle text="모집 이벤트" />
      {isEditing ? (
        initialEvent && (
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="whitespace-pre-line font-semibold text-neutral-950 dark:text-neutral-50">
              {initialEvent.name}
            </p>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {formatInstant(initialEvent.since, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })}
            </p>
          </div>
        )
      ) : (
        <EventSelector
          label="이벤트"
          description="모집을 진행한 이벤트를 선택해주세요."
          name="eventUid"
          events={events}
          currentEventUid={eventUid}
          maxVisibleEvents={PICKUP_EVENT_SELECTOR_LIMIT}
          placeholder="이벤트 선택"
          searchPlaceholder="이벤트 또는 모집 학생 이름으로 찾기"
          onSelect={(uid) => {
            setEventUid(uid);
            setExchangedStudentUids([]);
          }}
        />
      )}

      <SubTitle text="모집 결과" />
      <div className="mb-4">
        <Button
          text={showImporter ? "외부 데이터 닫기" : "외부 데이터 가져오기"}
          icon={DocumentArrowDownIcon}
          variant="tint"
          onClick={() => setShowImporter((prev) => !prev)}
        />
      </div>
      {showImporter && (
        <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <PickupHistoryImporter
            tier3Students={tier3Students}
            onImport={({ totalCount, tier3Count, tier3StudentIds }) => {
              setTotalCount(totalCount);
              setTier3Count(tier3Count);
              setTier3StudentUids(tier3StudentIds);
            }}
          />
        </div>
      )}
      <PickupHistoryEditor
        tier3Students={tier3Students}
        totalCount={totalCount}
        tier3Count={tier3Count}
        tier3StudentIds={visibleTier3StudentUids}
        skipTier3StudentList={skipTier3StudentList}
        exchangedStudentIds={exchangedStudentUids}
        exchangeableStudents={
          selectedEvent?.recruitments.flatMap((recruitment) =>
            canExchangeRecruitmentStudent(recruitment) && recruitment.student ? [recruitment.student] : [],
          ) ?? []
        }
        onTotalCountChange={handleTotalCountChange}
        onTier3CountChange={handleTier3CountChange}
        onTier3StudentIdsChange={setTier3StudentUids}
        onSkipTier3StudentListChange={setSkipTier3StudentList}
        onExchangedStudentIdsChange={setExchangedStudentUids}
      />

      <SubTitle text="모집 결과 의견 (선택)" />
      <Textarea
        value={comment}
        rows={4}
        description="입력하지 않아도 저장할 수 있어요."
        placeholder="남긴 의견은 다른 사람에게 공개돼요."
        onChange={setComment}
      />
      <div className="mt-8 flex flex-col items-start gap-2">
        <Button
          text="모집 결과 저장"
          variant="primary"
          disabled={saveUnavailableReason !== null}
          onClick={handleSave}
        />
        {saveUnavailableReason && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{saveUnavailableReason}</p>
        )}
      </div>
    </>
  );
}
