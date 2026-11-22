import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type TimelineAction,
  type TimelineStep,
  WALKTHROUGH_TIMELINE_LIMITS,
  type WalkthroughParty,
} from "~/domain/walkthrough-timeline";
import { extractCertainTimelineImport, type ImportStudent } from "~/domain/walkthrough-timeline-import";
import { walkthroughPartyLabel } from "~/domain/walkthrough-mentions";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { Popover } from "../../primitives/Popover";
import { Sheet } from "../../primitives/Sheet";
import { RoundStudentImage } from "../students/RoundStudentImage";
import {
  emptyActionStep,
  emptyDividerStep,
  isActionOutsideParty,
  moveItem,
  renumberSteps,
  walkthroughPartyStudentUids,
} from "./walkthrough-editor-state";
import {
  TimelineActionSequence,
  TimelineDivider,
  timelineMarkerText,
  type WalkthroughStudentsByUid,
  walkthroughStudentName,
} from "./walkthrough-parts";

const inputClassName = cn(
  "h-7 w-full min-w-0 rounded-md border border-v2-control-border bg-v2-surface px-2.5 text-base text-v2-fg placeholder:text-v2-fg-tertiary sm:text-sm",
  v2FocusRing,
);

// ---------------------------------------------------------------------------------------------------------------------
// Student menu
// ---------------------------------------------------------------------------------------------------------------------

// A menu of the party's students, for the student and the target of one skill. The current choice has a check.
function StudentMenu({
  open,
  label,
  triggerRef,
  options,
  selected,
  noneLabel,
  studentsByUid,
  onSelect,
  onClose,
}: {
  open: boolean;
  label: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  options: readonly string[];
  selected: string | undefined;
  // A first row that clears the choice, such as "대상 없음".
  noneLabel?: string;
  studentsByUid: WalkthroughStudentsByUid;
  onSelect: (studentUid: string | undefined) => void;
  onClose: () => void;
}) {
  const choose = (value: string | undefined) => {
    onSelect(value);
    onClose();
    triggerRef.current?.focus();
  };
  const row = (key: string, value: string | undefined, content: ReactNode) => {
    const current = value === selected;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={current}
        onClick={() => choose(value)}
        className={cn(
          "flex min-h-v2-row-min w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm text-v2-fg hover:bg-v2-hover v2-interaction-transition",
          current && "bg-v2-hover",
          v2FocusRing,
        )}
      >
        {content}
        {current ? <CheckIcon className="ml-auto size-4 shrink-0 text-v2-link" aria-hidden="true" /> : null}
      </button>
    );
  };
  return (
    <Popover open={open} label={label} onClose={onClose} returnFocusRef={triggerRef} className="w-56 p-1.5">
      <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
        {noneLabel ? row("none", undefined, <span className="truncate">{noneLabel}</span>) : null}
        {options.map((uid) =>
          row(
            uid,
            uid,
            <>
              <RoundStudentImage studentUid={uid} size="sm" />
              <span className="min-w-0 truncate">{walkthroughStudentName(studentsByUid, uid)}</span>
            </>,
          ),
        )}
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// One skill
// ---------------------------------------------------------------------------------------------------------------------

// Six dots, the usual mark of a row that can be dragged.
function GripIcon() {
  return (
    <svg viewBox="0 0 8 14" className="h-3.5 w-2" fill="currentColor" aria-hidden="true">
      {[1, 7].map((cx) => [2, 7, 12].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.25} />))}
    </svg>
  );
}

