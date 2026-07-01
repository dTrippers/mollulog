import { ChatBubbleLeftRightIcon, FunnelIcon, IdentificationIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";
import { MobileMoreTabNoticeBanner, Page } from "~/components/features/layout";
import { createStudentFilterState, getFilteredStudentUids, StudentFilter } from "~/components/features/students";
import { canonicalLink } from "~/lib/seo";
import { getAllStudents } from "~/models/student";

const studentUtilityMenuBannerDismissalStorageKey = "students::dismissed-utility-menu-banner";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const needsStudentList = pathname === "/students";

  if (!needsStudentList) {
    return {
      students: [],
    };
  }

  const env = context.cloudflare.env;
  const allStudents = await getAllStudents(env, true);
  return {
    students: allStudents.sort((a, b) => b.order - a.order),
  };
};

export const meta: MetaFunction = ({ location }) => {
  const title = "학생부 | 몰루로그";
  const description = "블루 아카이브 학생들의 프로필과 통계, 평가 정보를 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export default function StudentsLayout() {
  const { students } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const usesStudentsPageLayout = pathname === "/students" || pathname === "/students/gradings";

  if (!usesStudentsPageLayout) {
    return <Outlet />;
  }

  const studentMap = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
  const [filterState, setFilterState] = useState(() => createStudentFilterState("recent"));
  const filteredUids = useMemo(() => getFilteredStudentUids(students, filterState), [students, filterState]);
  const filteredStudents = useMemo(() => {
    return filteredUids.flatMap((uid) => {
      const student = studentMap.get(uid);
      return student ? [student] : [];
    });
  }, [studentMap, filteredUids]);
  const isStudentsIndex = pathname === "/students";

  return (
    <Page
      title="학생부"
      description="학생들의 프로필과 총력전/대결전 통계, 평가 정보를 확인해보세요"
      belowTitle={
        isStudentsIndex ? (
          <MobileMoreTabNoticeBanner
            dismissStorageKey={studentUtilityMenuBannerDismissalStorageKey}
            message={'유틸리티 메뉴는 "더보기" 탭에서 확인할 수 있어요'}
          />
        ) : undefined
      }
      panels={
        isStudentsIndex
          ? [
              {
                title: "필터 및 정렬",
                Icon: FunnelIcon,
                children: (
                  <StudentFilter
                    students={students}
                    state={filterState}
                    onStateChange={setFilterState}
                    sortBy={["recent", "old", "name"]}
                    useFilter
                    useSearch
                  />
                ),
              },
            ]
          : undefined
      }
      screens={[
        {
          text: "학생 목록",
          description: "프로필 및 통계 정보",
          Icon: IdentificationIcon,
          link: "/students",
          active: pathname === "/students",
        },
        {
          text: "학생 평가 목록",
          description: "최근 작성된 학생 평가",
          Icon: ChatBubbleLeftRightIcon,
          link: "/community?type=student_review",
          active: false,
        },
      ]}
    >
      <Outlet context={{ students: filteredStudents } satisfies StudentsPageContext} />
    </Page>
  );
}

export type StudentsPageContext = {
  students: Awaited<ReturnType<typeof loader>>["students"];
};
