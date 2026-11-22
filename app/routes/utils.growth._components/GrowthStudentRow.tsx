import { ArrowDownIcon, ArrowUpIcon, ExclamationCircleIcon, HeartIcon } from "@heroicons/react/16/solid";
import { type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useState } from "react";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { TierInput } from "~/components/v2/features/students/TierInput";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import type { NumberInputFlowNavigationInputProps } from "~/components/v2/primitives/use-number-input-flow-navigation";
import { STUDENT_STATE_STALE_MESSAGE } from "~/domain/student-state-errors";
import { cn } from "~/lib/utils";
import {
  GrowthResourceList,
  GrowthResourceRequirements,
  GrowthResourceToggle,
  isGrowthResourceListShown,
  useGrowthResourceDisclosure,
} from "./GrowthResourceRequirements";
import { GrowthRowMenu, type GrowthRowMenuItem } from "./GrowthRowMenu";
import { GrowthValueInput } from "./GrowthValueInput";
import {
  cellKey,
  cellLabel,
  cellName,
  GROWTH_GROUPS,
  type GrowthCell,
  type GrowthGroup,
  type GrowthTab,
  getEquipmentLabels,
  getFieldMax,
  getGrowthGroup,
  isFieldDisabledByTier,
  isGearField,
  RELATIONSHIP_MAX,
  RELATIONSHIP_MIN,
} from "./growth-fields";
import type { GrowthStudent } from "./types";
import { type GrowthRowState, useGrowthRow } from "./use-growth-row";

export type GrowthRowSide = "current" | "target";

// The manual order controls of one row, shown only while the sort is 수동 정렬.
export type GrowthReorderControls = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (offset: -1 | 1) => void;
  onHandlePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  dragging: boolean;
};

type FlowProps = () => NumberInputFlowNavigationInputProps;

// Cell widths in rem, shared by the column names, the field boxes, and the equipment part names so they line up.
export function getCellWidthRem(cell: GrowthCell, showSteps: boolean): number {
  if (cell.kind === "tier") return 3.5;
  // The 인연 cell also holds the heart before the number.
  const heart = cell.kind === "relationship" ? 0.75 : 0;
  return (showSteps ? 6.75 : 2.75) + heart;
}

export function columnsStyle(cells: readonly GrowthCell[], showSteps: boolean): CSSProperties {
  return { gridTemplateColumns: cells.map((cell) => `${getCellWidthRem(cell, showSteps)}rem`).join(" ") };
}

export function getGroupWidthRem(group: GrowthGroup, showSteps: boolean): number {
  return group.cells.reduce((sum, cell) => sum + getCellWidthRem(cell, showSteps), 0);
}

// "니코", or "아리스(무장)" with the variant, as an accessible name.
export function fullStudentName(rawName: string): string {
  const { name, variant } = splitVisibleStudentName(rawName);
  return variant ? `${name}(${variant})` : name;
}

const segmentClassName = "rounded-none border-0 bg-transparent focus-visible:-outline-offset-2";

type RowContext = {
  student: GrowthStudent;
  row: GrowthRowState;
  name: string;
  showSteps: boolean;
  flowProps: FlowProps;
};

function DisabledSegment() {
  return <span aria-hidden="true" className="block h-7 bg-v2-inset" />;
}

