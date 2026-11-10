import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { IdentificationIcon, MinusCircleIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useRef } from "react";
import { Link } from "react-router";
import { AttributeStripes } from "~/components/v2/features/students/AttributeStripes";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { StudentThumbList } from "~/components/v2/features/students/StudentThumbList";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { getV2LinkTransitionProps } from "~/components/v2/layout/screen-transition";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { useV2Page } from "~/components/v2/layout/V2Page";
import { Popover } from "~/components/v2/primitives/Popover";
import { Sheet } from "~/components/v2/primitives/Sheet";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { cn } from "~/lib/utils";
import type { UserStudent } from "~/views/user-students.server";
import { getTierText, TierMark } from "./TierMark";

export type StudentActionFailure = { uid: string; message: string };

type QuickPanelActions = {
  // The signed-in owner changes tiers and membership here. A visitor's thumbnail is a link to the student instead.
  pendingUid: string | null;
  failure: StudentActionFailure | null;
  onTierChange: (student: UserStudent, tier: number) => void;
  onRemove: (student: UserStudent) => void;
  onAdd: (student: UserStudent) => void;
};

const rowClassName = cn(
  "flex min-h-v2-row-min w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-v2-fg hover:bg-v2-hover disabled:cursor-not-allowed disabled:text-v2-fg-disabled",
  v2FocusRing,
);

const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function QuickPanelBody({
  student,
  actions,
  header,
}: {
  student: UserStudent;
  actions: QuickPanelActions;
  // The popover shows the name and attributes as its header. The sheet carries them in its own header.
  header: ReactNode;
}) {
  const recruited = student.tier !== null;
  const pending = actions.pendingUid === student.uid;
  const failure = actions.failure?.uid === student.uid ? actions.failure.message : null;
  return (
    <div className="space-y-3">
      {header}
      {recruited ? (
        <fieldset className="space-y-1.5" disabled={pending}>
          <legend className="text-xs text-v2-fg-tertiary">현재 성급</legend>
          <div className="flex flex-wrap gap-1">
            {TIERS.map((tier) => (
              <ToggleChip
                key={tier}
                pressed={student.tier === tier}
                disabled={pending || tier < student.initialTier}
                ariaLabel={getTierText(tier)}
                onPressedChange={() => {
                  if (student.tier !== tier) actions.onTierChange(student, tier);
                }}
              >
                <TierMark tier={tier} className="font-medium" />
              </ToggleChip>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="-mx-2 space-y-0.5">
        <Link
          to={`/students/${student.uid}`}
          prefetch="intent"
          className={rowClassName}
          {...getV2LinkTransitionProps("forward")}
        >
          <IdentificationIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
          <span className="min-w-0 flex-1">학생부 보기</span>
          <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
        </Link>
        {recruited ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => actions.onRemove(student)}
            className={cn(rowClassName, "text-v2-danger")}
          >
            <MinusCircleIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">모집한 학생에서 제외</span>
          </button>
        ) : (
          <button type="button" disabled={pending} onClick={() => actions.onAdd(student)} className={rowClassName}>
            <PlusCircleIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            <span className="min-w-0 flex-1">모집한 학생에 추가</span>
          </button>
        )}
      </div>
      {failure ? <StatusNotice tone="danger">{failure}</StatusNotice> : null}
    </div>
  );
}

function StudentCell({
  student,
  mode,
  open,
  onOpenChange,
  actions,
  selected,
  onSelect,
}: {
  student: UserStudent;
  mode: "owner" | "visitor";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: QuickPanelActions;
  // Set while the batch registration is on, for the not-yet-recruited students.
  selected?: boolean;
  onSelect?: () => void;
}) {
  const { stacked } = useV2Page();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const { name, variant } = splitVisibleStudentName(student.name);
  const recruited = student.tier !== null;
  const panelOpen = open && !stacked;
  const sheetOpen = open && stacked;
  const fullName = variant ? `${name}(${variant})` : name;
  const header = (
    <div>
      <p className="text-sm font-semibold text-v2-fg">{fullName}</p>
      <AttributeStripes
        className="mt-1"
        attackType={student.attackType}
        defenseType={student.defenseType}
        role={student.role}
      />
    </div>
  );
  const sheetBody = <QuickPanelBody student={student} actions={actions} header={null} />;

  const thumbProps = {
    studentUid: student.uid,
    name,
    variant,
    relaxed: true,
    scrimLabel: student.tier === null ? undefined : <TierMark tier={student.tier} className="text-v2-on-media" />,
    scrimAriaLabel: student.tier === null ? undefined : `현재 ${getTierText(student.tier)}`,
    showRecruitmentLabel: false,
  } as const;

  let thumb: ReactNode;
  if (onSelect) {
    thumb = (
      <StudentThumb
        {...thumbProps}
        selected={selected}
        onSelect={onSelect}
        selectionActionLabel="일괄 등록 선택"
        grayscaleWhenUnselected
      />
    );
  } else if (mode === "owner") {
    thumb = <StudentThumb {...thumbProps} ref={triggerRef} expanded={panelOpen} onOpen={() => onOpenChange(true)} />;
  } else {
    thumb = <StudentThumb {...thumbProps} linkTo={`/students/${student.uid}`} />;
  }

  return (
    <div ref={slotRef} className={cn("relative", !recruited && !selected && "[&_img]:grayscale")}>
      {thumb}
      {mode === "owner" && !onSelect ? (
        <>
          <Popover
            open={panelOpen}
            label={`${fullName} 빠른 보기`}
            onClose={() => onOpenChange(false)}
            returnFocusRef={triggerRef}
            anchorRef={slotRef}
            className="w-72"
          >
            <QuickPanelBody student={student} actions={actions} header={header} />
          </Popover>
          <Sheet
            open={sheetOpen}
            title={fullName}
            description={
              <AttributeStripes
                className="mt-1"
                attackType={student.attackType}
                defenseType={student.defenseType}
                role={student.role}
              />
            }
            onClose={() => onOpenChange(false)}
            onExited={() => triggerRef.current?.focus({ preventScroll: true })}
          >
            {sheetBody}
          </Sheet>
        </>
      ) : null}
    </div>
  );
}

export function StudentGrid({
  students,
  mode,
  openUid,
  onOpenChange,
  actions,
  selectedUids,
  onToggleSelect,
}: {
  students: readonly UserStudent[];
  mode: "owner" | "visitor";
  openUid: string | null;
  onOpenChange: (uid: string | null) => void;
  actions: QuickPanelActions;
  // Passed while the batch registration is on.
  selectedUids?: ReadonlySet<string>;
  onToggleSelect?: (uid: string) => void;
}) {
  return (
    <StudentThumbList>
      {students.map((student) => (
        <li key={student.uid}>
          <StudentCell
            student={student}
            mode={mode}
            open={openUid === student.uid}
            onOpenChange={(open) => onOpenChange(open ? student.uid : null)}
            actions={actions}
            selected={selectedUids?.has(student.uid)}
            onSelect={onToggleSelect ? () => onToggleSelect(student.uid) : undefined}
          />
        </li>
      ))}
    </StudentThumbList>
  );
}
