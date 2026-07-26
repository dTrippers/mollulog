import {
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  InformationCircleIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";
import { createPageErrorBoundary, Page } from "~/components/features/layout";
import { StudentInfo } from "~/components/features/students";
import { isStudentNotFoundError } from "~/lib/baql/errors";
import { toUtcIso } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { canonicalLink } from "~/lib/seo";
import { formatStudentFullName, getStudentHeader } from "~/models/student";
import type { TimelineContent } from "~/models/timeline-content";
import { findEventsForRecruitmentStudent, groupTimelineContentsByRecruitmentGroupUid } from "~/models/timeline-content";

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

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, {
    route: "students.$id.loader",
    studentUid: uid,
  });

  let student: Awaited<ReturnType<typeof getStudentHeader>>;
  try {
    student = await getStudentHeader(env, uid);
  } catch (error) {
    logger.error("Failed to load student header", error);
    if (isStudentNotFoundError(error)) {
      throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
    }
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }

  if (student === undefined) {
    logger.error("Failed to load student header without response data");
    throw routeError(500, "student.load_failed", "학생 정보를 불러오지 못했어요");
  }
  if (!student) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }

  return {
    student: {
      ...student,
      releaseAt: student.releaseAt ? toUtcIso(student.releaseAt) : null,
    },
  };
};

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  if (!data) {
    return [{ title: "학생 정보 | 몰루로그" }];
  }

  const { student } = data;
  const studentFullName = formatStudentFullName(student);
  const title = `${studentFullName} - 학생 정보`;
  const description = `블루 아카이브 ${student.name}의 프로필, 스킬, 성장도별 능력치와 총력전·대결전 통계 및 평가를 확인해보세요.`;
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
      description="학생들의 프로필, 통계 정보와 선생님들의 평가를 확인해보세요"
      backward={{ title: "학생 목록", to: "/students" }}
      belowTitle={<StudentInfo student={student} />}
      links={[
        {
          Icon: VideoCameraIcon,
          title: "영상 인식기",
          description: "게임 내 학생 리스트 화면을 녹화하여 학생 정보를 가져올 수 있어요",
          to: "/scanner/student",
        },
      ]}
      screens={[
        {
          text: "학생 정보",
          description: "학생 프로필, 스킬, 스탯 확인 및 성장도 관리",
          Icon: InformationCircleIcon,
          link: `/students/${student.uid}`,
          active: pathname === `/students/${student.uid}`,
        },
        {
          text: "편성/통계",
          description: "총력전/대결전 통계 상세 분석",
          Icon: ChartBarIcon,
          link: `/students/${student.uid}/statistics`,
          active: pathname === `/students/${student.uid}/statistics`,
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
