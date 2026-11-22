import { ArrowRightIcon, ChevronRightIcon, StarIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";
import {
  isWalkthroughStrikerSlot,
  type TimelineAction,
  type TimelineStep,
  type WalkthroughParty,
  type WalkthroughTimelineDocument,
  type WalkthroughUnit,
} from "~/domain/walkthrough-timeline";
import { cn } from "~/lib/utils";
import { formatRaidStudentName, type RaidPartyStudent } from "../raid-records/RaidPartyEditor";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { StudentThumb } from "../students/StudentThumb";
import { splitVisibleStudentName } from "../students/split-student-name";

export type WalkthroughStudent = RaidPartyStudent;
export type WalkthroughStudentsByUid = ReadonlyMap<string, WalkthroughStudent>;

export const UNKNOWN_STUDENT_NAME = "알 수 없는 학생";

export function walkthroughStudentName(studentsByUid: WalkthroughStudentsByUid, uid: string | undefined): string {
  const student = uid ? studentsByUid.get(uid) : undefined;
  return student ? formatRaidStudentName(student.name) : UNKNOWN_STUDENT_NAME;
}

// ---------------------------------------------------------------------------------------------------------------------
// Portrait marks
// ---------------------------------------------------------------------------------------------------------------------

// The starting skill order on a portrait's top-left corner: 1-3 amber, 4 and later blue, as the raid rank screen marks
// it.
export function StartingSkillBadge({ order, className }: { order: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`시작 스킬 ${order}번`}
      className={cn(
        "pointer-events-none absolute top-0.5 left-0.5 z-10 inline-flex size-3.5 items-center justify-center rounded text-[0.6875rem] leading-none font-bold tabular-nums shadow-sm",
        order <= 3
          ? "bg-v2-start-skill-early text-v2-on-start-skill-early"
          : "bg-v2-start-skill-late text-v2-on-start-skill-late",
        className,
      )}
    >
      {order}
    </span>
  );
}

export function tierMeaning(tier: number): string {
  return tier <= 5 ? `${tier}성` : `고유무기 ${tier - 5}`;
}

// The star tier in a portrait's band: a star with the tier up to 5, then the exclusive weapon icon with its level.
export function TierBandLabel({ tier }: { tier: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums">
      {tier <= 5 ? (
        <StarIcon className="size-3 shrink-0 text-v2-star" aria-hidden="true" />
      ) : (
        <img src="/icons/exclusive_weapon.png" alt="" className="size-3 shrink-0" />
      )}
      {tier <= 5 ? tier : tier - 5}
    </span>
  );
}

function startingSkillOrderOf(party: Pick<WalkthroughParty, "startingSkillStudentUids">, studentUid: string) {
  const index = party.startingSkillStudentUids.indexOf(studentUid);
  return index >= 0 ? index + 1 : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Party portraits
// ---------------------------------------------------------------------------------------------------------------------

// A party's students as portraits with their star tier and starting skill order: strikers, a gap, then specials. Empty
// slots are left out. With `onSelect`, each portrait is a toggle (the starting skill order editor).
export function WalkthroughPartyThumbs({
  party,
  partySize,
  studentsByUid,
  size = "default",
  onSelect,
  label,
}: {
  party: Pick<WalkthroughParty, "units" | "startingSkillStudentUids">;
  partySize: WalkthroughTimelineDocument["partySize"];
  studentsByUid: WalkthroughStudentsByUid;
  size?: "default" | "small";
  onSelect?: (studentUid: string) => void;
  label: string;
}) {
  const units = [...party.units]
    .filter((unit): unit is WalkthroughUnit & { studentUid: string } => Boolean(unit.studentUid))
    .sort((left, right) => left.slot - right.slot);
  const strikers = units.filter((unit) => isWalkthroughStrikerSlot(unit.slot, partySize));
  const specials = units.filter((unit) => !isWalkthroughStrikerSlot(unit.slot, partySize));
  const renderThumb = (unit: WalkthroughUnit & { studentUid: string }) => {
    const student = studentsByUid.get(unit.studentUid);
    const { name, variant } = splitVisibleStudentName(student?.name ?? UNKNOWN_STUDENT_NAME);
    const order = startingSkillOrderOf(party, unit.studentUid);
    const tier = unit.snapshot?.tier;
    return (
      <li key={unit.slot} className={cn("relative shrink-0", size === "small" ? "w-12" : "w-11 sm:w-16")}>
        <StudentThumb
          studentUid={unit.studentUid}
          name={student ? name : UNKNOWN_STUDENT_NAME}
          variant={student ? variant : null}
          fluid
          scrimLabel={tier !== undefined ? <TierBandLabel tier={tier} /> : undefined}
          scrimAriaLabel={tier !== undefined ? tierMeaning(tier) : undefined}
          onSelect={onSelect ? () => onSelect(unit.studentUid) : undefined}
          selected={order !== null}
          showSelectedIndicator={false}
          selectionActionLabel={order !== null ? `시작 스킬 ${order}번` : "시작 스킬"}
        />
        {order !== null ? <StartingSkillBadge order={order} /> : null}
      </li>
    );
  };
  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3 sm:gap-x-4">
      {strikers.length > 0 ? <ul className="flex flex-wrap gap-1.5 sm:gap-2">{strikers.map(renderThumb)}</ul> : null}
      {specials.length > 0 ? <ul className="flex flex-wrap gap-1.5 sm:gap-2">{specials.map(renderThumb)}</ul> : null}
    </div>
  );
}

