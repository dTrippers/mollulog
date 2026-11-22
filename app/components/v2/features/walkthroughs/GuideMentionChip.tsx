import { useId, useRef, useState } from "react";
import { Link } from "react-router";
import type { GuideMentionKind } from "~/domain/guide-body";
import {
  resolveWalkthroughMention,
  type WalkthroughMentionTarget,
  walkthroughMentionTargetLabel,
} from "~/domain/walkthrough-mentions";
import type { WalkthroughParty, WalkthroughTimelineDocument } from "~/domain/walkthrough-timeline";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Popover } from "../../primitives/Popover";
import { RoundStudentImage } from "../students/RoundStudentImage";
import {
  PartyFaceStack,
  TierBandLabel,
  tierMeaning,
  WalkthroughPartyThumbs,
  type WalkthroughStudentsByUid,
  walkthroughStudentName,
} from "./walkthrough-parts";

export type GuideMentionContext = {
  parties: readonly WalkthroughParty[];
  partySize: WalkthroughTimelineDocument["partySize"];
  studentsByUid: WalkthroughStudentsByUid;
  // Where "편성으로 이동" goes for a party, or null where the formation is not on the page.
  partyHref: ((party: WalkthroughParty) => string) | null;
};

export function resolveGuideMention(context: GuideMentionContext, kind: GuideMentionKind, id: string) {
  return resolveWalkthroughMention(kind, id, context.parties, (uid) => {
    const student = context.studentsByUid.get(uid);
    return student ? walkthroughStudentName(context.studentsByUid, uid) : undefined;
  });
}

const chipClassName =
  "inline-flex max-w-full items-center gap-1 rounded-full py-px pr-2 align-[-2px] text-[0.8125rem] leading-5 font-semibold whitespace-nowrap";

// The look of a mention, shared by the body on the detail page and the editor. A party is its first faces and name on
// the accent tint; a student is one face and the name on the inset fill; a target that no longer exists is its own
// muted state with no faces.
export function GuideMentionChipFace({ target, expanded = false }: { target: WalkthroughMentionTarget; expanded?: boolean }) {
  const label = walkthroughMentionTargetLabel(target);
  if (target.kind === "missing") {
    return <span className={cn(chipClassName, "bg-v2-inset pl-2 font-medium text-v2-fg-tertiary")}>{label}</span>;
  }
  if (target.kind === "party") {
    return (
      <span
        className={cn(
          chipClassName,
          "pl-[3px]",
          expanded ? "bg-v2-accent-solid text-v2-on-accent-solid" : "bg-v2-accent-subtle text-v2-fg",
        )}
      >
        <PartyFaceStack party={target.party} size="xs" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className={cn(chipClassName, "pl-0.5", expanded ? "bg-v2-filled-hover text-v2-fg" : "bg-v2-inset text-v2-fg")}>
      <RoundStudentImage studentUid={target.studentUid} size="sm" className="size-4" />
      <span>{label}</span>
    </span>
  );
}

// A mention in a rendered body. A party or student opens a small preview; a missing target is plain text.
export function GuideMentionChip({
  kind,
  id,
  context,
}: {
  kind: GuideMentionKind;
  id: string;
  context: GuideMentionContext;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const target = resolveGuideMention(context, kind, id);
  if (target.kind === "missing") return <GuideMentionChipFace target={target} />;
  const label = walkthroughMentionTargetLabel(target);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={cn("inline cursor-pointer rounded-full align-baseline", v2FocusRing)}
      >
        <GuideMentionChipFace target={target} expanded={open} />
      </button>
      <Popover open={open} label={label} onClose={() => setOpen(false)} returnFocusRef={triggerRef} className="w-auto max-w-[min(26rem,calc(100vw-2rem))]">
        <div id={panelId}>
          {target.kind === "party" ? (
            <PartyPreview target={target} context={context} onNavigate={() => setOpen(false)} />
          ) : (
            <StudentPreview target={target} context={context} onNavigate={() => setOpen(false)} />
          )}
        </div>
      </Popover>
    </>
  );
}

function PartyPreview({
  target,
  context,
  onNavigate,
}: {
  target: Extract<WalkthroughMentionTarget, { kind: "party" }>;
  context: GuideMentionContext;
  onNavigate: () => void;
}) {
  const label = walkthroughMentionTargetLabel(target);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="text-sm font-semibold text-v2-fg">{label}</p>
        {context.partyHref ? (
          <Link
            to={context.partyHref(target.party)}
            onClick={onNavigate}
            className={cn("ml-auto text-xs font-medium text-v2-link hover:underline", v2FocusRing)}
          >
            편성으로 이동
          </Link>
        ) : null}
      </div>
      <WalkthroughPartyThumbs
        party={target.party}
        partySize={context.partySize}
        studentsByUid={context.studentsByUid}
        size="small"
        label={`${label} 편성`}
      />
    </div>
  );
}

function StudentPreview({
  target,
  context,
  onNavigate,
}: {
  target: Extract<WalkthroughMentionTarget, { kind: "student" }>;
  context: GuideMentionContext;
  onNavigate: () => void;
}) {
  const placements = context.parties.flatMap((party, partyIndex) => {
    const unit = party.units.find((candidate) => candidate.studentUid === target.studentUid);
    return unit ? [{ partyIndex, tier: unit.snapshot?.tier }] : [];
  });
  return (
    <div className="flex min-w-56 items-center gap-3">
      <RoundStudentImage studentUid={target.studentUid} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-v2-fg">{target.name}</p>
        {placements.length > 0 ? (
          <ul className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-v2-fg-secondary">
            {placements.map(({ partyIndex, tier }) => (
              <li key={partyIndex} className="inline-flex items-center gap-1">
                <span>파티 {partyIndex + 1}</span>
                {tier !== undefined ? (
                  <span className="inline-flex" role="img" aria-label={tierMeaning(tier)}>
                    <span aria-hidden="true">
                      <TierBandLabel tier={tier} />
                    </span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <Link
        to={`/students/${target.studentUid}`}
        onClick={onNavigate}
        className={cn("shrink-0 text-xs font-medium text-v2-link hover:underline", v2FocusRing)}
      >
        학생 정보
      </Link>
    </div>
  );
}
