import { Transition } from "@headlessui/react";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { FilterButtons } from "~/components/primitives";
import { raidTypeToParam } from "~/domain/raid";
import type { Attack, Defense } from "~/graphql/graphql";
import { compareInstantDesc, nowUtcIso, type UtcIsoString } from "~/lib/date-time";
import { cn } from "~/lib/utils";
import type { Terrain } from "~/models/content.d";
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
  belowSelector?: ReactNode;
};

export default function RaidSelector({ raids, currentRaid, belowSelector }: RaidSelectorProps) {
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
        className="group relative w-full cursor-pointer rounded-lg text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <div className="relative">
          {currentRaid && (
            <RaidListItem
              raid={currentRaid}
              reserveRightAccessorySpace
              className="shadow-sm group-hover:shadow-md"
              contentClassName="group-hover:bg-card/80"
            />
          )}
          <ChevronDownIcon
            className={cn(`
              absolute top-1/2 right-3 size-5 -translate-y-1/2 flex-shrink-0 text-muted-foreground transition group-hover:text-foreground
              ${isOpen ? "rotate-180" : ""}
            `)}
          />
        </div>
      </button>

      {!isOpen ? belowSelector : null}

      <Transition
        show={isOpen}
        as="div"
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-100 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
        className="mt-1 mb-2 w-full overflow-hidden rounded-xl bg-card text-card-foreground shadow-xl shadow-black/10 dark:shadow-black/40 lg:absolute lg:top-full lg:left-2 lg:z-30 lg:w-[calc(100%-1rem)]"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <FilterButtons
            buttonProps={[
              { text: "총력전", active: raidType === "total_assault", onToggle: () => setRaidType("total_assault") },
              { text: "대결전", active: raidType === "elimination", onToggle: () => setRaidType("elimination") },
            ]}
            exclusive
            atLeastOne
            size="sm"
            className="my-0"
          />
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="총력전 선택 닫기"
          >
            <XMarkIcon className="size-5" strokeWidth={2} />
          </button>
        </div>
        <div className="no-scrollbar max-h-64 divide-y divide-border/60 overflow-x-hidden overflow-y-auto border-t border-border/60 lg:max-h-96">
          {selectableRaids.map((raid) => {
            const isCurrent =
              currentRaid !== null &&
              raid.raidType === currentRaid.raidType &&
              raid.seasonIndex === currentRaid.seasonIndex;
            return (
              <Link
                to={`/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}`}
                key={raid.uid}
                className="group block cursor-pointer"
                onClick={() => setIsOpen(false)}
                aria-current={isCurrent ? "page" : undefined}
              >
                <RaidListItem
                  raid={raid}
                  className="rounded-none bg-transparent shadow-none hover:bg-transparent dark:shadow-none"
                  imageClassName="w-full scale-105 opacity-20 blur-[1px]"
                  contentClassName={cn(
                    "rounded-none bg-transparent bg-linear-to-r from-card from-40% via-card/90 via-70% to-card/35 px-3 py-2.5 group-hover:from-muted/80 group-hover:via-muted/60 group-hover:to-muted/30",
                    isCurrent &&
                      "before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']",
                  )}
                />
              </Link>
            );
          })}
        </div>
      </Transition>
    </div>
  );
}
