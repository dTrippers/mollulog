import { ChevronRightIcon, ExclamationCircleIcon } from "@heroicons/react/16/solid";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";

// The name that identifies one student in an accessible name: with the variant, so 아루 and 아루(드레스) differ.
function fullStudentName(rawName: string): string {
  const { name, variant } = splitVisibleStudentName(rawName);
  return variant ? `${name}(${variant})` : name;
}

import { TierInput } from "~/components/v2/features/students/TierInput";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { Popover } from "~/components/v2/primitives/Popover";
import {
  type NumberInputFlowNavigationInputProps,
  useNumberInputFlowNavigation,
} from "~/components/v2/primitives/use-number-input-flow-navigation";
import {
  isStudentGrowthFieldApplicable,
  STUDENT_GROWTH_EDIT_RANGES,
  type StudentGrowthEditError,
  type StudentGrowthEditField,
  type StudentGrowthEditValues,
} from "~/domain/student-growth-edit";
import { cn } from "~/lib/utils";
import { equipmentImageUrl } from "~/models/assets";
import {
  type GrowthBaseline,
  type GrowthDraft,
  type GrowthRow,
  type GrowthRowErrors,
  getBaseline,
  getEffectiveValues,
} from "./growth-edit-state";
import {
  EDIT_GROUPS,
  EDIT_TABS,
  GROWTH_ROW_LABEL_WIDTH_REM,
  type GrowthGroup,
  type GrowthWidthMode,
  getGrowthCellWidthRem,
  VIEW_GROUPS,
  VIEW_TABS,
} from "./growth-layout";
import { TierMark } from "./TierMark";

export type GrowthTableMode = "view" | "edit";

export type GrowthTableProps = {
  rows: readonly GrowthRow[];
  mode: GrowthTableMode;
  // The stacked layout shows one group at a time, with group tabs above the table.
  stacked: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  draft: GrowthDraft;
  baseline: GrowthBaseline;
  errors: Record<string, GrowthRowErrors>;
  // The value another screen stored since the table loaded, for the cells that collide with an edit.
  conflicts: Record<string, Partial<Record<StudentGrowthEditField, number | null>>>;
  disabled: boolean;
  onValueChange: (uid: string, field: StudentGrowthEditField, value: number | null) => void;
  // The row's end link, in the read-only table.
  getDetailHref: (uid: string) => string;
};

const STUDENT_COLUMN_REM = { desktop: 11, compact: 6.25, stacked: 6.25 } as const;

const segmentClassName =
  "rounded-none border-0 bg-transparent outline-offset-[-2px] focus-within:outline-offset-[-2px]";

// The offset a screen's own sticky bar needs to sit below the page's sticky screen tabs on stacked layouts.
function useStickyToolbarOffset(enabled: boolean): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setOffset(0);
      return;
    }
    const toolbar = document.querySelector<HTMLElement>('.v2-toolbar[data-stacked-only="true"]');
    if (!toolbar) {
      setOffset(0);
      return;
    }
    const update = () => setOffset(Math.round(toolbar.getBoundingClientRect().height));
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(toolbar);
    return () => observer?.disconnect();
  }, [enabled]);
  return offset;
}

// The column names stick as separate cells, so the bottom edge of the sticky area is the lowest header cell, not the
// bottom of the thead element, which scrolls away with the rows.
function getStickyHeadBottom(head: HTMLElement): number {
  const cells = Array.from(head.querySelectorAll<HTMLElement>("th"));
  return cells.reduce((bottom, cell) => Math.max(bottom, cell.getBoundingClientRect().bottom), 0);
}

function widthStyle(rem: number): CSSProperties {
  return { width: `${rem}rem` };
}

// "fill" stretches the columns over the remaining width, for the read-only table on a phone where one group is shown.
function columnsStyle(group: GrowthGroup, widthMode: GrowthWidthMode, fill = false): CSSProperties {
  return {
    gridTemplateColumns: group.rows[0]
      .map((cell) => {
        const rem = getGrowthCellWidthRem(cell, widthMode);
        return fill ? `minmax(${rem}rem, 1fr)` : `${rem}rem`;
      })
      .join(" "),
  };
}

