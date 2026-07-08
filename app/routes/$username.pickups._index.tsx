import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { AddContentButton } from "~/components/features/editor";
import { SubTitle } from "~/components/primitives";
import { getRecruitmentResultCountStats, resolveRecruitmentResultStudents } from "~/domain/recruitment-result";
import { compareInstantAsc, compareInstantDesc } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } from "~/models/recruitment";
import {
  deleteRecruitmentResult,
  getRecruitmentResultComments,
  getRecruitmentResults,
} from "~/models/recruitment-result";
import { getAllStudentsMap } from "~/models/student";
import {
  getTimelineContentsByRecruitmentGroupUids,
  groupTimelineContentsByRecruitmentGroupUid,
} from "~/models/timeline-content";
import { getRouteSensei } from "./$username";
import PickupHistoryView from "./$username.pickups._components/PickupHistoryView";

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
  const uid = formData.get("uid");
  if (typeof uid !== "string" || uid.length === 0) {
    throw routeError(400, "pickup_history.uid_missing", "삭제할 모집 이력을 확인할 수 없어요");
  }

  await deleteRecruitmentResult(env, sensei.id, uid);
  return redirect(`/@${sensei.username}/pickups`);
};

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getRouteSensei(env, params);

  const [recruitmentResults, allStudentsMap] = await Promise.all([
    getRecruitmentResults(env, sensei.id),
    getAllStudentsMap(env, true),
  ]);
  const eventUids = recruitmentResults.map((result) => result.recruitmentGroupUid);

  const [groups, timelineContents, poolStudents] = await Promise.all([
    getRecruitmentGroupsByUids(env, eventUids),
    getTimelineContentsByRecruitmentGroupUids(env, eventUids),
    getRecruitmentPoolStudents(env),
  ]);
  const commentMap = await getRecruitmentResultComments(
    env,
    sensei.id,
    recruitmentResults.map((result) => result.commentPostUid),
  );

  const groupMap = new Map(groups.map((group) => [group.uid, group] as const));
  const poolStudentsMap = new Map(poolStudents.map((student) => [student.uid, student] as const));
  const timelineContentsByGroupUid = groupTimelineContentsByRecruitmentGroupUid(timelineContents);

  let tier3Count = 0;
  let tier3DrawCount = 0;
  let tier3RateCount = 0;
  let pickupCount = 0;
  let pickupDrawCount = 0;
  let pickupRateCount = 0;
  let totalTrial = 0;
  let missingTrialCount = 0;

  const aggregatedHistories = recruitmentResults
    .filter(
      (result) =>
        result.completedAt !== null || result.recruitedStudents.length > 0 || result.exchangedStudents.length > 0,
    )
    .map((result) => {
      const group = groupMap.get(result.recruitmentGroupUid);
      const timelineContents = [...(timelineContentsByGroupUid.get(result.recruitmentGroupUid) ?? [])].sort((a, b) =>
        compareInstantAsc(a.startAt, b.startAt),
      );
      const firstTimelineContent = timelineContents[0];
      if (!firstTimelineContent) {
        throw routeError(500, "pickup_history.timeline_content_missing", "모집 이력 정보를 불러오지 못했어요", {
          eventId: result.recruitmentGroupUid,
        });
      }

      const resolveLookup = { allStudentsMap, poolStudentsMap, group };
      const onMissingStudent = (studentUid: string): never => {
        throw routeError(500, "pickup_history.student_missing", "모집한 학생 정보를 불러오지 못했어요", {
          recruitmentResultUid: result.uid,
          recruitmentGroupUid: result.recruitmentGroupUid,
          studentUid,
        });
      };
      const students = resolveRecruitmentResultStudents(result.recruitedStudents, resolveLookup, onMissingStudent);
      const exchangedStudents = resolveRecruitmentResultStudents(
        result.exchangedStudents,
        resolveLookup,
        onMissingStudent,
      );
      const currentStats = getRecruitmentResultCountStats(result, resolveLookup);

      tier3Count += currentStats.tier3Count;
      tier3DrawCount += currentStats.tier3DrawCount;
      pickupCount += currentStats.pickupCount;
      pickupDrawCount += currentStats.pickupDrawCount;
      if (result.trial === null) {
        missingTrialCount += 1;
      } else {
        tier3RateCount += currentStats.tier3RateCount;
        pickupRateCount += currentStats.pickupRateCount;
        totalTrial += result.trial;
      }
      const comment = result.commentPostUid ? (commentMap.get(result.commentPostUid) ?? null) : null;

      return {
        uid: result.uid,
        event: {
          events: timelineContents.map((content) => ({ uid: content.uid, name: content.name })),
          type: group?.recruitmentType ?? "pickup",
          since: firstTimelineContent.startAt,
        },
        trial: result.trial,
        recruitedStudents: students,
        exchangedStudents,
        stats: {
          totalTrial: currentStats.totalTrial,
          tier3Count: currentStats.tier3Count,
          pickupCount: currentStats.pickupCount,
        },
        comment: comment
          ? {
              ...comment,
              sensei: {
                username: sensei.username,
                profileStudentId: sensei.profileStudentId,
              },
            }
          : null,
      };
    })
    .sort((a, b) => compareInstantDesc(a.event.since, b.event.since));

  const currentUser = await getActiveSensei(env, request);
  return {
    me: sensei.username === currentUser?.username,
    recruitmentHistories: aggregatedHistories,
    recruitmentStats: {
      trial: totalTrial,
      tier3Count,
      tier3DrawCount,
      tier3RateCount,
      pickupCount,
      pickupDrawCount,
      pickupRateCount,
      missingTrialCount,
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
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.trial} 회</p>
        </div>
        <div className="text-center">
          <p className="text-xs md:text-base text-neutral-500 dark:text-neutral-400">★3 획득 수</p>
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.tier3Count} 회</p>
          {recruitmentStats.trial > 0 && (
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
              {((recruitmentStats.tier3RateCount / recruitmentStats.trial) * 100).toFixed(2)} %
            </p>
          )}
        </div>
        <div className="text-center">
          <p className="text-xs md:text-base text-neutral-500 dark:text-neutral-400">★3 픽업 획득 수</p>
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.pickupCount} 회</p>
          {recruitmentStats.trial > 0 && (
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
              {((recruitmentStats.pickupRateCount / recruitmentStats.trial) * 100).toFixed(2)} %
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 mb-16 text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
        페스 기간에 모집한 ★3 학생은 확률을 0.5배로 계산했어요.
      </p>

      <SubTitle text="모집 이력" />
      {me && <AddContentButton text="새로운 모집 이력 추가하기" link="/my?path=pickups/edit/new" />}
      {recruitmentHistories.length === 0 && <p className="my-16 text-center">아직 모집 이력이 없어요</p>}
      {recruitmentHistories.map(({ uid, event, recruitedStudents, exchangedStudents, trial, stats, comment }) => {
        return (
          <PickupHistoryView
            key={uid}
            uid={uid}
            event={event}
            recruitedStudents={recruitedStudents}
            exchangedStudents={exchangedStudents}
            trial={trial}
            stats={stats}
            comment={comment}
            trialMissing={trial === null}
            editable={me}
          />
        );
      })}
    </div>
  );
}
