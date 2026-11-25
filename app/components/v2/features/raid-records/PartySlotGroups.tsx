import { Children, type ReactNode } from "react";

// A party's portraits under their STRIKER and SPECIAL labels. On a phone the two groups share one row when they fit.
export function PartySlotGroups({ strikers, specials }: { strikers: ReactNode; specials: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3 sm:gap-x-6">
      <SlotGroup label="STRIKER">{strikers}</SlotGroup>
      <SlotGroup label="SPECIAL">{specials}</SlotGroup>
    </div>
  );
}

// A group with no portraits (a saved party whose specials are all empty) is left out with its label.
function SlotGroup({ label, children }: { label: string; children: ReactNode }) {
  if (Children.count(children) === 0) return null;
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
