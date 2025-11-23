import { Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { useState, useMemo } from "react";
import { Link } from "react-router";
import { OptionBadge } from "~/components/atoms/student";
import { FilterButtons } from "~/components/molecules/content";
import { terrainLocale, defenseTypeLocale, difficultyLocale, defenseTypeColor } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { AttackType, DefenseType, RaidType, Terrain } from "~/models/content.d";
import { sanitizeClassName } from "~/prophandlers";

type SelectableRaid = {
  uid: string;
  type: RaidType;
  name: string;
  boss: string;
  since: Date;
  until: Date;
  terrain: Terrain;
  attackType: AttackType;
  rankVisible: boolean;
  defenseTypes: { defenseType: DefenseType; difficulty: string | null }[];
};


type RaidSelectorProps = {
  raids: SelectableRaid[];
  currentRaid: SelectableRaid | null;
};

export default function RaidSelector({ raids, currentRaid }: RaidSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [raidType, setRaidType] = useState<RaidType>(currentRaid?.type ?? "total_assault");

  const selectableRaids = useMemo(() => {
    return raids.sort((a, b) => dayjs(b.since).diff(dayjs(a.since))).filter((raid) => raid.type === raidType && raid.rankVisible);
  }, [raids, raidType]);

  return (
    <div className="relative">
      <div
        className="border border-neutral-200 dark:border-neutral-700 dark:bg-neutral-900 rounded-lg shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
      >
        {currentRaid && (
          <RaidSelectorItem raid={currentRaid} />
        )}
      </div>

      <Transition
        show={isOpen}
        as="div"
        enter="transition duration-200 ease-out"
        enterFrom="opacity-0 scale-95"
        enterTo="opacity-100 scale-100"
        leave="transition duration-100 ease-in"
        leaveFrom="opacity-100 scale-100"
        leaveTo="opacity-0 scale-95"
        className="mt-4 mb-2 absolute w-full top-full left-0 z-10 bg-white dark:bg-neutral-800"
      >
        <div className="flex items-center justify-between">
          <FilterButtons
            buttonProps={[
              { text: "총력전", active: raidType === "total_assault", onToggle: () => setRaidType("total_assault") },
              { text: "대결전", active: raidType === "elimination", onToggle: () => setRaidType("elimination") },
            ]}
            exclusive atLeastOne
          />
          <XMarkIcon className="size-6 cursor-pointer" strokeWidth={2} onClick={() => setIsOpen(false)} />
        </div>
        <div className="max-h-64 xl:max-h-96 overflow-y-auto no-scrollbar mt-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg">
          {selectableRaids.map((raid) => (
            <Link to={`/raids/${raid.uid}`} key={raid.uid} onClick={() => setIsOpen(false)}>
              <RaidSelectorItem raid={raid} />
            </Link>
          ))}
        </div>
      </Transition>
    </div>
  );
}

function RaidSelectorItem({ raid }: { raid: SelectableRaid }) {
  return (
    <div className="relative cursor-pointer bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 first:rounded-t-lg last:rounded-b-lg group">
      <img src={bossImageUrl(raid.boss)} alt="보스 이미지" className="absolute top-0 right-0 h-full object-cover" />
      <div className={sanitizeClassName(`
        relative p-3 xl:p-4 pr-12 w-full bg-white/90 dark:bg-neutral-900/80
        group-hover:to-neutral-100/90 dark:group-hover:to-neutral-700/80 rounded-lg transition-colors
      `)}>
        <p className="font-bold text-sm xl:text-base">
          {raid.name}
        </p>
        <p className="text-xs xl:text-sm text-neutral-500 dark:text-neutral-400">
          {dayjs(raid.since).format("YYYY.MM.DD")} ~ {dayjs(raid.until).format("YYYY.MM.DD")}
        </p>

        <div className="mt-2 flex gap-1 flex-wrap">
          <OptionBadge text={terrainLocale[raid.terrain]} />
          {raid.defenseTypes.map(({ defenseType, difficulty }) => (
            <OptionBadge
              key={defenseType}
              text={`${defenseTypeLocale[defenseType].substring(0, raid.type === "elimination" ? 2 : undefined)}${difficulty ? ` · ${difficultyLocale[difficulty].substring(0, raid.type === "elimination" ? 1 : undefined)}` : ""}`}
              color={defenseTypeColor[defenseType]}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
