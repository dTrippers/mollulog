import { ChatBubbleLeftRightIcon, FunnelIcon, IdentificationIcon } from "@heroicons/react/24/outline";
import { useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";
import { Page } from "~/components/features/layout";
import { StudentFilter } from "~/components/features/students";
import { getAllStudents } from "~/models/student";

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

export const meta: MetaFunction = () => {
  const title = "학생부 | 몰루로그";
  const description = "블루 아카이브 학생들의 프로필과 통계, 평가 정보를 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
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
  const [filteredUids, setFilteredUids] = useState<string[]>(students.map((student) => student.uid));
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
      panels={
        isStudentsIndex
          ? [
              {
                title: "필터 및 정렬",
                Icon: FunnelIcon,
                children: (
                  <StudentFilter
                    students={students}
                    onFilterChange={setFilteredUids}
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