// A group's own indent for the row names, shared by its header and its box.
function rowLabelPadding(group: GrowthGroup): CSSProperties | undefined {
  return group.rowLabels ? { paddingLeft: `${GROWTH_ROW_LABEL_WIDTH_REM}rem` } : undefined;
}

export function StudentGrowthTable({
  rows,
  mode,
  stacked,
  activeTab,
  onTabChange,
  draft,
  baseline,
  errors,
  conflicts,
  disabled,
  onValueChange,
  getDetailHref,
}: GrowthTableProps) {
  const { getInputProps } = useNumberInputFlowNavigation();
  const tabs = mode === "edit" ? EDIT_TABS : VIEW_TABS;
  const tab = tabs.find((candidate) => candidate.key === activeTab) ?? tabs[0];
  const groups = stacked ? tab.groups : mode === "edit" ? EDIT_GROUPS : VIEW_GROUPS;
  const toolbarOffset = useStickyToolbarOffset(stacked);
  const tableRef = useRef<HTMLTableElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const anchorRef = useRef<{ uid: string; offset: number; following: string[] } | null>(null);
  const widthMode: GrowthWidthMode = stacked ? "stacked" : mode === "view" ? "compact" : "wide";
  const compact = widthMode === "compact";
  const fillColumns = stacked && mode === "view";
  const studentColumnRem = stacked
    ? STUDENT_COLUMN_REM.stacked
    : compact
      ? STUDENT_COLUMN_REM.compact
      : STUDENT_COLUMN_REM.desktop;
  const groupCellPadding = compact ? "px-1" : "px-1.5";

  // The row right below the sticky tabs and column names is the one the user is reading. Row heights differ between
  // groups, so the page moves by the difference after the new group renders and that row stays where it was.
  const changeTab = useCallback(
    (key: string) => {
      const table = tableRef.current;
      const head = headRef.current;
      if (table && head && key !== tab.key) {
        const stickyBottom = getStickyHeadBottom(head);
        const rowElements = Array.from(table.querySelectorAll<HTMLElement>("tbody [data-growth-row]"));
        const index = rowElements.findIndex((element) => element.getBoundingClientRect().bottom > stickyBottom + 1);
        const anchor = rowElements[index];
        if (anchor?.dataset.growthRow) {
          anchorRef.current = {
            uid: anchor.dataset.growthRow,
            offset: anchor.getBoundingClientRect().top - stickyBottom,
            following: rowElements.slice(index + 1).flatMap((element) => element.dataset.growthRow ?? []),
          };
        }
      }
      onTabChange(key);
    },
    [onTabChange, tab.key],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new group is the trigger
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const table = tableRef.current;
    const head = headRef.current;
    anchorRef.current = null;
    if (!anchor || !table || !head) return;
    const candidates = [anchor.uid, ...anchor.following];
    const element = candidates
      .map((uid) => table.querySelector<HTMLElement>(`tbody [data-growth-row="${CSS.escape(uid)}"]`))
      .find((found) => found !== null);
    if (!element) return;
    const delta = element.getBoundingClientRect().top - getStickyHeadBottom(head) - anchor.offset;
    const scroller = table.closest<HTMLElement>(".mllg-content-area") ?? document.scrollingElement;
    if (scroller && delta !== 0) scroller.scrollTop += delta;
  }, [tab.key]);

  const tabsHeightRem = 3;
  const headStyle: CSSProperties | undefined = stacked
    ? { top: `calc(${toolbarOffset}px + ${tabsHeightRem}rem)` }
    : undefined;

  const table = (
    <table
      ref={tableRef}
      aria-label={mode === "edit" ? "모집한 학생 성장 상태 편집" : "모집한 학생 성장 상태"}
      className="w-max min-w-full border-separate border-spacing-0 text-sm"
    >
      <thead ref={headRef} className="text-xs">
        {stacked ? null : (
          <tr>
            <th
              scope="col"
              rowSpan={2}
              style={widthStyle(studentColumnRem)}
              className="sticky top-0 left-0 z-30 bg-v2-surface pr-3 pb-1.5 pl-v2-block-p text-left align-bottom font-semibold text-v2-fg-secondary"
            >
              학생
            </th>
            {groups.map((group) => (
              <th
                key={group.key}
                scope="colgroup"
                className={cn(
                  "sticky top-0 z-20 h-9 bg-v2-surface text-left align-bottom font-semibold text-v2-fg-secondary",
                  groupCellPadding,
                )}
              >
                <span className="block border-b border-v2-divider pb-1 leading-4">
                  {group.labelHidden ? <span className="sr-only">{group.label}</span> : group.label}
                </span>
              </th>
            ))}
            {mode === "view" ? <td className="sticky top-0 z-20 w-7 bg-v2-surface" /> : null}
          </tr>
        )}
        <tr>
          {stacked ? (
            <th
              scope="col"
              style={{ ...widthStyle(studentColumnRem), top: headStyle?.top }}
              className="sticky left-0 z-30 h-8 bg-v2-surface pr-2 pl-v2-block-p text-left align-bottom font-semibold text-v2-fg-secondary"
            >
              학생
            </th>
          ) : null}
          {groups.map((group) => (
            <th
              key={group.key}
              scope="colgroup"
              style={stacked ? { top: headStyle?.top } : undefined}
              className={cn(
                "sticky z-20 h-7 bg-v2-surface font-medium text-v2-fg-tertiary border-b border-v2-divider",
                groupCellPadding,
                stacked ? "h-8 align-bottom" : "top-9",
                compact && "text-[0.6875rem]",
              )}
            >
              <span
                className="grid text-center"
                style={{ ...columnsStyle(group, widthMode, fillColumns), ...rowLabelPadding(group) }}
              >
                {group.headers.map((header) => (
                  <span key={header} className="truncate">
                    {header}
                  </span>
                ))}
              </span>
            </th>
          ))}
          {mode === "view" && !stacked ? (
            <td className="sticky top-9 z-20 w-7 border-b border-v2-divider bg-v2-surface" />
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => {
          const last = rowIndex === rows.length - 1;
          const values = getEffectiveValues(row, draft, baseline);
          const rowErrors = errors[row.uid];
          const rowConflicts = conflicts[row.uid];
          const issues = Object.values(rowErrors ?? {}).filter((error): error is StudentGrowthEditError =>
            Boolean(error),
          );
          return (
            <tr key={row.uid} data-growth-row={row.uid}>
              <th
                scope="row"
                style={widthStyle(studentColumnRem)}
                className={cn(
                  "sticky left-0 z-10 bg-v2-surface py-2 pr-2 pl-v2-block-p text-left align-top font-medium",
                  !last && "border-b border-v2-divider",
                )}
              >
                <StudentIdentity row={row} issues={issues} stacked={stacked} compact={compact || fillColumns} />
              </th>
              {groups.map((group) => (
                <td
                  key={group.key}
                  className={cn("py-2 align-top", groupCellPadding, !last && "border-b border-v2-divider")}
                >
                  {mode === "edit" ? (
                    <EditBox
                      group={group}
                      row={row}
                      values={values}
                      baselineValues={getBaseline(row, baseline)}
                      changes={draft[row.uid]}
                      errors={rowErrors}
                      conflicts={rowConflicts}
                      disabled={disabled}
                      stacked={stacked}
                      getInputProps={getInputProps}
                      onChange={(field, value) => onValueChange(row.uid, field, value)}
                    />
                  ) : (
                    <ViewGroup group={group} row={row} values={values} widthMode={widthMode} fill={fillColumns} />
                  )}
                </td>
              ))}
              {mode === "view" && !stacked ? (
                <td className={cn("w-7 px-0.5 py-2 align-middle", !last && "border-b border-v2-divider")}>
                  <Link
                    to={getDetailHref(row.uid)}
                    prefetch="intent"
                    aria-label={`${fullStudentName(row.name)} 학생부`}
                    {...getV2LinkTransitionProps("forward")}
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-md text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg",
                      v2FocusRing,
                    )}
                  >
                    <ChevronRightIcon className="size-4" aria-hidden="true" />
                  </Link>
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="min-w-0">
      {stacked ? (
        <div
          role="tablist"
          aria-label="성장 상태 묶음"
          style={{ top: `${toolbarOffset}px`, height: `${tabsHeightRem}rem` }}
          className="sticky z-20 -mx-[var(--v2-gutter)] flex items-center bg-v2-canvas px-[var(--v2-gutter)]"
        >
          <div className="grid w-full grid-cols-4 gap-1 rounded-lg bg-v2-inset p-1">
            {tabs.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                role="tab"
                aria-selected={candidate.key === tab.key}
                onClick={() => changeTab(candidate.key)}
                className={cn(
                  "min-h-7 cursor-pointer truncate rounded-md px-1 text-xs font-medium",
                  candidate.key === tab.key
                    ? "bg-v2-surface text-v2-fg shadow-sm"
                    : "text-v2-fg-secondary hover:bg-v2-hover",
                  v2FocusRing,
                )}
              >
                {candidate.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "rounded-lg bg-v2-surface",
          // The table scrolls inside its own frame on wide layouts, so the column names and the student column stay in view.
          !stacked && "max-h-[calc(100dvh-9rem)] max-w-full overflow-auto",
        )}
      >
        {table}
      </div>
    </div>
  );
}

function StudentIdentity({
  row,
  issues,
  stacked,
  compact,
}: {
  row: GrowthRow;
  issues: readonly StudentGrowthEditError[];
  stacked: boolean;
  compact: boolean;
}) {
  const { name, variant } = splitVisibleStudentName(row.name);
  const thumb = (
    <StudentThumb
      studentUid={row.uid}
      name={name}
      variant={variant}
      compact={!compact}
      fluid={compact}
      showCaption={false}
      showRecruitmentLabel={false}
    />
  );
  return (
    <div className="flex min-w-0 items-center gap-2">
      {compact ? <span className="w-[1.875rem] shrink-0">{thumb}</span> : thumb}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm font-semibold text-v2-fg">{name}</span>
          {issues.length > 0 ? <RowIssueMark name={fullStudentName(row.name)} issues={issues} /> : null}
        </span>
        {variant ? (
          <span className={cn("block truncate text-xs font-normal text-v2-fg-tertiary", stacked && "text-[0.6875rem]")}>
            {variant}
          </span>
        ) : null}
      </span>
    </div>
  );
}

// The mark beside the name of a student whose row has a value that cannot be saved. The notice sits at the item, not at
// the top of the screen. It opens on hover and focus, and on press for touch.
function RowIssueMark({ name, issues }: { name: string; issues: readonly StudentGrowthEditError[] }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => cancelClose, [cancelClose]);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${name} 확인이 필요한 값 ${issues.length}개`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={() => {
          cancelClose();
          setOpen(true);
        }}
        onPointerLeave={scheduleClose}
        onFocus={() => setOpen(true)}
        onBlur={scheduleClose}
        onClick={() => setOpen((current) => !current)}
        className={cn("inline-flex shrink-0 cursor-pointer rounded-full text-v2-danger", v2FocusRing)}
      >
        <ExclamationCircleIcon className="size-4" aria-hidden="true" />
      </button>
      <Popover
        open={open}
        label={`${name} 확인이 필요한 값`}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        onPanelPointerEnter={cancelClose}
        onPanelPointerLeave={scheduleClose}
        className="w-64 p-3"
      >
        <ul className="space-y-1.5 text-xs text-v2-danger">
          {issues.map((issue) => (
            <li key={issue.field} className="flex items-start gap-1.5">
              <ExclamationCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 text-v2-fg">{issue.message}</span>
            </li>
          ))}
        </ul>
      </Popover>
    </>
  );
}

function isEntered(values: StudentGrowthEditValues): boolean {
  return [values.level, values.skillEx, values.skillNormal, values.skillEnhanced, values.skillSub].some(
    (value) => value !== null,
  );
}

function maxMark(field: StudentGrowthEditField, value: number): ReactNode {
  if (field === "skillEx" && value === 5) return "MAX";
  if ((field === "skillNormal" || field === "skillEnhanced" || field === "skillSub") && value === 10) return "MAX";
  return value;
}

function ViewGroup({
  group,
  row,
  values,
  widthMode,
  fill,
}: {
  group: GrowthGroup;
  row: GrowthRow;
  values: StudentGrowthEditValues;
  widthMode: GrowthWidthMode;
  fill: boolean;
}) {
  const entered = isEntered(values);
  return (
    <div className="grid text-center" style={columnsStyle(group, widthMode, fill)}>
      {group.rows[0].map((cell) => {
        if (cell.kind === "equipment") {
          return <EquipmentViewCell key={`equipment-${cell.slot}`} row={row} slot={cell.slot} entered={entered} />;
        }
        const field = cell.field;
        const applicable = isStudentGrowthFieldApplicable(field, row.student, values.tier);
        const value = values[field];
        let content: ReactNode;
        if (!applicable) content = null;
        else if (value === null) content = <span className="text-v2-fg-tertiary">–</span>;
        else if (field === "tier") content = <TierMark tier={value} />;
        else content = maxMark(field, value);
        return (
          <span key={field} className="flex min-h-9 items-center justify-center tabular-nums">
            {content}
          </span>
        );
      })}
    </div>
  );
}

function EquipmentViewCell({ row, slot, entered }: { row: GrowthRow; slot: 0 | 1 | 2; entered: boolean }) {
  const equipment = row.equipment[slot];
  if (!equipment.available) return <span className="min-h-9" />;
  if (equipment.tier === null) {
    return (
      <span className="flex min-h-9 items-center justify-center text-v2-fg-tertiary">{entered ? "미장착" : "–"}</span>
    );
  }
  return (
    <span className="flex min-h-9 items-center justify-center gap-1">
      {equipment.uid ? (
        <img src={equipmentImageUrl(equipment.uid)} alt="" className={cn("shrink-0 object-contain", "size-5")} />
      ) : null}
      <span className="flex flex-col items-start leading-tight">
        <span className="text-xs font-semibold tabular-nums">T{equipment.tier}</span>
        <span className="text-[0.6875rem] text-v2-fg-tertiary tabular-nums">
          Lv {equipment.level === null ? "–" : equipment.level}
        </span>
      </span>
    </span>
  );
}

type EditBoxProps = {
  group: GrowthGroup;
  row: GrowthRow;
  values: StudentGrowthEditValues;
  baselineValues: StudentGrowthEditValues;
  changes: Partial<StudentGrowthEditValues> | undefined;
  errors: GrowthRowErrors | undefined;
  conflicts: Partial<Record<StudentGrowthEditField, number | null>> | undefined;
  disabled: boolean;
  stacked: boolean;
  getInputProps: (options?: { disabled?: boolean }) => NumberInputFlowNavigationInputProps;
  onChange: (field: StudentGrowthEditField, value: number | null) => void;
};

// One group of values of one domain: one bordered box split by inner rules, with the hint row under it (rule 1).
function EditBox({
  group,
  row,
  values,
  changes,
  errors,
  conflicts,
  disabled,
  stacked,
  getInputProps,
  onChange,
}: EditBoxProps) {
  const columns = group.rows[0].length;
  const gridStyle = columnsStyle(group, stacked ? "stacked" : "wide");
  const hints = Array.from({ length: columns }, (_, column) => {
    for (const cells of group.rows) {
      const cell = cells[column];
      if (cell.kind !== "field") continue;
      const conflict = conflicts && cell.field in conflicts;
      const error = errors?.[cell.field];
      if (error)
        return { tone: "error" as const, text: error.max != null ? `최대 ${error.max}` : "", message: error.message };
      if (conflict) {
        const current = conflicts?.[cell.field];
        return { tone: "conflict" as const, text: `지금 ${current ?? "–"}`, message: "" };
      }
    }
    return null;
  });
  return (
    <div className="relative">
      {group.rowLabels ? (
        <div
          aria-hidden="true"
          className="absolute top-0 left-0 grid text-xs text-v2-fg-tertiary"
          style={{
            width: `${GROWTH_ROW_LABEL_WIDTH_REM}rem`,
            gridTemplateRows: `repeat(${group.rows.length}, 1.75rem)`,
          }}
        >
          {group.rowLabels.map((label) => (
            <span key={label} className="flex items-center">
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <div style={rowLabelPadding(group)}>
        <div className="divide-y divide-v2-control-border overflow-hidden rounded-md border border-v2-control-border bg-v2-surface focus-within:border-v2-control-border-strong">
          {group.rows.map((cells, rowIndex) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: the rows of a group are fixed
              key={rowIndex}
              className="grid divide-x divide-v2-control-border"
              style={gridStyle}
            >
              {cells.map((cell) =>
                cell.kind === "field" ? (
                  <EditSegment
                    key={cell.field}
                    row={row}
                    field={cell.field}
                    values={values}
                    changed={changes !== undefined && cell.field in changes}
                    error={errors?.[cell.field]}
                    conflict={conflicts !== undefined && cell.field in conflicts}
                    disabled={disabled}
                    getInputProps={getInputProps}
                    onChange={onChange}
                  />
                ) : null,
              )}
            </div>
          ))}
        </div>
        {hints.some((hint) => hint !== null) ? (
          <div className="mt-0.5 grid text-center text-[0.6875rem] leading-4" style={gridStyle}>
            {hints.map((hint, column) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the columns of a group are fixed
                key={column}
                className={cn(hint?.tone === "error" ? "text-v2-danger" : "text-v2-warning")}
              >
                {hint?.text}
                {hint?.message ? <span className="sr-only">{hint.message}</span> : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EditSegment({
  row,
  field,
  values,
  changed,
  error,
  conflict,
  disabled,
  getInputProps,
  onChange,
}: {
  row: GrowthRow;
  field: StudentGrowthEditField;
  values: StudentGrowthEditValues;
  changed: boolean;
  error: StudentGrowthEditError | undefined;
  conflict: boolean;
  disabled: boolean;
  getInputProps: EditBoxProps["getInputProps"];
  onChange: (field: StudentGrowthEditField, value: number | null) => void;
}) {
  const value = values[field];
  const range = STUDENT_GROWTH_EDIT_RANGES[field];
  const applicable = isStudentGrowthFieldApplicable(field, row.student, values.tier);
  // A stored value that the tier no longer allows stays editable, so it can be corrected here.
  const isWeaponOrAbility =
    field === "weaponLevel" || field === "abilityHp" || field === "abilityAtk" || field === "abilityHeal";
  const editable = applicable || (isWeaponOrAbility && value !== null && value > 0);
  const name = fullStudentName(row.name);
  if (!editable) {
    return <span aria-hidden="true" className="block min-h-7 bg-v2-inset" />;
  }
  const stateClassName = error
    ? "bg-v2-danger-subtle ring-2 ring-inset ring-v2-danger"
    : conflict
      ? "bg-v2-warning-subtle"
      : changed
        ? "bg-v2-accent-subtle"
        : undefined;
  const flowProps = getInputProps({ disabled });
  const label = `${name} ${range.label}`;
  if (field === "tier") {
    return (
      <TierInput
        label={name}
        value={value}
        initialTier={row.student.initialTier}
        min={range.min}
        max={range.max}
        disabled={disabled}
        compact
        flowProps={flowProps}
        onChange={(tier) => onChange(field, tier)}
        className={cn(segmentClassName, stateClassName)}
      />
    );
  }
  return (
    <NumberInput
      aria-label={label}
      aria-invalid={error ? true : undefined}
      compact
      step={1}
      placeholder="–"
      value={value ?? ""}
      disabled={disabled}
      data-number-input-flow={flowProps["data-number-input-flow"]}
      onFocus={flowProps.onFocus}
      onKeyDown={flowProps.onKeyDown}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        onChange(field, raw === "" ? null : Number(raw));
      }}
      className={cn(segmentClassName, "px-0 font-normal [appearance:textfield]", stateClassName)}
    />
  );
}
