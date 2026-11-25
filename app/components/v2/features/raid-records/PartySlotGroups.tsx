import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

// A party's portraits under their STRIKER and SPECIAL labels. On a phone the two groups share one row when they fit.
export function PartySlotGroups({ strikers, specials }: { strikers: ReactNode; specials: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3 sm:gap-x-6">
      <SlotGroup label="STRIKER">{strikers}</SlotGroup>
      <SlotGroup label="SPECIAL">{specials}</SlotGroup>
    </div>
  );
}

function SlotGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p aria-hidden="true" className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-v2-fg-tertiary">
        {label}
      </p>
      <ul aria-label={label} className="flex flex-wrap gap-1.5 sm:gap-2">
        {children}
      </ul>
    </div>
  );
}

// An empty slot of a saved party, kept in place: which slots are left empty is part of the party.
export function EmptyPartySlot({ className }: { className?: string }) {
  return (
    <li className={cn("shrink-0", className)}>
      <span aria-hidden="true" className="block aspect-[5/6] w-full rounded-md bg-v2-inset" />
      <span className="sr-only">비어 있음</span>
    </li>
  );
}
