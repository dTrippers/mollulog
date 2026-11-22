import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type SubmitTarget, useFetcher, useRevalidator } from "react-router";
import { PageMain } from "~/components/v2/layout/PageMain";
import { PageToolbar } from "~/components/v2/layout/PageToolbar";
import { SaveToast } from "~/components/v2/primitives/SaveToast";
import { SegmentedControl } from "~/components/v2/primitives/SegmentedControl";
import { useNumberInputFlowNavigation } from "~/components/v2/primitives/use-number-input-flow-navigation";
import {
  type GrowthSortOrder,
  moveGrowthStudent,
  placeGrowthStudent,
  sortGrowthStudents,
} from "~/domain/growth-planner";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { cn } from "~/lib/utils";
import { GrowthAddStudent } from "./GrowthAddStudent";
import {
  columnsStyle,
  type GrowthReorderControls,
  GrowthStudentRow,
  getCellWidthRem,
  STACKED_LABEL_COLUMN_REM,
  TABLE_LABEL_COLUMN_REM,
  TABLE_STUDENT_COLUMN_REM,
} from "./GrowthStudentRow";
import GrowthViewSettingsPopover from "./GrowthViewSettingsPopover";
import { cellKey, cellLabel, GROWTH_GROUPS, GROWTH_TABS, type GrowthTab, getGrowthGroup } from "./growth-fields";
import { useGrowthViewSettings } from "./growth-view-settings";
import type { GrowthActionResult, GrowthAvailableStudent, GrowthStudent } from "./types";
import { GROWTH_ACTION_SUBMIT_OPTIONS } from "./use-growth-row";

const EMPTY_MESSAGE = "상단의 학생 추가 버튼으로 성장 목표를 관리할 학생을 등록해주세요.";

type GrowthTableProps = {
  students: GrowthStudent[];
  availableStudents: GrowthAvailableStudent[];
  onStudentUpdate: (student: GrowthStudent) => void;
  writeMode: "legacy" | "nullable";
  stacked: boolean;
  sortOrder: GrowthSortOrder;
  // The account had no stored sort choice when the page loaded.
  sortOrderStored: boolean;
  onPositionsChange: (positions: Record<string, number | null>) => void;
};

type PageSave = { kind: "sort"; sortOrder: GrowthSortOrder } | { kind: "order"; orderedUids: string[] };

function pageSaveBody(save: PageSave): SubmitTarget {
  if (save.kind === "sort") return { _intent: "sort", sortOrder: save.sortOrder };
  return { _intent: "reorder", orderedStudentUids: save.orderedUids };
}

function isFailure(result: GrowthActionResult | undefined): result is Extract<GrowthActionResult, { error: string }> {
  return Boolean(result && "error" in result);
}

