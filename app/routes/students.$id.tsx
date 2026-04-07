import { ArrowTopRightOnSquareIcon, ChatBubbleLeftRightIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, isRouteErrorResponse, useLoaderData, useLocation, useRouteError } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { ErrorPage, Page } from "~/components/features/layout";
import { StudentInfo } from "~/components/features/students";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { getStudentGradingsByStudentWithUsers } from "~/models/student-grading";
import { getTagCountsByStudent } from "~/models/student-grading-tag";
import { getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content";
import { RaidRepository } from "~/repositories";

const studentDetailQuery = graphql(`
  query StudentDetail($uid: String!) {
    student(uid: $uid) {
      name uid attackType defenseType role school schaleDbId
      recruitments {
        since rerun
        recruitmentGroup { uid startAt endAt }
      }
    }
  }
`);

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw new Response("Not Found", { status: 404 });
  }
  const { env } = context.cloudflare;
  const raidRepository = new RaidRepository(env);

  const { data, error } = await runQuery(studentDetailQuery, { uid });
  let errorMessage: string | null = null;
  if (error || !data) {
    console.error(error);
    errorMessage = "학생 정보를 가져오는 중 오류가 발생했어요";
  } else if (!data.student) {
    errorMessage = "학생 정보를 찾을 수 없어요";
  }

  if (errorMessage) {
    throw new Response(JSON.stringify({ error: { message: errorMessage } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const student = data?.student;
  if (!student) {
    throw new Response(JSON.stringify({ error: { message: "학생 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const recruitmentGroupUids = student.recruitments.map(
    (recruitment: { recruitmentGroup: { uid: string } }) => recruitment.recruitmentGroup.uid,
  );
  const timelineContents = await getTimelineContentsByRecruitmentGroupUids(env, recruitmentGroupUids);
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  const tagCounts = await getTagCountsByStudent(env, uid);
  const allGradings = await getStudentGradingsByStudentWithUsers(env, uid, true);
  const allRaids = await raidRepository.getAll();

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
      attackType: student.attackType,
      defenseType: student.defenseType,
      role: student.role,
      school: student.school,
      schaleDbId: student.schaleDbId,
    },
    recruitments: timelineContents.map((content) => ({
      uid: content.uid,
      name: content.name,
      since: content.startAt,
      until: content.endAt,
      imageUrl: content.imageUrl ?? null,
    })),
    tagCounts,
    allGradings: sortedGradings.map((grading) => ({
      ...grading,
      student: {
        uid: student.uid,
        name: student.name,
      },
    })),
    currentUser,
    allRaids,
  };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: "학생 정보 | 몰루로그" }];
  }

  const { student } = data;
  const title = `${student.name} - 학생 정보`;
  const description = `블루 아카이브 ${student.name} - 학생의 총력전/대결전 통계 정보, 선생님들의 성능 평가를 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export const ErrorBoundary = () => {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return <ErrorPage message={error.data.error.message} />;
  }
  return <ErrorPage />;
};

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
                title: "샬레DB",
                description: "스킬/스탯/무기 등 상세 정보 확인",
                to: `https://schaledb.com/student/${student.schaleDbId}`,
              },
            ]
          : undefined
      }
      screens={[
        {
          text: "기본 정보",
          description: "통계 정보, 모집 일정",
          Icon: InformationCircleIcon,
          link: `/students/${student.uid}`,
          active: pathname === `/students/${student.uid}`,
        },
        {
          text: "학생 평가",
          description: "평가 목록 및 태그 통계",
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
