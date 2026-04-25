import { Transition } from "@headlessui/react";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { AttributeBadge, FilterButtons } from "~/components/primitives";
import type { Attack, Defense } from "~/graphql/graphql";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, raidTypeLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { RaidType, Terrain } from "~/models/content.d";
import { raidTypeToParam } from "~/models/raid";
import { sanitizeClassName } from "~/prophandlers";
import RaidCard from "./RaidCard";

type SelectableRaid = {
  uid: string;
  raidType: string;
  raidBoss: { uid: string; name: string };
  seasonIndex: number;
  startAt: string | Date | null;
  endAt: string | Date | null;
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
      .sort((a, b) => dayjs(b.startAt).diff(dayjs(a.startAt)));
  }, [currentRaid, raids, raidType]);

  return (
    <div className="relative w-full">
      <button
        type="button"
        className="group relative w-full rounded-lg text-left shadow-lg"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <div className="relative">
          {currentRaid && <RaidSelectorItem raid={currentRaid} selected />}
          <ChevronDownIcon
            className={sanitizeClassName(`
              absolute top-1/2 right-3 size-5 -translate-y-1/2 flex-shrink-0 text-neutral-500 transition-transform
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
        className="mt-4 mb-2 w-full bg-white dark:bg-neutral-800 lg:absolute lg:top-full lg:left-0 lg:z-30"
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
            className="rounded-md p-1 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            aria-label="총력전 선택 닫기"
          >
            <XMarkIcon className="size-6" strokeWidth={2} />
          </button>
        </div>
        <div className="max-h-64 lg:max-h-96 overflow-y-auto no-scrollbar mt-2 rounded-lg border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {selectableRaids.map((raid) => (
            <Link
              to={`/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}`}
              key={raid.uid}
              onClick={() => setIsOpen(false)}
            >
              <RaidSelectorItem raid={raid} />
            </Link>
          ))}
        </div>
      </Transition>
    </div>
  );
}

function RaidSelectorItem({ raid, selected = false }: { raid: SelectableRaid; selected?: boolean }) {
  if (!selected) {
    return (
      <div className="group relative overflow-hidden bg-white transition-colors hover:bg-neutral-100 first:rounded-t-lg last:rounded-b-lg dark:bg-neutral-900 dark:hover:bg-neutral-800">
        <img
          src={bossImageUrl(raid.raidBoss.uid)}
          alt="보스 이미지"
          className="absolute top-0 right-0 h-full object-cover opacity-70"
          loading="lazy"
        />
        <div className="relative w-full rounded-lg bg-white/90 p-3 transition-colors dark:bg-neutral-900/80">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType} #{raid.seasonIndex} ·{" "}
                {terrainLocale[raid.terrain]}
              </p>
              <p className="truncate text-sm font-bold lg:text-base">{raid.raidBoss.name}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {raid.startAt ? dayjs(raid.startAt).format("YYYY.MM.DD") : "-"} ~{" "}
                {raid.endAt ? dayjs(raid.endAt).format("MM.DD") : "-"}
              </p>
            </div>
            <div className="flex flex-col items-start gap-1">
              {raid.defenseTypes.map(({ defenseType, difficulty }) => (
                <div key={`${defenseType}-${difficulty ?? "none"}`} className="flex items-center gap-1.5">
                  {difficulty && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                      {difficultyLocale[difficulty] ?? difficulty}
                    </span>
                  )}
                  <AttributeBadge text={defenseTypeLocale[defenseType]} color={defenseTypeColor[defenseType]} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <RaidCard
        raid={raid}
        timeLocaleType="absolute"
        showTimeLabel={false}
        showDateRange
        reserveRightAccessorySpace
      />
    </div>
  );
}