function ActionRow({
  action,
  actionIndex,
  actionCount,
  partyStudentUids,
  studentsByUid,
  onChange,
  onRemove,
  onMove,
  onDragStart,
  onDrop,
}: {
  action: TimelineAction;
  actionIndex: number;
  actionCount: number;
  partyStudentUids: readonly string[];
  studentsByUid: WalkthroughStudentsByUid;
  onChange: (action: TimelineAction) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [menu, setMenu] = useState<"student" | "target" | null>(null);
  const studentRef = useRef<HTMLButtonElement>(null);
  const targetRef = useRef<HTMLButtonElement>(null);
  const partySet = useMemo(() => new Set(partyStudentUids), [partyStudentUids]);
  const studentName = action.studentUid ? walkthroughStudentName(studentsByUid, action.studentUid) : null;
  const targetName = action.targetStudentUid ? walkthroughStudentName(studentsByUid, action.targetStudentUid) : null;
  const outside = isActionOutsideParty(action, partySet);
  const position = `${actionIndex + 1}번째 스킬`;

  const onGripKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    onMove(event.key === "ArrowUp" ? actionIndex - 1 : actionIndex + 1);
  };

  return (
    <li
      className="flex min-w-0 flex-col gap-1"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onKeyDown={onGripKeyDown}
          aria-label={`${position} 순서 바꾸기`}
          aria-keyshortcuts="ArrowUp ArrowDown"
          disabled={actionCount < 2}
          className={cn(
            "flex h-7 w-4 shrink-0 cursor-grab items-center justify-center rounded text-v2-fg-tertiary active:cursor-grabbing disabled:cursor-default disabled:opacity-40",
            v2FocusRing,
          )}
        >
          <GripIcon />
        </button>
        <span
          className={cn(
            "inline-flex shrink-0 items-center",
            action.targetStudentUid && "gap-1 rounded-full bg-v2-action-pair p-[3px]",
          )}
        >
          <button
            ref={studentRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menu === "student"}
            aria-label={`${position} 학생${studentName ? ` ${studentName}` : " 고르기"}`}
            onClick={() => setMenu((current) => (current === "student" ? null : "student"))}
            className={cn("inline-flex shrink-0 cursor-pointer rounded-full", v2FocusRing)}
          >
            {action.studentUid ? (
              <RoundStudentImage studentUid={action.studentUid} size="md" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-full bg-v2-inset text-v2-fg-tertiary">
                <PlusIcon className="size-4" aria-hidden="true" />
              </span>
            )}
          </button>
          {action.targetStudentUid ? (
            <button
              ref={targetRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={menu === "target"}
              aria-label={`${position} 대상 ${targetName}`}
              onClick={() => setMenu((current) => (current === "target" ? null : "target"))}
              className={cn("inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full", v2FocusRing)}
            >
              <ArrowRightIcon className="size-3.5 text-v2-fg-secondary" aria-hidden="true" />
              <RoundStudentImage studentUid={action.targetStudentUid} size="md" />
            </button>
          ) : null}
        </span>
        {action.studentUid && !action.targetStudentUid ? (
          <button
            ref={targetRef}
            type="button"
            aria-haspopup="dialog"
            aria-expanded={menu === "target"}
            aria-label={`${position} 대상 지정`}
            onClick={() => setMenu((current) => (current === "target" ? null : "target"))}
            className={cn(
              "inline-flex h-7 w-12 shrink-0 cursor-pointer items-center justify-center rounded-md bg-v2-inset text-xs font-medium text-v2-fg-secondary hover:bg-v2-filled-hover hover:text-v2-fg v2-interaction-transition",
              v2FocusRing,
            )}
          >
            대상
          </button>
        ) : null}
        <input
          aria-label={`${position} 세부 내용`}
          value={action.text ?? ""}
          placeholder="세부 내용"
          onChange={(event) => onChange({ ...action, text: event.currentTarget.value })}
          className={inputClassName}
        />
        <IconButton icon={XMarkIcon} label={`${position} 삭제`} onClick={onRemove} />
      </div>
      {outside ? (
        <p className="flex items-center gap-1 pl-5 text-xs text-v2-warning">
          <ExclamationTriangleIcon className="size-3.5 shrink-0" aria-hidden="true" />
          편성에 없는 학생이에요.
        </p>
      ) : null}
      <StudentMenu
        open={menu === "student"}
        label={`${position} 학생 고르기`}
        triggerRef={studentRef}
        options={partyStudentUids}
        selected={action.studentUid}
        studentsByUid={studentsByUid}
        onSelect={(studentUid) =>
          studentUid
            ? onChange({
                ...action,
                kind: action.kind === "free_text" || action.kind === "boss_gimmick" ? "student_ex" : action.kind,
                studentUid,
                targetStudentUid: action.targetStudentUid === studentUid ? undefined : action.targetStudentUid,
              })
            : undefined
        }
        onClose={() => setMenu(null)}
      />
      <StudentMenu
        open={menu === "target"}
        label={`${position} 대상 고르기`}
        triggerRef={targetRef}
        options={partyStudentUids}
        selected={action.targetStudentUid}
        noneLabel="대상 없음"
        studentsByUid={studentsByUid}
        onSelect={(targetStudentUid) => onChange({ ...action, targetStudentUid })}
        onClose={() => setMenu(null)}
      />
    </li>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// One step, open
// ---------------------------------------------------------------------------------------------------------------------

function StepEditor({
  step,
  stepIndex,
  stepCount,
  partyStudentUids,
  studentsByUid,
  canAddStep,
  autoFocus,
  onChange,
  onMove,
  onRemove,
  onInsertAfter,
}: {
  step: TimelineStep;
  stepIndex: number;
  stepCount: number;
  partyStudentUids: readonly string[];
  studentsByUid: WalkthroughStudentsByUid;
  canAddStep: boolean;
  autoFocus: boolean;
  onChange: (step: TimelineStep) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onInsertAfter: () => void;
}) {
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [draggedAction, setDraggedAction] = useState<number | null>(null);
  const label = step.kind === "divider" ? `설명글 ${stepIndex + 1}` : `${stepIndex + 1}단계`;
  useEffect(() => {
    if (autoFocus) firstInputRef.current?.focus();
  }, [autoFocus]);

  const onFieldKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canAddStep) {
      event.preventDefault();
      onInsertAfter();
    }
  };

  const setActions = (actions: TimelineAction[]) => onChange({ ...step, kind: "actions", actions });
  const canAddAction = step.actions.length < WALKTHROUGH_TIMELINE_LIMITS.actionsPerStep;
  const onlyFreeText =
    step.actions.length === 1 && !step.actions[0]?.studentUid && step.actions[0]?.kind === "free_text";

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md bg-v2-inset p-3">
      <div className="flex items-center gap-1">
        <h4 className="mr-auto text-sm font-semibold text-v2-fg">{label}</h4>
        <IconButton icon={ChevronUpIcon} label={`${label} 위로 이동`} disabled={stepIndex === 0} onClick={() => onMove(stepIndex - 1)} />
        <IconButton
          icon={ChevronDownIcon}
          label={`${label} 아래로 이동`}
          disabled={stepIndex >= stepCount - 1}
          onClick={() => onMove(stepIndex + 1)}
        />
        <IconButton icon={TrashIcon} label={`${label} 삭제`} danger onClick={onRemove} />
      </div>

      {step.kind === "divider" ? (
        <label className="flex flex-col gap-1.5 text-xs font-medium text-v2-fg-secondary">
          설명글
          <input
            ref={firstInputRef}
            value={step.note ?? ""}
            onChange={(event) => onChange({ ...step, note: event.currentTarget.value })}
            onKeyDown={onFieldKeyDown}
            className={inputClassName}
          />
        </label>
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-end gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-v2-fg-secondary">
              시점
              <input
                ref={firstInputRef}
                value={step.marker?.value ?? ""}
                onChange={(event) =>
                  onChange({
                    ...step,
                    marker: { kind: step.marker?.kind ?? "manual", value: event.currentTarget.value },
                  })
                }
                onKeyDown={onFieldKeyDown}
                className={cn(inputClassName, "tabular-nums")}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-v2-fg-secondary">
              메모
              <input
                value={step.note ?? ""}
                onChange={(event) => onChange({ ...step, note: event.currentTarget.value })}
                onKeyDown={onFieldKeyDown}
                className={inputClassName}
              />
            </label>
            <Button size="sm" disabled={!canAddStep} onClick={onInsertAfter} className="hidden sm:inline-flex">
              <PlusIcon className="size-3.5" aria-hidden="true" />
              다음 단계
            </Button>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="mr-auto text-xs font-medium text-v2-fg-secondary">사용 스킬</span>
              {onlyFreeText ? (
                <Button
                  variant="text"
                  size="sm"
                  onClick={() =>
                    onChange({
                      ...step,
                      kind: "divider",
                      marker: undefined,
                      actions: [],
                      note: step.actions[0]?.text?.trim() || step.sourceText?.trim() || step.note || "",
                    })
                  }
                >
                  설명글로 바꾸기
                </Button>
              ) : null}
            </div>
            {step.actions.length > 0 ? (
              <ul className="flex min-w-0 flex-col gap-1.5">
                {step.actions.map((action, actionIndex) => (
                  <ActionRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: actions are an ordered list without their own ids
                    key={actionIndex}
                    action={action}
                    actionIndex={actionIndex}
                    actionCount={step.actions.length}
                    partyStudentUids={partyStudentUids}
                    studentsByUid={studentsByUid}
                    onChange={(next) =>
                      setActions(step.actions.map((current, index) => (index === actionIndex ? next : current)))
                    }
                    onRemove={() => setActions(step.actions.filter((_, index) => index !== actionIndex))}
                    onMove={(to) => setActions(moveItem(step.actions, actionIndex, to))}
                    onDragStart={() => setDraggedAction(actionIndex)}
                    onDrop={() => {
                      if (draggedAction !== null) setActions(moveItem(step.actions, draggedAction, actionIndex));
                      setDraggedAction(null);
                    }}
                  />
                ))}
              </ul>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-xs font-medium text-v2-fg-secondary">스킬 추가</span>
              <div role="group" aria-label={`${label} 스킬 추가`} className="flex flex-wrap gap-1">
                {partyStudentUids.map((uid) => (
                  <button
                    key={uid}
                    type="button"
                    disabled={!canAddAction}
                    aria-label={`${walkthroughStudentName(studentsByUid, uid)} 스킬 추가`}
                    onClick={() => setActions([...step.actions, { kind: "student_ex", studentUid: uid }])}
                    className={cn(
                      "inline-flex cursor-pointer rounded-full hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 v2-interaction-transition",
                      v2FocusRing,
                    )}
                  >
                    <RoundStudentImage studentUid={uid} size="md" />
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:hidden">
              <Button size="sm" disabled={!canAddStep} onClick={onInsertAfter}>
                <PlusIcon className="size-3.5" aria-hidden="true" />
                다음 단계
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// One step, folded
// ---------------------------------------------------------------------------------------------------------------------

function StepRow({
  step,
  stepIndex,
  partyStudentSet,
  studentsByUid,
  onOpen,
  onMove,
  onDragStart,
  onDrop,
}: {
  step: TimelineStep;
  stepIndex: number;
  partyStudentSet: ReadonlySet<string>;
  studentsByUid: WalkthroughStudentsByUid;
  onOpen: () => void;
  onMove: (to: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const label = step.kind === "divider" ? `설명글 ${stepIndex + 1}` : `${stepIndex + 1}단계`;
  const outside = step.actions.some((action) => isActionOutsideParty(action, partyStudentSet));
  const marker = timelineMarkerText(step);
  return (
    <button
      type="button"
      draggable
      aria-expanded={false}
      aria-label={`${label} 편집`}
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        event.preventDefault();
        onMove(event.key === "ArrowUp" ? stepIndex - 1 : stepIndex + 1);
      }}
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className={cn(
        "flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left v2-interaction-transition",
        step.kind === "divider" ? "hover:bg-v2-hover" : "bg-v2-inset hover:bg-v2-filled-hover",
        v2FocusRing,
      )}
    >
      <span className="hidden w-5 shrink-0 text-xs text-v2-fg-tertiary tabular-nums sm:block">{stepIndex + 1}</span>
      {step.kind === "divider" ? (
        <TimelineDivider text={step.note ?? ""} />
      ) : (
        <span className="grid min-w-0 flex-1 grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,0.6fr)]">
          <span
            className={cn(
              "text-sm font-semibold [overflow-wrap:anywhere] tabular-nums",
              marker ? "text-v2-link" : "text-v2-fg-tertiary",
            )}
          >
            {marker || "시점 없음"}
          </span>
          <span className="flex min-w-0 items-center gap-1.5">
            <TimelineActionSequence actions={step.actions} studentsByUid={studentsByUid} />
            {outside ? (
              <ExclamationTriangleIcon
                className="size-4 shrink-0 text-v2-warning"
                aria-label="편성에 없는 학생이 있어요"
                role="img"
              />
            ) : null}
          </span>
          {step.note?.trim() ? (
            <span className="col-start-2 truncate text-xs text-v2-fg-secondary sm:col-start-auto">{step.note}</span>
          ) : (
            <span className="hidden sm:block" />
          )}
          {step.sourceText?.trim() ? (
            <span className="col-span-full truncate text-[0.6875rem] text-v2-fg-tertiary" title={step.sourceText}>
              {step.sourceText}
            </span>
          ) : null}
        </span>
      )}
      <ChevronDownIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Text import
// ---------------------------------------------------------------------------------------------------------------------

function ImportPanel({
  students,
  room,
  onImport,
  onCancel,
}: {
  students: readonly ImportStudent[];
  // How many steps the timeline can still take.
  room: number;
  onImport: (steps: TimelineStep[]) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const draft = useMemo(() => extractCertainTimelineImport(text, [...students]), [text, students]);
  const count = Math.min(draft.steps.length, room);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  return (
    <div className="flex flex-col gap-2 rounded-md bg-v2-inset p-3">
      <textarea
        ref={textareaRef}
        aria-label="커뮤니티 공략 글"
        value={text}
        rows={7}
        placeholder="커뮤니티의 공략 글을 붙여넣어주세요."
        onChange={(event) => setText(event.currentTarget.value)}
        className={cn(
          "w-full min-w-0 resize-y rounded-md border border-v2-control-border bg-v2-surface px-2.5 py-2 font-mono text-base text-v2-fg placeholder:text-v2-fg-tertiary sm:text-sm",
          v2FocusRing,
        )}
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="text" onClick={onCancel}>
          취소
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={count === 0}
          onClick={() => onImport(draft.steps.slice(0, count).map((step) => step.parsed))}
        >
          {count}개 단계 추가
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------------------------------------------------

// A party's timeline, edited in a sheet. Steps are folded rows; one opens at a time to edit its timing, note, and skills.
// A skill is added by tapping a face, in the order they are pressed, and its target is chosen from a menu.
export function WalkthroughTimelineSheet({
  open,
  party,
  partyIndex,
  students,
  studentsByUid,
  onChange,
  onClose,
}: {
  open: boolean;
  party: WalkthroughParty | null;
  partyIndex: number;
  students: readonly ImportStudent[];
  studentsByUid: WalkthroughStudentsByUid;
  onChange: (steps: TimelineStep[]) => void;
  onClose: () => void;
}) {
  const [expandedUid, setExpandedUid] = useState<string | null>(null);
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [draggedStep, setDraggedStep] = useState<number | null>(null);
  const steps = party?.steps ?? [];
  const partyStudentUids = useMemo(() => (party ? walkthroughPartyStudentUids(party) : []), [party]);
  const partyStudentSet = useMemo(() => new Set(partyStudentUids), [partyStudentUids]);
  const room = WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty - steps.length;

  useEffect(() => {
    if (!open) {
      setImporting(false);
      setExpandedUid(null);
    }
  }, [open]);

  const commit = (next: TimelineStep[]) => onChange(renumberSteps(next));
  const insertAt = (index: number, step: TimelineStep) => {
    if (room <= 0) return;
    commit([...steps.slice(0, index), step, ...steps.slice(index)]);
    setExpandedUid(step.uid);
    setFocusUid(step.uid);
  };
  const move = (from: number, to: number) => commit(moveItem(steps, from, to));

  const title = `${walkthroughPartyLabel(partyIndex)} 타임라인`;
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      headerAction={
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={importing || room <= 0} onClick={() => setImporting(true)}>
            텍스트에서 가져오기
          </Button>
          {steps.length > 0 ? (
            <Button
              size="sm"
              variant="danger-subtle"
              onClick={() => {
                commit([]);
                setExpandedUid(null);
              }}
            >
              전체 초기화
            </Button>
          ) : null}
        </div>
      }
      footer={
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={room <= 0} onClick={() => insertAt(steps.length, emptyActionStep(steps.length))}>
            <PlusIcon className="size-3.5" aria-hidden="true" />
            단계 추가
          </Button>
          <Button size="sm" disabled={room <= 0} onClick={() => insertAt(steps.length, emptyDividerStep(steps.length))}>
            <PlusIcon className="size-3.5" aria-hidden="true" />
            설명글 추가
          </Button>
          <Button variant="primary" className="ml-auto" onClick={onClose}>
            완료
          </Button>
        </div>
      }
    >
      <div className="flex min-w-0 flex-col gap-1">
        {importing ? (
          <div className="mb-2">
            <ImportPanel
              students={students}
              room={room}
              onCancel={() => setImporting(false)}
              onImport={(imported) => {
                commit([...steps, ...imported]);
                setImporting(false);
                setExpandedUid(null);
              }}
            />
          </div>
        ) : null}
        <ol aria-label={title} className="flex min-w-0 list-none flex-col gap-1">
          {steps.map((step, stepIndex) => (
            <li key={step.uid} className="min-w-0">
              {expandedUid === step.uid ? (
                <StepEditor
                  step={step}
                  stepIndex={stepIndex}
                  stepCount={steps.length}
                  partyStudentUids={partyStudentUids}
                  studentsByUid={studentsByUid}
                  canAddStep={room > 0}
                  autoFocus={focusUid === step.uid}
                  onChange={(next) => commit(steps.map((current) => (current.uid === step.uid ? next : current)))}
                  onMove={(to) => move(stepIndex, to)}
                  onRemove={() => {
                    commit(steps.filter((current) => current.uid !== step.uid));
                    setExpandedUid(null);
                  }}
                  onInsertAfter={() => insertAt(stepIndex + 1, emptyActionStep(stepIndex + 1))}
                />
              ) : (
                <StepRow
                  step={step}
                  stepIndex={stepIndex}
                  partyStudentSet={partyStudentSet}
                  studentsByUid={studentsByUid}
                  onOpen={() => {
                    setExpandedUid(step.uid);
                    setFocusUid(null);
                  }}
                  onMove={(to) => move(stepIndex, to)}
                  onDragStart={() => setDraggedStep(stepIndex)}
                  onDrop={() => {
                    if (draggedStep !== null) move(draggedStep, stepIndex);
                    setDraggedStep(null);
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </Sheet>
  );
}