function CellInput({ cell, side, context }: { cell: GrowthCell; side: GrowthRowSide; context: RowContext }) {
  const { student, row, name, showSteps, flowProps } = context;
  const sideName = side === "current" ? "현재" : "목표";
  const tier = side === "current" ? row.tierDraft : (row.targetTierDraft ?? row.tierDraft);

  if (cell.kind === "tier") {
    return (
      <TierInput
        label={`${name} ${sideName}`}
        value={side === "current" ? row.tierDraft : (row.targetTierDraft ?? row.tierDraft)}
        initialTier={student.initialTier}
        min={side === "current" ? student.initialTier : row.effectiveTier}
        max={9}
        compact
        flowProps={flowProps()}
        onChange={side === "current" ? row.handleCurrentTierChange : row.handleTargetTierChange}
        className={segmentClassName}
      />
    );
  }

  if (cell.kind === "relationship") {
    const key = side === "current" ? "relationshipCurrentLevel" : "relationshipTargetLevel";
    return (
      <GrowthValueInput
        label={`${name} ${sideName} 인연 랭크`}
        value={row.draftRelationshipValues[key]}
        min={RELATIONSHIP_MIN}
        max={RELATIONSHIP_MAX}
        showSteps={showSteps}
        flowProps={flowProps()}
        onChange={(value) => row.handleRelationshipFieldChange(key, value)}
        leading={<HeartIcon className="size-3 shrink-0 text-v2-relationship" aria-hidden="true" />}
      />
    );
  }

  const definition = cell.field;
  const key = side === "current" ? definition.key : definition.targetKey;
  if (!student.hasGear && isGearField(key)) return <DisabledSegment />;
  const value = row.draftValues[key];
  // A stored value that the tier no longer allows stays editable, so it can be corrected here.
  if (isFieldDisabledByTier(key, tier) && (value ?? 0) <= 0) return <DisabledSegment />;
  return (
    <GrowthValueInput
      label={`${name} ${sideName} ${definition.name}`}
      value={value}
      min={definition.min}
      max={Math.max(definition.min, getFieldMax(key, definition.max, tier))}
      showSteps={showSteps}
      flowProps={flowProps()}
      onChange={(next) => row.handleFieldChange(key, next)}
    />
  );
}

// One field box: the values of one group side by side, split by inner rules (the one-domain box of the DS).
function FieldBox({
  group,
  side,
  context,
  className,
}: {
  group: GrowthGroup;
  side: GrowthRowSide;
  context: RowContext;
  className?: string;
}) {
  return (
    <fieldset
      aria-label={`${context.name} ${side === "current" ? "현재" : "목표"} ${group.label}`}
      className={cn(
        "m-0 grid min-w-0 divide-x divide-v2-control-border overflow-hidden rounded-md border border-v2-control-border bg-v2-surface p-0",
        className,
      )}
      style={columnsStyle(group.cells, context.showSteps)}
    >
      {group.cells.map((cell) => (
        <div key={cellKey(cell)} className="min-w-0">
          <CellInput cell={cell} side={side} context={context} />
        </div>
      ))}
    </fieldset>
  );
}

function EquipmentPartNames({
  student,
  showSteps,
  className,
}: {
  student: GrowthStudent;
  showSteps: boolean;
  className?: string;
}) {
  const group = getGrowthGroup("equipment");
  const labels = getEquipmentLabels(student);
  return (
    <div
      aria-hidden="true"
      className={cn("grid text-center text-[0.6875rem] leading-4 text-v2-fg-tertiary", className)}
      style={columnsStyle(group.cells, showSteps)}
    >
      {labels.map((label, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the three equipment slots are fixed
        <span key={index} className="truncate">
          {label}
        </span>
      ))}
    </div>
  );
}

