import { ArrowPathIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { type AnimationEvent, useId, useState } from "react";
import { ResourceThumb } from "~/components/v2/features/resources/ResourceThumb";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { CHARACTER_EXP_REPORTS, type StudentGrowthResourceRequirements } from "~/domain/growth-resource";
import { cn } from "~/lib/utils";

type Phase = "collapsed" | "open" | "closing";

export type GrowthResourceDisclosure = {
  phase: Phase;
  animated: boolean;
  contentId: string;
  toggle: () => void;
  onAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
};

// The fold state of one student's resource list. The toggle and the list are separate pieces, so the wide table can
// put the toggle on the line of the equipment part names and the list on its own row below.
export function useGrowthResourceDisclosure(): GrowthResourceDisclosure {
  const [phase, setPhase] = useState<Phase>("collapsed");
  // The motion runs only after a toggle, so a list that mounts open (after a recalculation) does not animate.
  const [animated, setAnimated] = useState(false);
  const contentId = useId();
  return {
    phase,
    animated,
    contentId,
    toggle: () => {
      setAnimated(true);
      setPhase((current) => (current === "open" ? "closing" : "open"));
    },
    onAnimationEnd: (event) => {
      if (event.target !== event.currentTarget) return;
      setPhase((current) => (current === "closing" ? "collapsed" : current));
    },
  };
}

function hasResources(requirements: StudentGrowthResourceRequirements | null): boolean {
  return (
    requirements != null && (requirements.items.length > 0 || requirements.characterExp > 0 || requirements.credit > 0)
  );
}

/** Whether the resource list is on screen, so the table knows to render its row. */
export function isGrowthResourceListShown(
  requirements: StudentGrowthResourceRequirements | null,
  disclosure: GrowthResourceDisclosure,
): boolean {
  return hasResources(requirements) && disclosure.phase !== "collapsed";
}

type PartProps = {
  studentName: string;
  requirements: StudentGrowthResourceRequirements | null;
  calculating: boolean;
  disclosure: GrowthResourceDisclosure;
};

// The line that says what the list holds: the toggle, "필요한 재화가 없어요", or the calculating status. While a save or
// the recalculation runs, the status takes the toggle's place and an open list stays dimmed, so it does not collapse.
export function GrowthResourceToggle({ studentName, requirements, calculating, disclosure }: PartProps) {
  if (requirements == null || calculating) return <CalculatingStatus />;
  if (!hasResources(requirements)) {
    return <p className="flex min-h-6 items-center text-xs text-v2-fg-secondary">필요한 재화가 없어요</p>;
  }
  const open = disclosure.phase === "open";
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={disclosure.contentId}
      aria-label={`${studentName} ${open ? "필요 재화 접기" : "필요 재화 펼치기"}`}
      onClick={disclosure.toggle}
      className={cn(
        "inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-md text-xs font-medium whitespace-nowrap text-v2-fg-secondary hover:text-v2-fg v2-interaction-transition",
        v2FocusRing,
      )}
    >
      {open ? "필요 재화 접기" : "펼쳐서 필요 재화 확인"}
      <ChevronDownIcon
        className={cn(
          "size-3.5 motion-safe:transition-transform duration-v2-base ease-v2-standard",
          open && "rotate-180",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

// The resources one student's goals need. It opens and closes with the panel motion.
export function GrowthResourceList({ requirements, calculating, disclosure }: Omit<PartProps, "studentName">) {
  if (requirements == null || !isGrowthResourceListShown(requirements, disclosure)) return null;
  return (
    // The panel animation holds its final opacity, so the dimming sits on an inner box.
    <div
      id={disclosure.contentId}
      onAnimationEnd={disclosure.onAnimationEnd}
      aria-busy={calculating}
      className={cn(
        "min-w-0",
        disclosure.animated && (disclosure.phase === "open" ? "v2-panel-enter" : "v2-panel-exit"),
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 transition-opacity duration-v2-base ease-v2-standard",
          calculating && "opacity-40",
        )}
      >
        {requirements.characterExp > 0 ? (
          <span className="flex items-center gap-2 pr-1">
            <ResourceThumb
              itemUid={CHARACTER_EXP_REPORTS[0].uid}
              rarity={CHARACTER_EXP_REPORTS[0].rarity}
              name="활동 보고서"
              size="md"
            />
            <span className="leading-tight">
              <span className="block text-xs text-v2-fg-secondary">레벨 경험치</span>
              <span className="block text-xs font-semibold tabular-nums text-v2-fg">
                {requirements.characterExp.toLocaleString()}
              </span>
            </span>
          </span>
        ) : null}
        {requirements.credit > 0 ? (
          <span className="flex items-center gap-2 pr-1">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-md bg-v2-inset text-xs font-bold text-v2-fg-secondary"
            >
              Cr
            </span>
            <span className="leading-tight">
              <span className="block text-xs text-v2-fg-secondary">크레딧</span>
              <span className="block text-xs font-semibold tabular-nums text-v2-fg">
                {requirements.credit.toLocaleString()}
              </span>
            </span>
          </span>
        ) : null}
        <span className="flex flex-wrap gap-2.5">
          {requirements.items.map((item) => (
            <ResourceThumb
              key={item.uid}
              itemUid={item.uid}
              resourceType={item.type}
              rarity={item.rarity}
              name={item.name}
              quantity={item.amount}
              nameTooltip
              size="md"
            />
          ))}
        </span>
      </div>
    </div>
  );
}

// The toggle and the list stacked, for the stacked card.
export function GrowthResourceRequirements(props: Omit<PartProps, "disclosure">) {
  const disclosure = useGrowthResourceDisclosure();
  const shown = isGrowthResourceListShown(props.requirements, disclosure);
  return (
    <div className="min-w-0">
      <GrowthResourceToggle {...props} disclosure={disclosure} />
      {shown ? (
        <div className="pt-1.5 pb-1">
          <GrowthResourceList {...props} disclosure={disclosure} />
        </div>
      ) : null}
    </div>
  );
}

function CalculatingStatus() {
  return (
    <p role="status" className="flex min-h-6 items-center gap-1.5 text-xs whitespace-nowrap text-v2-fg-secondary">
      <ArrowPathIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      재화 계산 중...
    </p>
  );
}
