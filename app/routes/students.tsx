import {
  AdjustmentsHorizontalIcon,
  ChatBubbleLeftRightIcon,
  FunnelIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { useMemo } from "react";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Outlet, useLoaderData, useLocation, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { DirectoryFilterPanel } from "~/components/v2/features/students/DirectoryFilterPanel";
import { Select } from "~/components/v2/primitives/Select";
import { AsideLinks, MobileActionBar, PageAside, PageHeader, PanelSheet, V2Page } from "~/components/v2/layout";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  filterAndSortStudentDirectory,
  getStudentDirectoryVisibleState,
  studentDirectoryDisplayOptions,
  studentDirectoryGroupOptions,
  type StudentDirectoryFilterState,
  type StudentDirectoryPersonalState,
} from "~/domain/student-directory";
import { getLogger, captureServerError } from "~/lib/observability.server";
import { useTrackGoogleAnalyticsSearch } from "~/lib/google-analytics-hooks";
import { canonicalLink } from "~/lib/seo";
import { getStudentDirectoryStudents } from "~/models/student-directory";
import { loadStudentDirectoryPersonalState } from "~/views/student-directory";
import type { RootOutletContext } from "~/root";
import { readStudentDirectoryFilterStateFromCookie } from "./students._components/student-directory-cookie";
import { useStudentDirectoryFilterState } from "./students._components/use-student-directory-filter-state";

export const STUDENT_FILTER_COOKIE_NAME = "mollulog_students_filter";
export const STUDENT_FILTER_COOKIE_PATH = "/";

// Only the directory page itself renders the student list, so the loader skips it on the other student pages.
function needsStudentDirectory(url: URL) {
  return url.pathname === "/students";
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (!needsStudentDirectory(url)) {
    return {
      students: [],
      listStatus: "loaded" as const,
      filterState: readStudentDirectoryFilterStateFromCookie(
        request.headers.get("Cookie"),
        STUDENT_FILTER_COOKIE_NAME,
        [],
      ),
      personalState: { status: "signed-out" } as StudentDirectoryPersonalState,
    };
  }

  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "students.loader" });
  const reportFailure = (operation: string, error: unknown) => {
    const errorContext = { route: "students.loader", operation };
    logger.error("Failed to load student directory data", error, errorContext);
    captureServerError(error, errorContext);
  };
  const [studentResult, userResult] = await Promise.all([
    getStudentDirectoryStudents(env, true).then(
      (students) => ({ status: "loaded" as const, students }),
      (error: unknown) => {
        reportFailure("student_list", error);
        return { status: "failed" as const, students: [] };
      },
    ),
    getActiveSensei(env, request, ctx).then(
      (user) => ({ status: "loaded" as const, user }),
      (error: unknown) => {
        reportFailure("auth", error);
        return { status: "failed" as const, user: null };
      },
    ),
  ]);
  const students = studentResult.status === "loaded" ? studentResult.students : [];
  const filterState = readStudentDirectoryFilterStateFromCookie(
    request.headers.get("Cookie"),
    STUDENT_FILTER_COOKIE_NAME,
    students,
  );
  let personalState: StudentDirectoryPersonalState;
  if (userResult.status === "failed") {
    personalState = { status: "failed" };
  } else if (userResult.user === null) {
    personalState = { status: "signed-out" };
  } else if (studentResult.status === "failed") {
    personalState = { status: "failed" };
  } else {
    const personalResult = await loadStudentDirectoryPersonalState(env, userResult.user.id, students);
    personalState = personalResult.state;
    if (personalResult.error !== undefined) reportFailure("personal_records", personalResult.error);
  }

  return {
    students,
    listStatus: studentResult.status,
    filterState,
    personalState,
  };
};

