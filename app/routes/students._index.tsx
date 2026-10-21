import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useLocation, useNavigationType, useOutletContext, useRevalidator } from "react-router";
import { DirectoryCard } from "~/components/v2/features/students/DirectoryCardLabel";
import { DirectoryGroupHeader } from "~/components/v2/features/students/DirectoryGroupHeader";
import { DirectoryViewerFailureNotice } from "~/components/v2/features/students/DirectoryViewerFailureNotice";
import { LoadFailureState } from "~/components/v2/features/students/LoadFailureState";
import { ResultSummary } from "~/components/v2/features/students/ResultSummary";
import { PageMain, PageToolbar } from "~/components/v2/layout";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { SortControl } from "~/components/v2/primitives/SortControl";
import {
  groupStudentDirectoryStudents,
  type StudentDirectorySort,
  type StudentDirectorySortDirection,
} from "~/domain/student-directory";
import {
  getStudentDirectoryScrollContainer,
  getStudentDirectorySessionStorage,
  readStudentDirectoryScrollPosition,
  saveStudentDirectoryScrollPosition,
} from "./students._components/student-directory-scroll-state";
import type { StudentsPageContext } from "./students";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export default function Students() {
  const { results, students, listStatus, filterState, personalState, setFilterState, onRequestSignIn } =
    useOutletContext<StudentsPageContext>();
  const revalidator = useRevalidator();
  const location = useLocation();
  const navigationType = useNavigationType();
  useIsomorphicLayoutEffect(() => {
    if (navigationType !== "POP") {
      return;
    }
    const scrollTop = readStudentDirectoryScrollPosition(getStudentDirectorySessionStorage(), location.key);
    const container = getStudentDirectoryScrollContainer();
    if (scrollTop !== null && container) {
      container.scrollTop = scrollTop;
    }
  }, [location.key, navigationType]);
  const saveScrollPosition = () => {
    saveStudentDirectoryScrollPosition(
      getStudentDirectorySessionStorage(),
      location.key,
      getStudentDirectoryScrollContainer()?.scrollTop ?? 0,
    );
  };
  const groups = useMemo(
    () => groupStudentDirectoryStudents(results, filterState.groupBy),
    [filterState.groupBy, results],
  );
  const updateSearch = useCallback(
    (search: string) => setFilterState((current) => ({ ...current, search })),
    [setFilterState],
  );
  const updateSort = useCallback(
    (sort: StudentDirectorySort, direction: StudentDirectorySortDirection) =>
      setFilterState((current) => ({ ...current, sort, direction })),
    [setFilterState],
  );
  const listFailed = listStatus === "failed";

  return (
    <>
      <PageToolbar>
        <div data-student-directory-toolbar className="flex min-w-0 items-center gap-2 px-4 sm:px-0">
          <SearchInput
            value={filterState.search}
            onChange={updateSearch}
            disabled={listFailed}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
          />
          <div className="ml-auto shrink-0">
            <SortControl
              sort={filterState.sort}
              direction={filterState.direction}
              personalStatus={personalState.status}
              onChange={updateSort}
              onRequestSignIn={onRequestSignIn}
              disabled={listFailed}
            />
          </div>
        </div>
      </PageToolbar>
      <PageMain>
        <div onClickCapture={saveScrollPosition}>
          {listFailed ? (
            <LoadFailureState onRetry={() => revalidator.revalidate()} />
          ) : (
            <div className="space-y-4">
              {personalState.status === "failed" ? (
                <DirectoryViewerFailureNotice onRetry={() => revalidator.revalidate()} />
              ) : null}
              <ResultSummary students={students} state={filterState} count={results.length} onChange={setFilterState} />
              {results.length === 0 ? (
                <p className="text-sm text-v2-fg-secondary">조건에 맞는 학생이 없어요</p>
              ) : (
                groups.map((group) => (
                  <section key={group.key} aria-label={group.label ?? "학생 목록"} className="space-y-2">
                    {group.label ? <DirectoryGroupHeader title={group.label} count={group.students.length} /> : null}
                    <div className="grid grid-cols-6 gap-x-2 gap-y-4 sm:grid-cols-8 sm:gap-x-3">
                      {group.students.map((student) => (
                        <DirectoryCard key={student.uid} student={student} state={filterState} personal={personalState} />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}
        </div>
      </PageMain>
    </>
  );
}