// Up to three faces of a party, overlapping, for a mention chip or a list card.
export function PartyFaceStack({
  party,
  size = "sm",
  max = 3,
}: {
  party: Pick<WalkthroughParty, "units">;
  size?: "xs" | "sm";
  max?: number;
}) {
  const uids = [...party.units]
    .sort((left, right) => left.slot - right.slot)
    .flatMap((unit) => (unit.studentUid ? [unit.studentUid] : []))
    .slice(0, max);
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center">
      {uids.map((uid, index) => (
        <span key={uid} className={cn("inline-flex rounded-full", index > 0 && (size === "xs" ? "-ml-1.5" : "-ml-2"))}>
          <RoundStudentImage
            studentUid={uid}
            size="sm"
            className={size === "xs" ? "size-[1.125rem]" : undefined}
          />
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Timeline notation
// ---------------------------------------------------------------------------------------------------------------------

export function timelineActionText(action: TimelineAction): string {
  return (action.text ?? "")
    .trim()
    .replace(/(?:^|\s*\/\s*)[-–—]+\s*$/, "")
    .trim();
}

export function timelineActionDetail(action: TimelineAction): string {
  return [action.copied ? "복제 스킬" : null, timelineActionText(action) || null].filter(Boolean).join(" · ");
}

export function timelineMarkerText(step: Pick<TimelineStep, "marker">): string {
  if (!step.marker) return "";
  if (step.marker.kind === "immediate") return step.marker.value || "즉시";
  return step.marker.value ?? "";
}

function actionAccessibleName(action: TimelineAction, studentsByUid: WalkthroughStudentsByUid): string {
  const detail = timelineActionDetail(action);
  if (!action.studentUid) return detail;
  return [
    walkthroughStudentName(studentsByUid, action.studentUid),
    action.targetStudentUid ? `대상 ${walkthroughStudentName(studentsByUid, action.targetStudentUid)}` : null,
    detail || null,
  ]
    .filter(Boolean)
    .join(", ");
}

// A step's actions as faces: a chevron between actions, and a skill with a target as one gray pill holding the student,
// an arrow, and the target. The detail text follows the faces. The same notation is used on the detail page, in the
// timeline editor's collapsed rows, and in the viewer.
export function TimelineActionSequence({
  actions,
  studentsByUid,
  size = "sm",
}: {
  actions: readonly TimelineAction[];
  studentsByUid: WalkthroughStudentsByUid;
  size?: "sm" | "md";
}) {
  const visible = actions.filter((action) => action.studentUid || timelineActionText(action));
  const faceClassName = size === "md" ? "size-8" : undefined;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
      {visible.map((action, index) => {
        const detail = timelineActionDetail(action);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: actions are an ordered list without their own ids
          <span key={index} className="inline-flex min-w-0 items-center gap-1.5">
            {index > 0 ? <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" /> : null}
            {action.studentUid ? (
              <span role="img" aria-label={actionAccessibleName(action, studentsByUid)} className="inline-flex items-center gap-1">
                <span
                  className={cn(
                    "inline-flex items-center",
                    action.targetStudentUid && "gap-1 rounded-full bg-v2-action-pair p-[3px]",
                  )}
                >
                  <RoundStudentImage studentUid={action.studentUid} size="sm" className={faceClassName} />
                  {action.targetStudentUid ? (
                    <>
                      <ArrowRightIcon className="size-3.5 shrink-0 text-v2-fg-secondary" aria-hidden="true" />
                      <RoundStudentImage studentUid={action.targetStudentUid} size="sm" className={faceClassName} />
                    </>
                  ) : null}
                </span>
                {detail ? (
                  <span aria-hidden="true" className="text-xs font-semibold break-keep text-v2-fg-secondary">
                    {detail}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="rounded-md bg-v2-inset px-1.5 py-0.5 text-xs font-semibold text-v2-fg-secondary">
                {detail}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// A timeline divider: a line, the text, and a line.
export function TimelineDivider({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-v2-divider" />
      <span className="max-w-64 truncate text-xs font-semibold text-v2-fg-secondary">{text || "설명글"}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-v2-divider" />
      {children}
    </span>
  );
}

// A party's timeline, read-only: number, timing, actions, and note in one row on wide screens; the note drops under the
// actions on narrow ones.
export function WalkthroughTimelineSteps({
  steps,
  studentsByUid,
  label,
}: {
  steps: readonly TimelineStep[];
  studentsByUid: WalkthroughStudentsByUid;
  label: string;
}) {
  const ordered = [...steps].sort((left, right) => left.order - right.order);
  return (
    <ol aria-label={label} className="flex list-none flex-col gap-1">
      {ordered.map((step, index) =>
        step.kind === "divider" ? (
          <li key={step.uid} className="flex min-h-9 items-center gap-3 px-3">
            <span className="hidden w-4 shrink-0 text-xs text-v2-fg-tertiary tabular-nums sm:block">{index + 1}</span>
            <TimelineDivider text={step.note ?? ""} />
          </li>
        ) : (
          <li
            key={step.uid}
            className="grid min-h-11 grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-md bg-v2-inset px-3 py-2 sm:grid-cols-[1rem_5.5rem_minmax(0,1fr)_minmax(0,0.6fr)]"
          >
            <span className="hidden text-xs text-v2-fg-tertiary tabular-nums sm:block">{index + 1}</span>
            <span className="text-sm font-semibold [overflow-wrap:anywhere] text-v2-link tabular-nums">
              {timelineMarkerText(step) || "시점 없음"}
            </span>
            <TimelineActionSequence actions={step.actions} studentsByUid={studentsByUid} />
            {step.note?.trim() ? (
              <span className="col-start-2 text-xs break-words text-v2-fg-secondary sm:col-start-auto">{step.note}</span>
            ) : (
              <span className="hidden sm:block" />
            )}
          </li>
        ),
      )}
    </ol>
  );
}
