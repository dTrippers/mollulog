import { Transition } from "@headlessui/react";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FilterButtons } from "~/components/primitives";
import type { Attack, Defense } from "~/graphql/graphql";
import { type UtcIsoString, compareInstantDesc, nowUtcIso } from "~/lib/date-time";
import type { RaidType, Terrain } from "~/models/content.d";
import { raidTypeToParam } from "~/domain/raid";
import { cn } from "~/lib/utils";
import RaidListItem from "./RaidListItem";

type SelectableRaid = {
  uid: string;
  raidType: string;
  raidBoss: { uid: string; name: string };
  seasonIndex: number;
  startAt: UtcIsoString | Date | null;
  endAt: UtcIsoString | Date | null;
  terrain: Terrain;
  attackType: Attack | null;
  jpSchedule: { uid: string; seasonIndex: number } | null;
  defenseTypes: { defenseType: Defense; difficulty: string | null }[];
};

type RaidSelectorProps = {
  raids: SelectableRaid[];
  currentRaid: SelectableRaid | null;
};

export default function RaidSelector({ raids, currentRaid }: RaidSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [raidType, setRaidType] = useState<string>(currentRaid?.raidType ?? "total_assault");

  const selectableRaids = useMemo(() => {
    const fallbackNow = nowUtcIso();
    return [...raids]
      .filter(
        (raid) =>
          raid.startAt != null &&
          raid.raidType === raidType &&
          (raid.jpSchedule !== null ||
            (currentRaid !== null &&
              raid.raidType === currentRaid.raidType &&
              raid.seasonIndex === currentRaid.seasonIndex)),
      )
      .sort((a, b) => compareInstantDesc(a.startAt ?? fallbackNow, b.startAt ?? fallbackNow));
  }, [currentRaid, raids, raidType]);

  return (
    <div className="relative w-full">
      <button
        type="button"
        className="group relative w-full text-left"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <div className="relative">
          {currentRaid && <RaidListItem raid={currentRaid} reserveRightAccessorySpace className="shadow-sm" />}
          <ChevronDownIcon
            className={cn(`
              absolute top-1/2 right-3 size-5 -translate-y-1/2 flex-shrink-0 text-muted-foreground transition-transform
              ${isOpen ? "rotate-180" : ""}
            `)}
          />
        </div>
      </button>

      <Transition
        show={isOpen}
        as="div"
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-100 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
        className="mt-4 mb-2 w-full rounded-lg bg-popover p-2 text-popover-foreground shadow-lg lg:absolute lg:top-full lg:left-0 lg:z-30"
      >
        <div className="flex items-center justify-between">
          <FilterButtons
            buttonProps={[
              { text: "총력전", active: raidType === "total_assault", onToggle: () => setRaidType("total_assault") },
              { text: "대결전", active: raidType === "elimination", onToggle: () => setRaidType("elimination") },
            ]}
            exclusive
            atLeastOne
          />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="총력전 선택 닫기"
          >
            <XMarkIcon className="size-6" strokeWidth={2} />
          </button>
        </div>
        <div className="no-scrollbar mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg lg:max-h-96">
          {selectableRaids.map((raid) => (
            <Link
              to={`/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}`}
              key={raid.uid}
              className="block rounded-lg"
              onClick={() => setIsOpen(false)}
            >
              <RaidListItem raid={raid} />
            </Link>
          ))}
        </div>
      </Transition>
    </div>
  );
}
