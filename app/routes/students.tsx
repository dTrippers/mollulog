import {
  AdjustmentsHorizontalIcon,
  ChatBubbleLeftRightIcon,
  FunnelIcon,
  IdentificationIcon,
} from "@heroicons/react/24/outline";
import { useMemo } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Outlet, useLoaderData, useLocation } from "react-router";
import { Page } from "~/components/features/layout";
import {
  clearStudentDirectoryDisplaySettings,
  clearStudentFilters,
  getFilteredStudentUids,
  getStudentDirectoryDisplaySettingsSummary,
  hasActiveStudentDirectoryDisplaySettings,
  hasActiveStudentFilters,
  STUDENT_DIRECTORY_DISPLAY_VALUES,
  STUDENT_DIRECTORY_GROUP_VALUES,
  StudentDirectoryDisplaySettings,
  default as StudentFilter,
} from "~/components/features/students/StudentFilter";
import { readStudentFilterStateFromCookie } from "~/components/features/students/student-filter-cookie";
import { usePersistentStudentFilterState } from "~/components/features/students/usePersistentStudentFilterState";
import { Button } from "~/components/primitives";
import { canonicalLink } from "~/lib/seo";
import { getStudentDirectoryStudents } from "~/models/student-directory";

export const STUDENT_FILTER_COOKIE_NAME = "mollulog_students_filter";
export const STUDENT_FILTER_COOKIE_PATH = "/";
export const STUDENT_FILTER_SORTS = ["recent", "old", "name", "tier"] as const;
export const STUDENT_FILTER_GROUPS = STUDENT_DIRECTORY_GROUP_VALUES;
export const STUDENT_FILTER_DISPLAYS = STUDENT_DIRECTORY_DISPLAY_VALUES;

const studentFilterCookieOptions = {
  cookieName: STUDENT_FILTER_COOKIE_NAME,
  cookiePath: STUDENT_FILTER_COOKIE_PATH,
  defaultSort: "recent",
  allowedSorts: STUDENT_FILTER_SORTS,
  defaultGroup: "none",
  allowedGroups: STUDENT_FILTER_GROUPS,
  defaultDisplay: "none",
  allowedDisplays: STUDENT_FILTER_DISPLAYS,
} as const;

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const needsStudentList = pathname === "/students";
  const filterState = readStudentFilterStateFromCookie(request.headers.get("Cookie"), studentFilterCookieOptions);

  if (!needsStudentList) {
    return {
      students: [],
      filterState,
    };
  }

  const env = context.cloudflare.env;
  const allStudents = await getStudentDirectoryStudents(env, true);
  return {
    students: [...allStudents].sort((a, b) => b.order - a.order),
    filterState,
  };
};

export const meta: MetaFunction = ({ location }) => {
  const title = "학생부 | 몰루로그";
  const description = "블루 아카이브 학생들의 프로필, 스킬, 스탯, 성장도별 능력치와 총력전·대결전 통계를 확인해보세요.";
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
  const { filterState: initialFilterState, students } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const usesStudentsPageLayout = pathname === "/students" || pathname === "/students/gradings";
  const studentMap = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
  const [filterState, setFilterState] = usePersistentStudentFilterState({
    ...studentFilterCookieOptions,
    initialState: initialFilterState,
  });
  const filteredUids = useMemo(() => getFilteredStudentUids(students, filterState), [students, filterState]);
  const filteredStudents = useMemo(() => {
    return filteredUids.flatMap((uid) => {
      const student = studentMap.get(uid);
      return student ? [student] : [];
    });
  }, [studentMap, filteredUids]);
  const isStudentsIndex = pathname === "/students";

  if (!usesStudentsPageLayout) {
    return <Outlet />;
  }

  return (
    <Page
      title="학생부"
      description="학생들의 프로필과 총력전/대결전 통계, 평가 정보를 확인해보세요"
      panels={
        isStudentsIndex
          ? [
              {
                title: "필터 및 정렬",
                description: `${students.length}명 중 ${filteredStudents.length}명 표시 중`,
                Icon: FunnelIcon,
                headerAction: hasActiveStudentFilters(filterState) ? (
                  <Button
                    text="필터 해제"
                    size="xs"
                    variant="danger-subtle"
                    onClick={() => setFilterState(clearStudentFilters)}
                  />
                ) : undefined,
                children: (
                  <StudentFilter
                    students={students}
                    state={filterState}
                    onStateChange={setFilterState}
                    sortBy={[...STUDENT_FILTER_SORTS]}
                    useFilter
                    useSearch
                    directory
                  />
                ),
              },
              {
                title: "표시 설정",
                description: getStudentDirectoryDisplaySettingsSummary(filterState),
                Icon: AdjustmentsHorizontalIcon,
                headerAction: hasActiveStudentDirectoryDisplaySettings(filterState) ? (
                  <Button
                    text="초기화"
                    size="xs"
                    variant="danger-subtle"
                    onClick={() => setFilterState(clearStudentDirectoryDisplaySettings)}
                  />
                ) : undefined,
                children: <StudentDirectoryDisplaySettings state={filterState} onStateChange={setFilterState} />,
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
      <Outlet context={{ students: filteredStudents, filterState } satisfies StudentsPageContext} />
    </Page>
  );
}

export type StudentsPageContext = {
  students: Awaited<ReturnType<typeof loader>>["students"];
  filterState: Awaited<ReturnType<typeof loader>>["filterState"];
};