// Moving between a student page and the directory keeps this layout mounted, so the loader must run again to load or drop
// the list.
export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, defaultShouldRevalidate }) =>
  needsStudentDirectory(currentUrl) !== needsStudentDirectory(nextUrl) || defaultShouldRevalidate;

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
  const { students, listStatus, filterState: initialState, personalState } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const { currentUsername } = useOutletContext<RootOutletContext>();
  const { showSignIn } = useSignIn();
  const [filterState, setFilterState] = useStudentDirectoryFilterState(
    STUDENT_FILTER_COOKIE_NAME,
    initialState,
    students,
    listStatus === "loaded",
  );
  const visibleState = useMemo(
    () => getStudentDirectoryVisibleState(filterState, personalState.status),
    [filterState, personalState.status],
  );
  const results = useMemo(
    () => filterAndSortStudentDirectory(students, visibleState, personalState),
    [students, visibleState, personalState],
  );
  useTrackGoogleAnalyticsSearch(visibleState.search, "students", results.length);

  if (pathname !== "/students") return <Outlet />;

  const listFailed = listStatus === "failed";
  const recruitedLink = currentUsername
    ? { key: "recruited", title: "모집한 학생", Icon: UserGroupIcon, to: `/@${currentUsername}/students` }
    : { key: "recruited", title: "모집한 학생", Icon: UserGroupIcon, onClick: showSignIn };

  return (
    <V2Page width="wide">
      <PageHeader title="학생부" />
      <Outlet
        context={
          {
            students,
            results,
            listStatus,
            filterState: visibleState,
            setFilterState,
            personalState,
            onRequestSignIn: showSignIn,
          } satisfies StudentsPageContext
        }
      />
      <PageAside>
        <PanelSheet
          key={`student-directory-filter-${listFailed ? "list-failed" : "list-loaded"}`}
          panelId="student-directory-filter"
          title="필터"
          sheetDescription={listFailed ? undefined : `${results.length}명`}
          Icon={FunnelIcon}
          disabled={listFailed}
        >
          <DirectoryFilterPanel
            students={students}
            state={visibleState}
            personalStatus={personalState.status}
            onChange={setFilterState}
            onRequestSignIn={showSignIn}
          />
        </PanelSheet>
        <PanelSheet
          key={`student-directory-display-${listFailed ? "list-failed" : "list-loaded"}`}
          panelId="student-directory-display"
          title="표시 설정"
          Icon={AdjustmentsHorizontalIcon}
          collapsible
          disabled={listFailed}
        >
          <div className="space-y-2">
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-sm text-v2-fg-secondary">표시할 정보</span>
              <Select
                label="학생 카드에 표시할 정보"
                value={visibleState.displayBy}
                options={studentDirectoryDisplayOptions}
                onChange={(displayBy) => setFilterState((current) => ({ ...current, displayBy }))}
              />
            </div>
            <div className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-sm text-v2-fg-secondary">묶어보기</span>
              <Select
                label="학생 묶어보기"
                value={visibleState.groupBy}
                options={studentDirectoryGroupOptions}
                onChange={(groupBy) => setFilterState((current) => ({ ...current, groupBy }))}
              />
            </div>
          </div>
        </PanelSheet>
        <AsideLinks
          items={[
            recruitedLink,
            {
              key: "student-reviews",
              title: "학생 평가 목록",
              Icon: ChatBubbleLeftRightIcon,
              to: "/community?type=student_review",
            },
          ]}
        />
      </PageAside>
      <MobileActionBar
        links={[
          currentUsername
            ? {
                key: "recruited",
                title: "모집한 학생",
                shortTitle: "모집한 학생",
                Icon: UserGroupIcon,
                to: `/@${currentUsername}/students`,
              }
            : {
                key: "recruited",
                title: "모집한 학생",
                shortTitle: "모집한 학생",
                Icon: UserGroupIcon,
                onClick: showSignIn,
              },
          {
            key: "student-reviews",
            title: "학생 평가 목록",
            shortTitle: "평가",
            Icon: ChatBubbleLeftRightIcon,
            to: "/community?type=student_review",
          },
        ]}
        panels={[
          { panelId: "student-directory-filter", title: "필터", Icon: FunnelIcon, disabled: listFailed },
          {
            panelId: "student-directory-display",
            title: "표시",
            shortTitle: "표시",
            Icon: AdjustmentsHorizontalIcon,
            disabled: listFailed,
          },
        ]}
      />
    </V2Page>
  );
}

export type StudentsPageContext = {
  students: Awaited<ReturnType<typeof loader>>["students"];
  results: Awaited<ReturnType<typeof loader>>["students"];
  listStatus: "loaded" | "failed";
  filterState: StudentDirectoryFilterState;
  setFilterState: ReturnType<typeof useStudentDirectoryFilterState>[1];
  personalState: StudentDirectoryPersonalState;
  onRequestSignIn: () => void;
};