function RowIssues({ row }: { row: GrowthRowState }) {
  if (row.staleWriteBlocked) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <IssueText>{STUDENT_STATE_STALE_MESSAGE}</IssueText>
        <Button size="sm" onClick={() => window.location.reload()}>
          새로고침
        </Button>
      </div>
    );
  }
  if (row.displayedErrors.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {row.displayedErrors.map(({ kind, error }) => (
        <div key={kind} role="alert" className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <IssueText>{error}</IssueText>
          {row.retryAvailable[kind] ? (
            <Button size="sm" onClick={() => row.handleRetry(kind)}>
              다시 시도
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function IssueText({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-1 text-xs text-v2-danger">
      <ExclamationCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

function hasRowIssues(row: GrowthRowState): boolean {
  return row.staleWriteBlocked || row.displayedErrors.length > 0;
}

function EnrollPrompt({ student, row }: { student: GrowthStudent; row: GrowthRowState }) {
  if (!student.released) {
    return <span className="text-xs break-keep text-v2-fg-secondary">아직 모집하지 않은 학생이에요</span>;
  }
  return (
    <Button size="sm" onClick={row.enroll} disabled={row.staleWriteBlocked}>
      모집 학생으로 등록
    </Button>
  );
}

function SetAllMaxButton({
  side,
  row,
  name,
  fill = false,
}: {
  side: GrowthRowSide;
  row: GrowthRowState;
  name: string;
  fill?: boolean;
}) {
  return (
    <Button
      size="sm"
      aria-label={`${name} ${side === "current" ? "현재" : "목표"} 모두 최대`}
      onClick={side === "current" ? row.handleSetAllMaxCurrent : row.handleSetAllMaxTargets}
      className={fill ? "w-full" : "w-[4.75rem]"}
    >
      모두 최대
    </Button>
  );
}

// The six dots of a drag handle.
function GripIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true" fill="currentColor">
      <circle cx="6" cy="4" r="1.25" />
      <circle cx="10" cy="4" r="1.25" />
      <circle cx="6" cy="8" r="1.25" />
      <circle cx="10" cy="8" r="1.25" />
      <circle cx="6" cy="12" r="1.25" />
      <circle cx="10" cy="12" r="1.25" />
    </svg>
  );
}

function DragHandle({ name, reorder }: { name: string; reorder: GrowthReorderControls }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowUp" && reorder.canMoveUp) {
      event.preventDefault();
      reorder.onMove(-1);
    } else if (event.key === "ArrowDown" && reorder.canMoveDown) {
      event.preventDefault();
      reorder.onMove(1);
    }
  };
  return (
    <button
      type="button"
      aria-label={`${name} 순서 옮기기`}
      aria-describedby="growth-reorder-hint"
      onPointerDown={reorder.onHandlePointerDown}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex h-8 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg active:cursor-grabbing v2-interaction-transition",
        v2FocusRing,
      )}
    >
      <GripIcon />
    </button>
  );
}

function MoveButton({
  name,
  direction,
  reorder,
  className,
}: {
  name: string;
  direction: -1 | 1;
  reorder: GrowthReorderControls;
  className?: string;
}) {
  const Icon = direction === -1 ? ArrowUpIcon : ArrowDownIcon;
  const enabled = direction === -1 ? reorder.canMoveUp : reorder.canMoveDown;
  const label = `${name} ${direction === -1 ? "위로" : "아래로"}`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!enabled}
      onClick={() => reorder.onMove(direction)}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md bg-v2-inset text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:hover:bg-v2-inset v2-interaction-transition",
        v2FocusRing,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function StudentThumbnail({ student, size }: { student: GrowthStudent; size: "table" | "stacked" }) {
  const { name, variant } = splitVisibleStudentName(student.name);
  if (size === "stacked") {
    return (
      <span className="w-8 shrink-0">
        <StudentThumb
          studentUid={student.uid}
          name={name}
          variant={variant}
          fluid
          showCaption={false}
          showRecruitmentLabel={false}
        />
      </span>
    );
  }
  return (
    <span className="w-14 shrink-0">
      <StudentThumb
        studentUid={student.uid}
        name={name}
        variant={variant}
        fluid
        captionPlacement="overlay"
        overlayOnMobile
        showRecruitmentLabel={false}
      />
    </span>
  );
}

type GrowthStudentRowProps = {
  student: GrowthStudent;
  writeMode: "legacy" | "nullable";
  onStudentUpdate: (student: GrowthStudent) => void;
  onSavingChange: (uid: string, saving: boolean) => void;
  layout: "table" | "stacked";
  showSteps: boolean;
  // The tab shown on stacked layouts.
  tab: GrowthTab;
  flowProps: FlowProps;
  reorder: GrowthReorderControls | null;
  last: boolean;
};

export function GrowthStudentRow({
  student,
  writeMode,
  onStudentUpdate,
  onSavingChange,
  layout,
  showSteps,
  tab,
  flowProps,
  reorder,
  last,
}: GrowthStudentRowProps) {
  const row = useGrowthRow({ student, writeMode, onStudentUpdate });
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const name = fullStudentName(student.name);
  const context: RowContext = { student, row, name, showSteps, flowProps };

  useEffect(() => {
    onSavingChange(student.uid, row.isSaving);
  }, [onSavingChange, student.uid, row.isSaving]);
  useEffect(() => () => onSavingChange(student.uid, false), [onSavingChange, student.uid]);

  const menuItems: GrowthRowMenuItem[] = [
    { key: "student", label: "학생부", to: `/students/${encodeURIComponent(student.uid)}` },
    ...(student.relationshipCurrentLevel != null || student.relationshipTargetLevel != null
      ? [
          {
            key: "relationship",
            label: "인연 랭크 계산기",
            to: `/utils/relationship?studentUid=${encodeURIComponent(student.uid)}`,
          },
        ]
      : []),
    { key: "remove", label: "삭제", danger: true, onSelect: () => setConfirmingRemove(true) },
  ];
  const menu = (
    <GrowthRowMenu label={`${name} 메뉴`} items={menuItems} disabled={row.staleWriteBlocked || row.isRemoving} />
  );
  const removeDialog = (
    <Dialog
      open={confirmingRemove}
      onClose={() => setConfirmingRemove(false)}
      title="정말로 성장 목표를 삭제할까요?"
      size="sm"
    >
      <p className="text-sm text-v2-fg-secondary">삭제된 기록은 복구할 수 없어요.</p>
      <div className="flex justify-end gap-2">
        <Button onClick={() => setConfirmingRemove(false)}>취소</Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmingRemove(false);
            row.remove();
          }}
        >
          삭제
        </Button>
      </div>
    </Dialog>
  );

  if (layout === "stacked") {
    return (
      <StackedStudentCard
        context={context}
        tab={tab}
        menu={menu}
        reorder={reorder}
        last={last}
        removeDialog={removeDialog}
      />
    );
  }

  return <TableStudentRows context={context} menu={menu} reorder={reorder} last={last} removeDialog={removeDialog} />;
}

