import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, redirect, useLoaderData, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { LoadFailureState } from "~/components/v2/features/students/LoadFailureState";
import {
  getRecruitmentResultCountStats,
  isRecordedRecruitmentResult,
  resolveRecruitmentResultStudents,
} from "~/domain/recruitment-result";
import { compareInstantAsc, compareInstantDesc, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { getRecruitmentGroupsByUids, getRecruitmentPoolStudents } from "~/models/recruitment";
import {
  deleteRecruitmentResult,
  getRecruitmentResultComments,
  getRecruitmentResults,
} from "~/models/recruitment-result.server";
import { getAllStudentsMap } from "~/models/student";
import {
  getTimelineContentsByRecruitmentGroupUids,
  groupTimelineContentsByRecruitmentGroupUid,
} from "~/models/timeline-content.server";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import { useUserLayout } from "./$username._components/user-layout";
import PickupHistoryList from "./$username.pickups._components/PickupHistoryList";
import PickupStats from "./$username.pickups._components/PickupStats";
import { DELETE_FAILED } from "./$username.pickups._components/pickup-record";

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 모집 기록 | 몰루로그`.trim() },
    { name: "description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
    { name: "og:title", content: `${params.username || ""} - 모집 기록 | 몰루로그`.trim() },
    { name: "og:description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
  ];
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const routeSensei = await getRouteSensei(env, params, sensei.id, { ctx });
  if (routeSensei.username !== sensei.username) {
    return data({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const uid = formData.get("uid");
  if (typeof uid !== "string" || uid.length === 0) {
    throw routeError(400, "pickup_history.uid_missing", "삭제할 모집 기록을 확인할 수 없어요");
  }

  try {
    await deleteRecruitmentResult(env, sensei.id, uid);
  } catch (error) {
    // The card names the failure at its own record, so the action answers with data instead of the 500 page.
    getLogger(env, ctx, { route: "$username.pickups" }).error("Recruitment result delete failed", error, { uid });
    return data({ error: DELETE_FAILED, uid }, { status: 500 });
  }
  return redirect(`/@${sensei.username}/pickups`);
};

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });

  const [recruitmentResults, allStudentsMap] = await Promise.all([
    getRecruitmentResults(env, sensei.id),
    getAllStudentsMap(env, true),
  ]);
  const eventUids = recruitmentResults.map((result) => result.recruitmentGroupUid);

  const [groups, timelineContents, poolStudents] = await Promise.all([
    getRecruitmentGroupsByUids(env, eventUids),
    getTimelineContentsByRecruitmentGroupUids(publicReadEnv, eventUids, { ctx }),
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

  const logger = getLogger(env, ctx, { route: "$username.pickups" });
  let tier3Count = 0;
  let tier3DrawCount = 0;
  let tier3RateCount = 0;
  let pickupCount = 0;
  let pickupDrawCount = 0;
  let pickupRateCount = 0;
  let totalTrial = 0;
  let missingTrialCount = 0;
  let hasFesRecord = false;
  // A record whose linked students or event cannot be resolved takes its own place in the list as a failure.
  const unavailableRecords: { uid: string; since: UtcIsoString }[] = [];

  const aggregatedHistories = recruitmentResults.filter(isRecordedRecruitmentResult).flatMap((result) => {
    try {
      const group = groupMap.get(result.recruitmentGroupUid);
      const timelineContents = [...(timelineContentsByGroupUid.get(result.recruitmentGroupUid) ?? [])].sort((a, b) =>
        compareInstantAsc(a.startAt, b.startAt),
      );
      const firstTimelineContent = timelineContents[0];
      if (!firstTimelineContent) {
        throw routeError(500, "pickup_history.timeline_content_missing", "모집 기록 정보를 불러오지 못했어요", {
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

      // Totals change only after the whole record resolved, so a failed record never half-counts.
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
      if (group?.recruitmentType === "fes") {
        hasFesRecord = true;
      }
      const comment = result.commentPostUid ? (commentMap.get(result.commentPostUid) ?? null) : null;

      return [
        {
          uid: result.uid,
          event: {
            events: timelineContents.map((content) => ({ uid: content.uid, name: content.name })),
            logoContentUid: firstTimelineContent.contentUid ?? null,
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
        },
      ];
    } catch (error) {
      logger.error("Recruitment record could not be resolved", error, {
        recruitmentResultUid: result.uid,
        recruitmentGroupUid: result.recruitmentGroupUid,
      });
      unavailableRecords.push({
        uid: result.uid,
        since: toUtcIso(result.completedAt ?? result.createdAt),
      });
      return [];
    }
  });
  aggregatedHistories.sort((a, b) => compareInstantDesc(a.event.since, b.event.since));

  return {
    me: sensei.username === currentUser?.username,
    recruitmentHistories: aggregatedHistories,
    unavailableRecords,
    recruitmentStats: {
      trial: totalTrial,
      tier3Count,
      tier3DrawCount,
      tier3RateCount,
      pickupCount,
      pickupDrawCount,
      pickupRateCount,
      missingTrialCount,
      hasFesRecord,
    },
  };
};

export function ErrorBoundary() {
  const revalidator = useRevalidator();
  return <LoadFailureState title="모집 기록을 불러오지 못했어요" onRetry={() => revalidator.revalidate()} />;
}

export default function UserPickups() {
  const { recruitmentHistories, unavailableRecords, recruitmentStats, me } = useLoaderData<typeof loader>();
  const { username } = useUserLayout();
  const recordCount = recruitmentHistories.length + unavailableRecords.length;

  return (
    <div className="flex flex-col gap-v2-section-gap">
      <PickupStats stats={recruitmentStats} recordCount={recordCount} unavailableCount={unavailableRecords.length} />
      <PickupHistoryList
        username={username}
        histories={recruitmentHistories}
        unavailableRecords={unavailableRecords}
        editable={me}
      />
    </div>
  );
}
