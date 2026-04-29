import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { deletePickupHistory, getPickupHistories } from "~/models/pickup-history";
import { data, redirect, useLoaderData } from "react-router";
import { AddContentButton } from "~/components/features/editor";
import PickupHistoryView from "./$username.pickups._components/PickupHistoryView";
import { SubTitle } from "~/components/primitives";
import { resolveContentName } from "~/models/content-name";
import { getAllStudentsMap } from "~/models/student";
import dayjs from "dayjs";
import { getRouteSensei } from "./$username";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories";

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 모집 이력 | 몰루로그`.trim() },
    { name: "description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
    { name: "og:title", content: `${params.username || ""} - 모집 이력 | 몰루로그`.trim() },
    { name: "og:description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
  ];
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const routeSensei = await getRouteSensei(env, params);
  if (routeSensei.username !== sensei.username) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  await deletePickupHistory(env, sensei.id, formData.get("uid") as string);
  return null;
};

function getPickupStudentUids(event: { recruitments: { pickup: boolean; student: { uid: string } | null }[] }) {
  const pickupStudentUids = new Set<string>();
  for (const { pickup, student } of event.recruitments) {
    if (pickup && student) {
      pickupStudentUids.add(student.uid);
    }
  }
  return pickupStudentUids;
};

function fallbackPickupName(name: string | null | undefined, fallbackUids: string[]) {
  if (!name || fallbackUids.includes(name)) {
    return "픽업 모집";
  }
  return name;
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getRouteSensei(env, params);
  const recruitmentRepository = new RecruitmentRepository(env);

  const [recruitmentHistories, allStudentsMap] = await Promise.all([
    getPickupHistories(env, sensei.id),
    getAllStudentsMap(env),
  ]);
  const eventUids = recruitmentHistories.map((history) => history.eventId);

  const [groups, timelineContents] = await Promise.all([
    recruitmentRepository.getByUids(eventUids),
    getTimelineContentsByRecruitmentGroupUids(env, eventUids),
  ]);

  const groupMap = new Map(groups.map((group) => [group.uid, group] as const));
  const timelineContentMap = new Map(
    timelineContents.flatMap((content) =>
      content.recruitmentGroupUid ? [[content.recruitmentGroupUid, content] as const] : [],
    ),
  );

  let tier3Count = 0;
  let tier3RateCount = 0;
  let pickupCount = 0;
  let pickupRateCount = 0;
  let totalTrial = 0;

  const aggregatedHistories = (await Promise.all(recruitmentHistories.map(async (history) => {
    const group = groupMap.get(history.eventId);
    const timelineContent = timelineContentMap.get(history.eventId);
    const pickupStudentUids = group ? getPickupStudentUids(group) : new Set<string>();
    const allTier3StudentIds = history.result.flatMap((trial) => trial.tier3StudentIds);
    const students = allTier3StudentIds
      .filter((studentUid) => studentUid && allStudentsMap[studentUid])
      .map((studentUid) => {
        const student = allStudentsMap[studentUid];
        return {
          uid: student.uid,
          name: student.name,
          tier: student.initialTier,
          pickup: pickupStudentUids.has(studentUid),
        };
      });

    const currentTier3Count = history.result.reduce((sum, trial) => sum + trial.tier3Count, 0);
    const currentPickupCount = allTier3StudentIds.filter((uid) => pickupStudentUids.has(uid)).length;
    const rateMultiplier = group?.recruitmentType === "fes" ? 0.5 : 1;

    tier3Count += currentTier3Count;
    pickupCount += currentPickupCount;
    tier3RateCount += currentTier3Count * rateMultiplier;
    pickupRateCount += currentPickupCount * rateMultiplier;
    totalTrial += history.result.length > 0 ? Math.max(...history.result.map((result) => result.trial)) : 0;

    const eventSince = timelineContent?.startAt ?? (group?.startAt ? new Date(group.startAt) : new Date(0));
    const resolvedEventName =
      timelineContent?.name ??
      (group
        ? await resolveContentName(env, {
            uid: group.uid,
            contentType: group.contentType ?? "pickup",
            contentUid: group.contentUid ?? null,
          })
        : null);
    const eventName = fallbackPickupName(resolvedEventName, [
      history.eventId,
      timelineContent?.uid ?? "",
      group?.uid ?? "",
    ]);

    return {
      uid: history.uid,
      event: {
        uid: timelineContent?.uid ?? history.eventId,
        name: eventName,
        type: group?.recruitmentType ?? "pickup",
        since: eventSince,
      },
      trial: history.result.length > 0 ? history.result[history.result.length - 1].trial : 0,
      recruitedStudents: students,
    };
  }))).sort((a, b) => dayjs(b.event.since).diff(dayjs(a.event.since)));

  const currentUser = await getActiveSensei(env, request);
  return {
    me: sensei.username === currentUser?.username,
    recruitmentHistories: aggregatedHistories,
    recruitmentStats: {
      trial: totalTrial,
      tier3Count,
      tier3RateCount,
      pickupCount,
      pickupRateCount,
    },
  };
};

export default function UserPickups() {
  const { recruitmentHistories, recruitmentStats, me } = useLoaderData<typeof loader>();

  return (
    <div className="my-8">
      <SubTitle text="모집 통계" />
      <div className="px-2 md:px-4 py-4 md:py-6 flex grid grid-cols-3 border border-neutral-200 dark:border-neutral-700 rounded-lg">
        <div className="text-center">
          <p className="text-xs md:text-base text-neutral-500 dark:text-neutral-400">총 모집 횟수</p>
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.trial} 번</p>
        </div>
        <div className="text-center">
          <p className="text-xs md:text-base text-neutral-500 dark:text-neutral-400">★3 모집 횟수</p>
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.tier3Count} 번</p>
          {recruitmentStats.trial > 0 && (
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">{(recruitmentStats.tier3RateCount / recruitmentStats.trial * 100).toFixed(2)} %</p>
          )}
        </div>
        <div className="text-center">
          <p className="text-xs md:text-base text-neutral-500 dark:text-neutral-400">★3 픽업 횟수</p>
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.pickupCount} 번</p>
          {recruitmentStats.trial > 0 && (
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">{(recruitmentStats.pickupRateCount / recruitmentStats.trial * 100).toFixed(2)} %</p>
          )}
        </div>
      </div>
      <p className="mt-4 mb-16 text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
        페스 기간에 모집한 ★3 학생은 확률을 0.5배로 계산했어요.
      </p>

      <SubTitle text="모집 이력" />
      {me && <AddContentButton text="새로운 모집 이력 추가하기" link="/my?path=pickups/edit/new" />}
      {recruitmentHistories.length === 0 && (
        <p className="my-16 text-center">
          아직 모집 이력이 없어요
        </p>
      )}
      {recruitmentHistories.map(({ uid, event, recruitedStudents, trial }) => {
        return (
          <PickupHistoryView
            key={uid}
            uid={uid}
            event={event}
            recruitedStudents={recruitedStudents}
            trial={trial}
            editable={me}
          />
        );
      })}
    </div>
  );
}