// Sticky offsets of the two left columns of the wide table, in rem.
// pl-3 + 56px portrait + gap + 32px menu + pr-1; 수동 정렬 adds the 16px handle and the 22px move buttons.
export const TABLE_STUDENT_COLUMN_REM = { default: 7, manual: 9.875 } as const;
export const TABLE_LABEL_COLUMN_REM = 2.5;

function TableStudentRows({
  context,
  menu,
  reorder,
  last,
  removeDialog,
}: {
  context: RowContext;
  menu: ReactNode;
  reorder: GrowthReorderControls | null;
  last: boolean;
  removeDialog: ReactNode;
}) {
  const { student, row, name, showSteps } = context;
  const studentColumnRem = reorder ? TABLE_STUDENT_COLUMN_REM.manual : TABLE_STUDENT_COLUMN_REM.default;
  const stickyLabelStyle: CSSProperties = { left: `${studentColumnRem}rem`, width: `${TABLE_LABEL_COLUMN_REM}rem` };
  const highlight = reorder?.dragging ? "bg-v2-hover" : "bg-v2-surface";
  const cellBase = cn("align-top", reorder?.dragging && "bg-v2-hover");
  const groupCell = cn(cellBase, "px-1.5 py-1.5");
  const issues = hasRowIssues(row);
  // The message and resource rows span the value columns. Their content sticks beside the left columns, so it stays in
  // view while the table scrolls sideways.
  const spanContentStyle: CSSProperties = {
    left: `${studentColumnRem + TABLE_LABEL_COLUMN_REM}rem`,
    maxWidth: `calc(var(--growth-frame-width, 100vw) - ${studentColumnRem + TABLE_LABEL_COLUMN_REM}rem - 1rem)`,
  };
  const valueColumnCount = 1 + GROWTH_GROUPS.length;
  const dataAttributes = { "data-growth-student": student.uid };
  const resources = useGrowthResourceDisclosure();
  const resourceListShown = isGrowthResourceListShown(row.resourceRequirements, resources);
  const resourceParts = {
    studentName: name,
    requirements: row.resourceRequirements,
    calculating: row.isCalculatingResources,
    disclosure: resources,
  };
  // The 재화 line shares the line of the equipment part names: the toggle fills the columns before 장비 티어, and stays
  // inside them when the table scrolls sideways, so it never covers the names.
  const equipmentIndex = GROWTH_GROUPS.findIndex((group) => group.key === "equipment");
  const groupsAfterEquipment = GROWTH_GROUPS.length - equipmentIndex - 1;
  // The bottom divider goes on the student's last row.
  const lastRow = resourceListShown ? "list" : issues ? "issues" : "resources";
  const divider = (rowKey: typeof lastRow) => !last && lastRow === rowKey && "border-b border-v2-divider";

  return (
    <>
      <tr {...dataAttributes}>
        <th
          scope="rowgroup"
          rowSpan={2}
          style={{ width: `${studentColumnRem}rem` }}
          className={cn("sticky left-0 z-10 py-1.5 pr-1 pl-3 text-left align-top font-normal", highlight)}
        >
          {/* The menu sits on the 현재 row line, beside the portrait's top. */}
          <div className="flex items-start gap-2">
            {reorder ? (
              <span className="flex shrink-0 items-center">
                <DragHandle name={name} reorder={reorder} />
                <span className="flex flex-col gap-0.5">
                  <MoveButton name={name} direction={-1} reorder={reorder} className="h-[1.1875rem] w-[1.375rem]" />
                  <MoveButton name={name} direction={1} reorder={reorder} className="h-[1.1875rem] w-[1.375rem]" />
                </span>
              </span>
            ) : null}
            <StudentThumbnail student={student} size="table" />
            {menu}
            {removeDialog}
          </div>
        </th>
        <RowLabel style={stickyLabelStyle} highlight={highlight}>
          현재
        </RowLabel>
        <td className={cn(cellBase, "px-1.5 py-1.5")}>
          {student.isRecruited ? <SetAllMaxButton side="current" row={row} name={name} /> : null}
        </td>
        {student.isRecruited ? (
          GROWTH_GROUPS.map((group) => (
            <td key={group.key} className={groupCell}>
              <FieldBox group={group} side="current" context={context} />
            </td>
          ))
        ) : (
          // A student who is not recruited has no current state, so the row holds only the enroll prompt.
          <td colSpan={GROWTH_GROUPS.length} className={cn(cellBase, "px-1.5 py-1.5")}>
            <div className="flex h-7 items-center">
              <EnrollPrompt student={student} row={row} />
            </div>
          </td>
        )}
      </tr>
      <tr {...dataAttributes}>
        <RowLabel style={stickyLabelStyle} highlight={highlight} className="pb-0.5">
          목표
        </RowLabel>
        <td className={cn(cellBase, "px-1.5 pt-1.5 pb-0.5")}>
          <SetAllMaxButton side="target" row={row} name={name} />
        </td>
        {GROWTH_GROUPS.map((group) => (
          <td key={group.key} className={cn(cellBase, "px-1.5 pt-1.5 pb-0.5")}>
            <FieldBox group={group} side="target" context={context} />
          </td>
        ))}
      </tr>
      <tr {...dataAttributes}>
        <td className={cn("sticky left-0 z-10", highlight, divider("resources"))} />
        <RowLabel
          style={stickyLabelStyle}
          highlight={highlight}
          className={cn("py-0 pb-2 leading-6", divider("resources"))}
        >
          재화
        </RowLabel>
        <td colSpan={1 + equipmentIndex} className={cn(cellBase, "px-1.5 pb-2", divider("resources"))}>
          <div className="sticky w-fit" style={spanContentStyle}>
            <GrowthResourceToggle {...resourceParts} />
          </div>
        </td>
        <td className={cn(cellBase, "px-1.5 pb-2", divider("resources"))}>
          <EquipmentPartNames student={student} showSteps={showSteps} className="h-6 items-center" />
        </td>
        {groupsAfterEquipment > 0 ? (
          <td colSpan={groupsAfterEquipment} className={cn(cellBase, divider("resources"))} />
        ) : null}
      </tr>
      {issues ? (
        <tr {...dataAttributes}>
          <td className={cn("sticky left-0 z-10", highlight, divider("issues"))} />
          <td className={cn("sticky z-10", highlight, divider("issues"))} style={stickyLabelStyle} />
          <td colSpan={valueColumnCount} className={cn(cellBase, "px-1.5 pb-2", divider("issues"))}>
            <div className="sticky" style={spanContentStyle}>
              <RowIssues row={row} />
            </div>
          </td>
        </tr>
      ) : null}
      {resourceListShown ? (
        <tr {...dataAttributes}>
          <td className={cn("sticky left-0 z-10", highlight, divider("list"))} />
          <td className={cn("sticky z-10", highlight, divider("list"))} style={stickyLabelStyle} />
          <td colSpan={valueColumnCount} className={cn(cellBase, "px-1.5 pb-2.5", divider("list"))}>
            <div className="sticky" style={spanContentStyle}>
              <GrowthResourceList {...resourceParts} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RowLabel({
  style,
  highlight,
  className,
  children,
}: {
  style: CSSProperties;
  highlight: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <td
      style={style}
      className={cn(
        "sticky z-10 px-1 py-1.5 text-left align-top text-xs leading-7 text-v2-fg-secondary",
        highlight,
        className,
      )}
    >
      {children}
    </td>
  );
}

// Width of the row names (현재 · 목표) in the stacked card, in rem.
export const STACKED_LABEL_COLUMN_REM = 2.25;

function StackedStudentCard({
  context,
  tab,
  menu,
  reorder,
  last,
  removeDialog,
}: {
  context: RowContext;
  tab: GrowthTab;
  menu: ReactNode;
  reorder: GrowthReorderControls | null;
  last: boolean;
  removeDialog: ReactNode;
}) {
  const { student, row, name, showSteps } = context;
  const { name: mainName, variant } = splitVisibleStudentName(student.name);
  const groups = tab.groups.map(getGrowthGroup);
  const showEquipmentNames = tab.key === "equipment";

  return (
    <section
      aria-label={name}
      data-growth-student={student.uid}
      className={cn("py-2.5", !last && "border-b border-v2-divider", reorder?.dragging && "bg-v2-hover")}
    >
      <div className="flex min-h-8 items-center gap-2">
        {reorder ? <DragHandle name={name} reorder={reorder} /> : null}
        <StudentThumbnail student={student} size="stacked" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-v2-fg">
          {mainName}
          {variant ? <span className="ml-1 text-xs font-normal text-v2-fg-tertiary">{variant}</span> : null}
        </span>
        {reorder ? (
          <span className="flex shrink-0 gap-1">
            <MoveButton name={name} direction={-1} reorder={reorder} className="size-7 bg-v2-inset" />
            <MoveButton name={name} direction={1} reorder={reorder} className="size-7 bg-v2-inset" />
          </span>
        ) : null}
        {menu}
        {removeDialog}
      </div>

      {showSteps ? (
        <TransposedValues context={context} groups={groups} />
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          {(["current", "target"] as const).map((side) => (
            <div key={side}>
              <div className="flex items-start gap-2">
                <span
                  className="shrink-0 text-xs leading-7 text-v2-fg-secondary"
                  style={{ width: `${STACKED_LABEL_COLUMN_REM}rem` }}
                >
                  {side === "current" ? "현재" : "목표"}
                </span>
                {side === "current" && !student.isRecruited ? (
                  <div className="flex h-7 min-w-0 flex-1 items-center">
                    <EnrollPrompt student={student} row={row} />
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    {groups.map((group) => (
                      <div key={group.key}>
                        <FieldBox group={group} side={side} context={context} />
                        {side === "target" && group.key === "equipment" && showEquipmentNames ? (
                          <EquipmentPartNames student={student} showSteps={showSteps} className="mt-0.5" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
                {side === "target" || student.isRecruited ? (
                  <span className="ml-auto shrink-0">
                    <SetAllMaxButton side={side} row={row} name={name} />
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasRowIssues(row) ? (
        <div className="mt-1.5" style={{ marginLeft: `calc(${STACKED_LABEL_COLUMN_REM}rem + 0.5rem)` }}>
          <RowIssues row={row} />
        </div>
      ) : null}
      <div className="mt-1.5 flex items-start gap-2">
        <span
          className="shrink-0 text-xs leading-6 text-v2-fg-secondary"
          style={{ width: `${STACKED_LABEL_COLUMN_REM}rem` }}
        >
          재화
        </span>
        <div className="min-w-0 flex-1">
          <GrowthResourceRequirements
            studentName={name}
            requirements={row.resourceRequirements}
            calculating={row.isCalculatingResources}
          />
        </div>
      </div>
    </section>
  );
}

// With the step buttons a value is too wide to sit four in a row on a phone, so the values run down and 현재 · 목표 sit
// side by side.
function TransposedValues({ context, groups }: { context: RowContext; groups: GrowthGroup[] }) {
  const { student, row, name } = context;
  const cells = groups.flatMap((group) => group.cells);
  const equipmentLabels = getEquipmentLabels(student);
  const columns = `${STACKED_LABEL_COLUMN_REM + 1}rem minmax(0, 1fr) minmax(0, 1fr)`;
  return (
    <div className="mt-2">
      <div
        aria-hidden="true"
        className="grid gap-x-2 pb-1 text-center text-xs text-v2-fg-secondary"
        style={{ gridTemplateColumns: columns }}
      >
        <span />
        <span>현재</span>
        <span>목표</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {cells.map((cell) => {
          const slot =
            cell.kind === "field" && ["equip1", "equip2", "equip3"].includes(cell.field.key)
              ? Number(cell.field.label) - 1
              : null;
          return (
            <div key={cellKey(cell)} className="grid items-center gap-x-2" style={{ gridTemplateColumns: columns }}>
              <span className="min-w-0 truncate text-xs text-v2-fg-secondary">
                {cellLabel(cell)}
                {slot !== null && equipmentLabels[slot] ? (
                  <span className="ml-1 text-[0.6875rem] text-v2-fg-tertiary">{equipmentLabels[slot]}</span>
                ) : null}
              </span>
              {(["current", "target"] as const).map((side) =>
                side === "current" && !student.isRecruited ? (
                  // Not recruited: no current state; the enroll prompt sits at the bottom of this column.
                  <span key={side} />
                ) : (
                  <fieldset
                    key={side}
                    aria-label={`${name} ${side === "current" ? "현재" : "목표"} ${cellName(cell)}`}
                    className="m-0 min-w-0 overflow-hidden rounded-md border border-v2-control-border bg-v2-surface p-0"
                  >
                    <CellInput cell={cell} side={side} context={context} />
                  </fieldset>
                ),
              )}
            </div>
          );
        })}
        <div className="grid gap-x-2" style={{ gridTemplateColumns: columns }}>
          <span />
          {student.isRecruited ? (
            <SetAllMaxButton side="current" row={row} name={name} fill />
          ) : (
            <span className="flex items-center">
              <EnrollPrompt student={student} row={row} />
            </span>
          )}
          <SetAllMaxButton side="target" row={row} name={name} fill />
        </div>
      </div>
    </div>
  );
}
