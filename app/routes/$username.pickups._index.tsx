import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { AddContentButton } from "~/components/features/editor";
import { SubTitle } from "~/components/primitives";
import { compareInstantDesc } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { deleteRecruitmentResult, getRecruitmentResultComments, getRecruitmentResults } from "~/models/recruitment-result";
import { getAllStudentsMap } from "~/models/student";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import { RecruitmentRepository } from "~/repositories";
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
  await deleteRecruitmentResult(env, sensei.id, formData.get("uid") as string);
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
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getRouteSensei(env, params);
  const recruitmentRepository = new RecruitmentRepository(env);

  const [recruitmentResults, allStudentsMap] = await Promise.all([
    getRecruitmentResults(env, sensei.id),
    getAllStudentsMap(env, true),
  ]);
  const eventUids = recruitmentResults.map((result) => result.recruitmentGroupUid);

  const [groups, timelineContents, poolStudents] = await Promise.all([
    recruitmentRepository.getByUids(eventUids),
    getTimelineContentsByRecruitmentGroupUids(env, eventUids),
    recruitmentRepository.getPoolStudents(),
  ]);
  const commentMap = await getRecruitmentResultComments(
    env,
    sensei.id,
    recruitmentResults.map((result) => result.commentPostUid),
  );

  const groupMap = new Map(groups.map((group) => [group.uid, group] as const));
  const poolStudentsMap = new Map(poolStudents.map((student) => [student.uid, student] as const));
  const timelineContentMap = new Map(
    timelineContents.flatMap((content) =>
      content.recruitmentGroupUid ? [[content.recruitmentGroupUid, content] as const] : [],
    ),
  );

  let tier3Count = 0;
  let tier3DrawCount = 0;
  let tier3RateCount = 0;
  let pickupCount = 0;
  let pickupDrawCount = 0;
  let pickupRateCount = 0;
  let totalTrial = 0;
  let missingTrialCount = 0;

  const aggregatedHistories = recruitmentResults
    .filter((result) => result.completedAt !== null || result.recruitedStudents.length > 0 || result.exchangedStudents.length > 0)
    .map((result) => {
      const group = groupMap.get(result.recruitmentGroupUid);
      const timelineContent = timelineContentMap.get(result.recruitmentGroupUid);
      if (!timelineContent) {
        throw routeError(500, "pickup_history.timeline_content_missing", "모집 이력 정보를 불러오지 못했어요", {
          eventId: result.recruitmentGroupUid,
        });
      }

      const pickupStudentUids = group ? getPickupStudentUids(group) : new Set<string>();
      const groupStudentsMap = new Map(
        group?.recruitments.flatMap(({ student }) => (student ? [[student.uid, student] as const] : [])) ?? [],
      );
      const recruitedStudents =
        result.recruitedStudents.length > 0 || !result.completedAt
          ? result.recruitedStudents
          : (group?.recruitments.flatMap(({ pickup, student }) => {
              if (!pickup || !student) {
                return [];
              }
              return [{ studentUid: student.uid, tier: student.initialTier, pickup: true }];
            }) ?? []);
      const toDisplayStudents = (studentResults: typeof recruitedStudents) =>
        studentResults
        .filter(({ studentUid }) => studentUid)
        .map(({ studentUid, pickup }) => {
          const student = allStudentsMap[studentUid] ?? poolStudentsMap.get(studentUid) ?? groupStudentsMap.get(studentUid);
          if (!student) {
            throw routeError(500, "pickup_history.student_missing", "모집한 학생 정보를 불러오지 못했어요", {
              recruitmentResultUid: result.uid,
              recruitmentGroupUid: result.recruitmentGroupUid,
              studentUid,
            });
          }

          return {
            uid: studentUid,
            name: student.name,
            tier: student.initialTier,
            pickup: pickup || pickupStudentUids.has(studentUid),
          };
        });
      const students = toDisplayStudents(recruitedStudents);
      const exchangedStudents = toDisplayStudents(result.exchangedStudents);

      const tier3Students = students.filter(({ tier }) => tier === 3);
      const tier3ExchangedStudents = exchangedStudents.filter(({ tier }) => tier === 3);
      const currentTier3Count = tier3Students.length;
      const currentPickupCount = tier3Students.filter(({ pickup }) => pickup).length;
      const currentTier3ExchangedCount = tier3ExchangedStudents.length;
      const currentPickupExchangedCount = tier3ExchangedStudents.filter(({ pickup }) => pickup).length;
      const rateMultiplier = group?.recruitmentType === "fes" ? 0.5 : 1;

      tier3Count += currentTier3Count + currentTier3ExchangedCount;
      tier3DrawCount += currentTier3Count;
      pickupCount += currentPickupCount + currentPickupExchangedCount;
      pickupDrawCount += currentPickupCount;
      if (result.trial === null) {
        missingTrialCount += 1;
      } else {
        tier3RateCount += currentTier3Count * rateMultiplier;
        pickupRateCount += currentPickupCount * rateMultiplier;
        totalTrial += result.trial;
      }
      const comment = result.commentPostUid ? (commentMap.get(result.commentPostUid) ?? null) : null;

      return {
        uid: result.uid,
        event: {
          uid: timelineContent.uid,
          name: timelineContent.name,
          type: group?.recruitmentType ?? "pickup",
          since: timelineContent.startAt,
        },
        trial: result.trial,
        recruitedStudents: students,
        exchangedStudents,
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
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.trial} 번</p>
        </div>
        <div className="text-center">
          <p className="text-xs md:text-base text-neutral-500 dark:text-neutral-400">★3 획득 수</p>
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.tier3Count} 번</p>
          {recruitmentStats.trial > 0 && (
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
              {((recruitmentStats.tier3RateCount / recruitmentStats.trial) * 100).toFixed(2)} %
            </p>
          )}
        </div>
        <div className="text-center">
          <p className="text-xs md:text-base text-neutral-500 dark:text-neutral-400">★3 픽업 획득 수</p>
          <p className="text-lg md:text-2xl font-bold">{recruitmentStats.pickupCount} 번</p>
          {recruitmentStats.trial > 0 && (
            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
              {((recruitmentStats.pickupRateCount / recruitmentStats.trial) * 100).toFixed(2)} %
            </p>
          )}
        </div>
      </div>
      <p className="mt-4 mb-16 text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
        모집 포인트 교환 학생은 획득 수에 포함하고 모집 확률 계산에서는 제외했어요. 페스 기간에 모집한 ★3 학생은 확률을 0.5배로 계산했어요.
      </p>

      <SubTitle text="모집 이력" />
      {me && <AddContentButton text="새로운 모집 이력 추가하기" link="/my?path=pickups/edit/new" />}
      {recruitmentHistories.length === 0 && <p className="my-16 text-center">아직 모집 이력이 없어요</p>}
      {recruitmentHistories.map(({ uid, event, recruitedStudents, exchangedStudents, trial, comment }) => {
        return (
          <PickupHistoryView
            key={uid}
            uid={uid}
            event={event}
            recruitedStudents={recruitedStudents}
            exchangedStudents={exchangedStudents}
            trial={trial}
            comment={comment}
            trialMissing={trial === null}
            editable={me}
          />
        );
      })}
    </div>
  );
}
