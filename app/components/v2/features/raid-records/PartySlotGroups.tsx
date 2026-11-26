import { UserIcon } from "@heroicons/react/24/outline";
import { Children, type CSSProperties, type ReactNode } from "react";
import { cn } from "~/lib/utils";

// The width of one slot. On a phone the slots share the row's full width; from the sm breakpoint each is 64px.
export const partySlotWidthClassName = "min-w-0 sm:w-16";

// The most slots one phone row holds. A ten-student party puts its groups on two rows of six columns.
const MOBILE_ROW_SLOTS = 6;

// A party's portraits under their STRIKER and SPECIAL labels.
export function PartySlotGroups({ strikers, specials }: { strikers: ReactNode; specials: ReactNode }) {
  const strikerCount = Children.count(strikers);
  const specialCount = Children.count(specials);
  const oneRow = strikerCount + specialCount <= MOBILE_ROW_SLOTS;
  return (
    <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3 sm:gap-x-6">
      <SlotGroup label="STRIKER" count={strikerCount} oneRow={oneRow}>
        {strikers}
      </SlotGroup>
      <SlotGroup label="SPECIAL" count={specialCount} oneRow={oneRow}>
        {specials}
      </SlotGroup>
    </div>
  );
}

function SlotGroup({
  label,
  count,
  oneRow,
  children,
}: {
  label: string;
  count: number;
  oneRow: boolean;
  children: ReactNode;
}) {
  // In one phone row, a group grows by its slot count from a basis of its own gaps (0.375rem each), so every slot of
  // both groups ends up the same width. On two rows, each group takes a row of six columns.
  const style = {
    "--slot-group-flex": oneRow ? `${count} 1 calc(${Math.max(count - 1, 0)} * 0.375rem)` : "1 1 100%",
    "--slot-group-columns": `repeat(${oneRow ? count : MOBILE_ROW_SLOTS}, minmax(0, 1fr))`,
  } as CSSProperties;
  return (
    <div style={style} className="min-w-0 flex-(--slot-group-flex) sm:flex-none">
      <p aria-hidden="true" className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-v2-fg-tertiary">
        {label}
      </p>
      <ul aria-label={label} className="grid grid-cols-(--slot-group-columns) gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
        {children}
      </ul>
    </div>
  );
}

// An empty slot of a saved party, kept in place: which slots are left empty is part of the party. It shows a person
// icon, as a round portrait does for a missing student.
export function EmptyPartySlot({ className }: { className?: string }) {
  return (
    <li className={cn("shrink-0", className)}>
      <span
        aria-hidden="true"
        className="flex aspect-[5/6] w-full items-center justify-center rounded-md bg-v2-inset text-v2-fg-tertiary"
      >
        <UserIcon className="size-5 sm:size-6" />
      </span>
      <span className="sr-only">비어 있음</span>
    </li>
  );
}
