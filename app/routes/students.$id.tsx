import { ArrowTopRightOnSquareIcon, ChatBubbleLeftRightIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { createPageErrorBoundary, Page } from "~/components/features/layout";
import { StudentInfo } from "~/components/features/students";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { withD1Session } from "~/lib/d1-session";
import { toUtcIso } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { formatStudentFullName, getAllStudentsMap, getStudentDetail } from "~/models/student";
import { getStudentGradingsByStudentWithUsers } from "~/models/student-grading";
import { getTagCountsByStudent } from "~/models/student-grading-tag";
import type { TimelineContent } from "~/models/timeline-content";
import { findEventsForRecruitmentStudent, groupTimelineContentsByRecruitmentGroupUid } from "~/models/timeline-content";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";

/**
 * Restricts the events shown on a student's page to the ones actually listing that student,
 * since a recruitment group can be shared by multiple events (e.g. a rerun and its permanent
 * counterpart) that each only feature a subset of the group's students.
 */
export function getStudentRelevantTimelineContents(
  timelineContents: TimelineContent[],
  recruitmentGroupUids: string[],
  studentUid: string,
) {
  const timelineContentsByGroupUid = groupTimelineContentsByRecruitmentGroupUid(timelineContents);
  const relevantContents = recruitmentGroupUids.flatMap((groupUid) =>
    findEventsForRecruitmentStudent(timelineContentsByGroupUid.get(groupUid) ?? [], studentUid),
  );

  const seenUids = new Set<string>();
  return relevantContents.filter((content) => {
    if (seenUids.has(content.uid)) {
      return false;
    }
    seenUids.add(content.uid);
    return true;
  });
}

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = withD1Session(env, "first-unconstrained");
  const logger = getLogger(env, ctx, {
    route: "students.$id.loader",
    studentUid: uid,
  });

  // Global/uid-independent reads: start these in parallel right away, and swallow
  // rejections on this reference so a student-detail failure below can't surface
  // them as unhandled rejections (they're still awaited via Promise.all afterwards).
  const currentUserPromise = getActiveSensei(env, request);
  const rawAllStudentsPromise = getAllStudentsMap(env, true);
  const allRaidsPromise = getAllRaidSchedules(env);
  for (const p of [currentUserPromise, rawAllStudentsPromise, allRaidsPromise]) {
    p.catch(() => {});
  }

  let student: Awaited<ReturnType<typeof getStudentDetail>>;
  try {
    student = await getStudentDetail(env, uid);
  } catch (error) {
    logger.error("Failed to load student detail", error);
    if (isStudentNotFoundError(error)) {
      throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
    }
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  if (student === undefined) {
    logger.error("Failed to load student detail without response data");
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  if (!student) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }

  // Per-uid reads only start once the uid is confirmed to be a real student, so
  // bot-scanned/invalid uids don't trigger extra D1 lookups.
  const tagCountsPromise = getTagCountsByStudent(env, uid);
  const allGradingsPromise = getStudentGradingsByStudentWithUsers(env, uid, true);

  const recruitmentGroupUids = student.recruitments.map(
    (recruitment: { recruitmentGroup: { uid: string } }) => recruitment.recruitmentGroup.uid,
  );

  const [timelineContents, currentUser, rawAllStudents, tagCounts, allGradings, allRaids] = await Promise.all([
    getTimelineContentsByRecruitmentGroupUids(publicReadEnv, recruitmentGroupUids, { ctx }),
    currentUserPromise,
    rawAllStudentsPromise,
    tagCountsPromise,
    allGradingsPromise,
    allRaidsPromise,
  ]);

  const recruitedStudentTiers = currentUser ? await getRecruitedStudentTiers(env, currentUser.id) : {};
  const myStudentTier = recruitedStudentTiers[student.uid] ?? null;
  const allStudents = Object.fromEntries(
    Object.entries(rawAllStudents).map(([uid, student]) => [
      uid,
      {
        name: student.name,
      },
    ]),
  );

  const sortedGradings = [...allGradings].sort((a, b) => {
    const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (updatedDiff !== 0) {
      return updatedDiff;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return {
    student: {
      uid: student.uid,
      name: student.name,
      familyName: student.familyName,
      attackType: student.attackType,
      defenseType: student.defenseType,
      role: student.role,
      school: student.school,
      schaleDbId: student.schaleDbId,
      releaseAt: student.releaseAt ? toUtcIso(student.releaseAt) : null,
    },
    recruitments: getStudentRelevantTimelineContents(timelineContents, recruitmentGroupUids, student.uid).map(
      (content) => ({
        uid: content.uid,
        name: content.name,
        since: content.startAt,
        until: content.endAt,
        imageUrl: content.imageUrl ?? null,
      }),
    ),
    tagCounts,
    allGradings: sortedGradings.map((grading) => ({
      ...grading,
      student: {
        uid: student.uid,
        name: student.name,
      },
    })),
    currentUser,
    myStudentTier,
    recruitedStudentTiers,
    allStudents,
    allRaids,
  };
};

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  if (!data) {
    return [{ title: "학생 정보 | 몰루로그" }];
  }

  const { student } = data;
  const studentFullName = formatStudentFullName(student);
  const title = `${studentFullName} - 학생 정보`;
  const description = `블루 아카이브 ${student.name} - 학생의 총력전/대결전 통계 정보, 선생님들의 성능 평가를 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export const ErrorBoundary = createPageErrorBoundary({
  title: "학생부",
  description: "학생들의 통계 정보와 선생님들의 평가를 확인해보세요",
  backward: { title: "학생 목록", to: "/students" },
});

export type StudentDetailPageContext = Awaited<ReturnType<typeof loader>>;

export default function StudentDetailPage() {
  const loaderData = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const { student } = loaderData;

  return (
    <Page
      title="학생부"
      description="학생들의 통계 정보와 선생님들의 평가를 확인해보세요"
      backward={{ title: "학생 목록", to: "/students" }}
      belowTitle={<StudentInfo student={student} />}
      links={
        student.schaleDbId
          ? [
              {
                Icon: ArrowTopRightOnSquareIcon,
                title: "Schale DB",
                description: "스킬, 능력치 등의 구체적인 수치를 확인",
                to: `https://schaledb.com/student/${student.schaleDbId}`,
              },
            ]
          : undefined
      }
      screens={[
        {
          text: "학생 정보",
          description: "각종 통계 분석 정보와 모집 일정",
          Icon: InformationCircleIcon,
          link: `/students/${student.uid}`,
          active: pathname === `/students/${student.uid}`,
        },
        {
          text: "평가",
          description: "선생님들의 평가 의견",
          Icon: ChatBubbleLeftRightIcon,
          link: `/students/${student.uid}/gradings`,
          active: pathname === `/students/${student.uid}/gradings` || pathname === `/students/${student.uid}/grade`,
        },
      ]}
    >
      <Outlet context={loaderData satisfies StudentDetailPageContext} />
    </Page>
  );
}
