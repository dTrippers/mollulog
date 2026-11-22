import { ChevronDownIcon, ClockIcon } from "@heroicons/react/16/solid";
import { useId, useState } from "react";
import type { WalkthroughParty, WalkthroughTimelineDocument } from "~/domain/walkthrough-timeline";
import { walkthroughPartyLabel } from "~/domain/walkthrough-mentions";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { IconButton } from "../../primitives/IconButton";
import { PartyGrowthReadOnlyTable } from "../raid-records/RaidPartyView";
import { WalkthroughPartyThumbs, WalkthroughTimelineSteps, type WalkthroughStudentsByUid } from "./walkthrough-parts";

export function walkthroughPartyAnchorId(party: Pick<WalkthroughParty, "uid">): string {
  return `party-${party.uid}`;
}

function hasGrowthDetails(party: WalkthroughParty): boolean {
  return party.units.some(
    (unit) =>
      unit.studentUid &&
      Object.entries(unit.snapshot ?? {}).some(([field, value]) => field !== "tier" && value !== undefined),
  );
}

// One party of a guide, read-only: the portraits with their star tier and starting skill order, the growth values on
// request, and the party's timeline folded into the card.
export function WalkthroughPartyDetailCard({
  party,
  partyIndex,
  partySize,
  studentsByUid,
  defaultTimelineExpanded,
}: {
  party: WalkthroughParty;
  partyIndex: number;
  partySize: WalkthroughTimelineDocument["partySize"];
  studentsByUid: WalkthroughStudentsByUid;
  defaultTimelineExpanded: boolean;
}) {
  const [growthOpen, setGrowthOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(defaultTimelineExpanded);
  const growthId = useId();
  const timelineId = useId();
  const title = walkthroughPartyLabel(partyIndex);
  const filledUnits = party.units.filter((unit): unit is typeof unit & { studentUid: string } =>
    Boolean(unit.studentUid),
  );
  return (
    <section
      id={walkthroughPartyAnchorId(party)}
      aria-labelledby={`${timelineId}-title`}
      className="flex min-w-0 scroll-mt-[calc(var(--mobile-header-height,0px)+1rem)] flex-col gap-4 rounded-lg bg-v2-surface p-v2-block-p"
    >
      <h3 id={`${timelineId}-title`} className="text-sm font-semibold text-v2-fg">
        {title}
      </h3>
      <WalkthroughPartyThumbs
        party={party}
        partySize={partySize}
        studentsByUid={studentsByUid}
        label={`${title} 편성`}
      />
      {hasGrowthDetails(party) ? (
        <div className="-mt-1 flex min-w-0 flex-col gap-2">
          <button
            type="button"
            aria-expanded={growthOpen}
            aria-controls={growthId}
            onClick={() => setGrowthOpen((open) => !open)}
            className={cn(
              "inline-flex w-fit cursor-pointer items-center gap-1 rounded-md py-1 text-xs font-medium text-v2-fg-secondary hover:text-v2-fg v2-interaction-transition",
              v2FocusRing,
            )}
          >
            성장도 자세히 보기
            <ChevronDownIcon
              className={cn("size-4 motion-safe:transition-transform duration-v2-base ease-v2-standard", growthOpen && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          <div id={growthId} hidden={!growthOpen}>
            {growthOpen ? (
              <PartyGrowthReadOnlyTable
                units={filledUnits.map((unit) => ({
                  slot: unit.slot,
                  studentUid: unit.studentUid,
                  assist: false,
                  snapshot: unit.snapshot ?? {},
                }))}
                title={title}
                studentsByUid={studentsByUid}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      {party.steps.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <ClockIcon className="size-4 text-v2-fg-secondary" aria-hidden="true" />
            <span className="text-sm font-semibold text-v2-fg">타임라인</span>
            <span className="text-sm text-v2-fg-tertiary tabular-nums">{party.steps.length}단계</span>
            <IconButton
              icon={ChevronDownIcon}
              label={`${title} 타임라인 ${timelineOpen ? "접기" : "펼치기"}`}
              aria-expanded={timelineOpen}
              aria-controls={timelineId}
              onClick={() => setTimelineOpen((open) => !open)}
              className={cn(
                "ml-auto [&_svg]:duration-v2-base [&_svg]:ease-v2-standard [&_svg]:motion-safe:transition-transform",
                timelineOpen && "[&_svg]:rotate-180",
              )}
            />
          </div>
          <div id={timelineId} hidden={!timelineOpen}>
            <WalkthroughTimelineSteps steps={party.steps} studentsByUid={studentsByUid} label={`${title} 타임라인`} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