export default function GrowthTable({
  students,
  availableStudents,
  onStudentUpdate,
  writeMode,
  stacked,
  sortOrder: initialSortOrder,
  sortOrderStored,
  onPositionsChange,
}: GrowthTableProps) {
  const [viewSettings, setViewSettings, legacySortOrder, dropLegacySortOrder] = useGrowthViewSettings();
  const showSteps = viewSettings.showNumberInputShortcuts;
  const [sortOrder, setSortOrder] = useState(initialSortOrder);
  const [activeTabKey, setActiveTabKey] = useState<GrowthTab["key"]>("basic");
  const activeTab = GROWTH_TABS.find((tab) => tab.key === activeTabKey) ?? GROWTH_TABS[0];
  // Tab moves between one student's values, and between students it passes that student's buttons (handle, ↑/↓, ⋯,
  // 재화), so they stay reachable by keyboard.
  const { getInputProps } = useNumberInputFlowNavigation({
    tabMovesBetweenInputs: true,
    tabScopeAttribute: "data-growth-student",
  });
  const flowProps = useCallback(() => getInputProps(), [getInputProps]);

  // Autosave status of the rows, for the page's "저장 중..." toast.
  const [savingRows, setSavingRows] = useState<ReadonlySet<string>>(() => new Set());
  const onSavingChange = useCallback((uid: string, saving: boolean) => {
    setSavingRows((current) => {
      if (current.has(uid) === saving) return current;
      const next = new Set(current);
      if (saving) next.add(uid);
      else next.delete(uid);
      return next;
    });
  }, []);

  // Sort choice and manual order are saved per account. One save runs at a time, and a change made meanwhile waits
  // as the latest of its kind, so an earlier order can never land after a later one and a sort change does not cancel
  // an order save. A failed save keeps the screen as chosen and offers a retry; a failure of one kind does not hide the
  // other.
  const pageFetcher = useFetcher<GrowthActionResult>();
  const addFetcher = useFetcher<GrowthActionResult>();
  const revalidator = useRevalidator();
  const inFlightRef = useRef<{ save: PageSave; started: boolean; done: Promise<void> } | null>(null);
  const queuedRef = useRef<Partial<Record<PageSave["kind"], PageSave>>>({});
  const failedRef = useRef<Partial<Record<PageSave["kind"], PageSave>>>({});
  // The positions before the first order change the server has not confirmed, restored when it rejects the order.
  const confirmedPositionsRef = useRef<Record<string, number | null> | null>(null);
  const [pageSaveFailed, setPageSaveFailed] = useState<"retryable" | "final" | null>(null);

  const sendNextPageSave = useCallback(() => {
    if (inFlightRef.current) return;
    const next = queuedRef.current.order ?? queuedRef.current.sort;
    if (!next) return;
    delete queuedRef.current[next.kind];
    inFlightRef.current = {
      save: next,
      started: false,
      done: pageFetcher.submit(pageSaveBody(next), GROWTH_ACTION_SUBMIT_OPTIONS),
    };
  }, [pageFetcher]);

  // Leaving the page does not drop a change that waits behind a save in flight: it goes out after that save answers.
  const pageFetcherRef = useRef(pageFetcher);
  pageFetcherRef.current = pageFetcher;
  useEffect(
    () => () => {
      const waiting = [queuedRef.current.order, queuedRef.current.sort].filter((save) => save !== undefined);
      if (waiting.length === 0) return;
      let chain = inFlightRef.current?.done ?? Promise.resolve();
      for (const save of waiting) {
        chain = chain.then(() => pageFetcherRef.current.submit(pageSaveBody(save), GROWTH_ACTION_SUBMIT_OPTIONS));
      }
    },
    [],
  );

  const submitPageSave = useCallback(
    (save: PageSave) => {
      queuedRef.current[save.kind] = save;
      delete failedRef.current[save.kind];
      setPageSaveFailed(Object.keys(failedRef.current).length > 0 ? "retryable" : null);
      sendNextPageSave();
    },
    [sendNextPageSave],
  );

  useEffect(() => {
    const inFlight = inFlightRef.current;
    if (!inFlight) return;
    if (pageFetcher.state !== "idle") {
      inFlight.started = true;
      return;
    }
    // The fetcher is still idle right after the submit; its answer comes after it has been busy.
    if (!inFlight.started) return;
    inFlightRef.current = null;
    const { save } = inFlight;
    const result = pageFetcher.data;
    if (!isFailure(result)) {
      delete failedRef.current[save.kind];
      // The account now holds a sort choice, so the one this device kept before is no longer needed.
      if (save.kind === "sort") dropLegacySortOrder();
      if (save.kind === "order") {
        // A rejected later order goes back to this one, the order the server now holds.
        confirmedPositionsRef.current = queuedRef.current.order
          ? Object.fromEntries(save.orderedUids.map((uid, index) => [uid, index]))
          : null;
        trackGoogleAnalyticsEvent("growth_plan_changed", { action: "reorder" });
      }
      setPageSaveFailed(Object.keys(failedRef.current).length > 0 ? "retryable" : null);
    } else if (result.retryable) {
      // A newer change of the same kind is already waiting and will be sent instead.
      if (!queuedRef.current[save.kind]) failedRef.current[save.kind] = save;
      setPageSaveFailed(Object.keys(failedRef.current).length > 0 ? "retryable" : null);
    } else {
      // The order no longer matches the planner, such as after another tab added a student: show the stored state.
      if (save.kind === "order") {
        delete queuedRef.current.order;
        delete failedRef.current.order;
        if (confirmedPositionsRef.current) onPositionsChange(confirmedPositionsRef.current);
        confirmedPositionsRef.current = null;
      }
      // A retryable failure of the other kind keeps its retry.
      setPageSaveFailed(Object.keys(failedRef.current).length > 0 ? "retryable" : "final");
      revalidator.revalidate();
    }
    sendNextPageSave();
  }, [pageFetcher.state, pageFetcher.data, onPositionsChange, revalidator, sendNextPageSave, dropLegacySortOrder]);

  // A sort chosen on this device before the choice moved to the account carries over once.
  const carriedLegacySortRef = useRef(false);
  useEffect(() => {
    if (carriedLegacySortRef.current || legacySortOrder === undefined) return;
    carriedLegacySortRef.current = true;
    if (sortOrderStored || legacySortOrder === null || legacySortOrder === initialSortOrder) {
      dropLegacySortOrder();
      return;
    }
    setSortOrder(legacySortOrder);
    submitPageSave({ kind: "sort", sortOrder: legacySortOrder });
  }, [legacySortOrder, sortOrderStored, initialSortOrder, submitPageSave, dropLegacySortOrder]);

  const changeSortOrder = (next: GrowthSortOrder) => {
    if (next === sortOrder) return;
    setSortOrder(next);
    submitPageSave({ kind: "sort", sortOrder: next });
  };

  const sortedStudents = useMemo(() => sortGrowthStudents(students, sortOrder), [students, sortOrder]);
  const manual = sortOrder === "manual" && students.length > 1;

  // Manual order: the drag shows the new order while the pointer moves and saves it on release.
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingUid, setDraggingUid] = useState<string | null>(null);
  const orderedUids = useMemo(() => sortedStudents.map((student) => student.uid), [sortedStudents]);
  const displayUids = dragOrder ?? orderedUids;
  const studentsByUid = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
  const displayStudents = displayUids.flatMap((uid) => studentsByUid.get(uid) ?? []);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const commitOrder = useCallback(
    (nextOrder: string[]) => {
      if (nextOrder.join("\n") === orderedUids.join("\n")) return;
      confirmedPositionsRef.current ??= Object.fromEntries(
        students.map((student) => [student.uid, student.plannerPosition]),
      );
      onPositionsChange(Object.fromEntries(nextOrder.map((uid, index) => [uid, index])));
      submitPageSave({ kind: "order", orderedUids: nextOrder });
    },
    [orderedUids, students, onPositionsChange, submitPageSave],
  );

  const startDrag = useCallback(
    (uid: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const { pointerId } = event;
      let current = orderedUids;
      setDraggingUid(uid);
      setDragOrder(current);
      const scroller = stacked ? document.querySelector<HTMLElement>(".mllg-content-area") : frameRef.current;

      // The listeners sit on the window: moving the dragged rows in the DOM releases a pointer capture on the handle, and
      // the release would then never reach it.
      const handleMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const container = containerRef.current;
        if (!container) return;
        // Each student's rows form one block. The dragged block goes where the pointer is among the others' middles.
        const bounds = new Map<string, { top: number; bottom: number }>();
        for (const element of container.querySelectorAll<HTMLElement>("[data-growth-student]")) {
          const key = element.dataset.growthStudent;
          if (!key) continue;
          const rect = element.getBoundingClientRect();
          const bound = bounds.get(key);
          bounds.set(
            key,
            bound ? { top: Math.min(bound.top, rect.top), bottom: Math.max(bound.bottom, rect.bottom) } : rect,
          );
        }
        const others = current.filter((candidate) => candidate !== uid);
        const targetIndex = others.filter((candidate) => {
          const bound = bounds.get(candidate);
          return bound ? (bound.top + bound.bottom) / 2 < moveEvent.clientY : false;
        }).length;
        const next = placeGrowthStudent(current, uid, targetIndex);
        if (next.join("\n") !== current.join("\n")) {
          current = next;
          setDragOrder(next);
        }
        if (scroller) {
          const rect = stacked ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
          if (moveEvent.clientY < rect.top + 48) scroller.scrollTop -= 12;
          else if (moveEvent.clientY > rect.bottom - 48) scroller.scrollTop += 12;
        }
      };
      const finish = (endEvent: PointerEvent) => {
        if (endEvent.pointerId !== pointerId) return;
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        setDraggingUid(null);
        setDragOrder(null);
        commitOrder(current);
      };
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
    },
    [orderedUids, stacked, commitOrder],
  );

  const reorderControls = (uid: string, index: number): GrowthReorderControls | null =>
    manual
      ? {
          canMoveUp: index > 0,
          canMoveDown: index < displayUids.length - 1,
          onMove: (offset) => commitOrder(moveGrowthStudent(orderedUids, uid, offset)),
          onHandlePointerDown: (event) => startDrag(uid, event),
          dragging: draggingUid === uid,
        }
      : null;

  // The sideways-sticky message and resource rows need the width of the scrolling frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the frame mounts only in the table layout, so the observer attaches again when the layout switches.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const update = () => frame.style.setProperty("--growth-frame-width", `${frame.clientWidth}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [stacked]);

  const addStudent = (studentUid: string) => {
    addFetcher.submit({ _intent: "add", studentUid }, GROWTH_ACTION_SUBMIT_OPTIONS);
  };
  const addTrackedRef = useRef<unknown>(null);
  useEffect(() => {
    if (addFetcher.state !== "idle" || !addFetcher.data || addFetcher.data === addTrackedRef.current) return;
    addTrackedRef.current = addFetcher.data;
    if (!isFailure(addFetcher.data)) trackGoogleAnalyticsEvent("growth_plan_changed", { action: "add" });
  }, [addFetcher.state, addFetcher.data]);
  const addFailed = addFetcher.state === "idle" && isFailure(addFetcher.data);

  const saving = savingRows.size > 0 || pageFetcher.state !== "idle" || addFetcher.state !== "idle";
  const retryPageSave = () => {
    for (const save of Object.values(failedRef.current)) submitPageSave(save);
  };

  const rows = displayStudents.map((student, index) => (
    <GrowthStudentRow
      key={student.uid}
      student={student}
      writeMode={writeMode}
      onStudentUpdate={onStudentUpdate}
      onSavingChange={onSavingChange}
      layout={stacked ? "stacked" : "table"}
      showSteps={showSteps}
      tab={activeTab}
      flowProps={flowProps}
      reorder={reorderControls(student.uid, index)}
      last={index === displayStudents.length - 1}
    />
  ));

  return (
    <>
      <PageToolbar>
        <div className={cn("flex flex-col gap-2", stacked && "bg-v2-canvas px-[var(--v2-gutter)] pb-2")}>
          <div className="flex flex-wrap items-center gap-2">
            <GrowthAddStudent
              availableStudents={availableStudents}
              adding={addFetcher.state !== "idle"}
              onAdd={addStudent}
            />
            <GrowthViewSettingsPopover
              studentCount={students.length}
              sortOrder={sortOrder}
              showNumberInputShortcuts={showSteps}
              onSortOrderChange={changeSortOrder}
              onShowNumberInputShortcutsChange={(show) =>
                setViewSettings((current) => ({ ...current, showNumberInputShortcuts: show }))
              }
            />
            {addFailed ? <span className="text-xs text-v2-danger">학생을 추가하지 못했어요</span> : null}
          </div>
          {stacked ? (
            <SegmentedControl
              label="성장 상태 묶음"
              options={GROWTH_TABS.map((tab) => ({ value: tab.key, label: tab.label }))}
              value={activeTab.key}
              onChange={setActiveTabKey}
              className="flex w-full [&>label]:flex-1"
            />
          ) : null}
        </div>
      </PageToolbar>
      <PageMain>
        <p id="growth-reorder-hint" className="sr-only">
          위아래 방향키로 순서를 옮길 수 있어요.
        </p>
        <div ref={containerRef}>
          {stacked ? (
            <StackedList tab={activeTab} showSteps={showSteps} empty={displayStudents.length === 0}>
              {rows}
            </StackedList>
          ) : (
            // The surface ends where the columns end; a wider frame would spread its extra width into the field cells.
            <div
              ref={frameRef}
              className="max-h-[calc(100dvh-9rem)] w-fit max-w-full overflow-auto rounded-lg bg-v2-surface"
            >
              <table aria-label="학생 성장 목표" className="w-max border-separate border-spacing-0 text-sm">
                <TableHead showSteps={showSteps} manual={manual} />
                <tbody>
                  {displayStudents.length === 0 ? (
                    <tr>
                      <td colSpan={3 + GROWTH_GROUPS.length} className="px-4 py-12 text-sm text-v2-fg-secondary">
                        <span className="sticky left-4 block max-w-[calc(var(--growth-frame-width,100vw)-2rem)] text-center">
                          {EMPTY_MESSAGE}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    rows
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PageMain>
      <SaveToast
        saving={saving}
        failed={pageSaveFailed !== null}
        onRetry={pageSaveFailed === "retryable" ? retryPageSave : undefined}
        aboveActionBar={stacked}
      />
    </>
  );
}

function TableHead({ showSteps, manual }: { showSteps: boolean; manual: boolean }) {
  const studentColumnRem = manual ? TABLE_STUDENT_COLUMN_REM.manual : TABLE_STUDENT_COLUMN_REM.default;
  const headerCell = "sticky z-20 bg-v2-surface text-xs font-semibold text-v2-fg-secondary";
  return (
    <thead>
      <tr>
        <th
          scope="col"
          colSpan={2}
          rowSpan={2}
          style={{ width: `${studentColumnRem + TABLE_LABEL_COLUMN_REM}rem` }}
          className={cn(headerCell, "top-0 left-0 z-30 border-b border-v2-divider pb-1.5 pl-3 text-left align-bottom")}
        >
          학생
        </th>
        <td className={cn(headerCell, "top-0 h-9")} />
        {GROWTH_GROUPS.map((group) => (
          <th key={group.key} scope="colgroup" className={cn(headerCell, "top-0 h-9 px-1.5 text-left align-bottom")}>
            <span className={cn("block pb-1 leading-4", !group.labelHidden && "border-b border-v2-divider")}>
              {group.labelHidden ? <span className="sr-only">{group.label}</span> : group.label}
              {group.labelHidden ? <span aria-hidden="true">&nbsp;</span> : null}
            </span>
          </th>
        ))}
      </tr>
      <tr>
        <th
          scope="col"
          className={cn(headerCell, "top-9 h-7 border-b border-v2-divider px-1.5 font-medium text-v2-fg-tertiary")}
        >
          일괄 적용
        </th>
        {GROWTH_GROUPS.map((group) => (
          <th
            key={group.key}
            scope="colgroup"
            className={cn(headerCell, "top-9 h-7 border-b border-v2-divider px-1.5 font-medium text-v2-fg-tertiary")}
          >
            <span className="grid text-center" style={columnsStyle(group.cells, showSteps)}>
              {group.cells.map((cell) => (
                <span key={cellKey(cell)} className="truncate">
                  {cellLabel(cell)}
                </span>
              ))}
            </span>
          </th>
        ))}
      </tr>
    </thead>
  );
}

function StackedList({
  tab,
  showSteps,
  empty,
  children,
}: {
  tab: GrowthTab;
  showSteps: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  const groups = tab.groups.map(getGrowthGroup);
  return (
    <div className="rounded-lg bg-v2-surface px-v2-block-p">
      {!showSteps && !empty ? (
        // The column names of the boxes, once above the list, as in the profile's stacked table. The row label's
        // space wraps away at the width where a row's label goes above its fields.
        <div
          aria-hidden="true"
          className="sticky z-10 flex flex-wrap gap-x-2 bg-v2-surface pt-2 pb-1 text-xs text-v2-fg-tertiary"
          style={{ top: "var(--v2-toolbar-sticky-height, 0px)" }}
        >
          <span className="shrink-0" style={{ width: `${STACKED_LABEL_COLUMN_REM}rem` }} />
          <span className="flex shrink-0 gap-2">
            {groups.map((group) => (
              // 1px each side matches the field box border, so a name sits over its field and both wrap at one width.
              <span key={group.key} className="grid px-px text-center" style={columnsStyle(group.cells, false)}>
                {group.cells.map((cell) => (
                  <span
                    key={cellKey(cell)}
                    className="truncate"
                    style={{ width: `${getCellWidthRem(cell, false)}rem` }}
                  >
                    {cellLabel(cell)}
                  </span>
                ))}
              </span>
            ))}
          </span>
        </div>
      ) : null}
      {empty ? <p className="py-12 text-center text-sm text-v2-fg-secondary">{EMPTY_MESSAGE}</p> : children}
    </div>
  );
}
