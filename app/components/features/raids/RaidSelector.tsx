import { Transition } from "@headlessui/react";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/16/solid";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { FilterButtons } from "~/components/primitives";
import type { Attack, Defense } from "~/graphql/graphql";
import { defenseTypeLocale, difficultyLocale, raidTypeLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import type { RaidType, Terrain } from "~/models/content.d";
import { raidTypeToParam } from "~/models/raid";
import { sanitizeClassName } from "~/prophandlers";

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
        className="w-full rounded-lg border border-neutral-200 text-left shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <div className="flex items-center">
          <div className="flex-1 min-w-0">{currentRaid && <RaidSelectorItem raid={currentRaid} />}</div>
          <ChevronDownIcon
            className={sanitizeClassName(`
              mr-3 size-5 flex-shrink-0 text-neutral-500 transition-transform
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
        className="mt-4 mb-2 w-full bg-white dark:bg-neutral-800 xl:absolute xl:top-full xl:left-0 xl:z-30"
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
        <div className="max-h-64 xl:max-h-96 overflow-y-auto no-scrollbar mt-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg">
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

const defenseTypeColorClass: Record<Defense, string> = {
  light: "bg-red-500",
  heavy: "bg-yellow-500",
  special: "bg-blue-500",
  elastic: "bg-purple-500",
  composite: "bg-green-600",
  normal: "bg-gray-500",
};

function RaidSelectorItem({ raid }: { raid: SelectableRaid }) {
  return (
    <div className="group relative bg-white hover:bg-neutral-100 first:rounded-t-lg last:rounded-b-lg dark:bg-neutral-900 dark:hover:bg-neutral-800">
      <img
        src={bossImageUrl(raid.raidBoss.uid)}
        alt="보스 이미지"
        className="absolute top-0 right-0 h-full object-cover"
      />
      <div className="relative p-3 xl:p-4 w-full bg-white/90 dark:bg-neutral-900/80 group-hover:to-neutral-100/90 dark:group-hover:to-neutral-700/80 rounded-lg transition-colors">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {raidTypeLocale[raid.raidType as RaidType] ?? raid.raidType} #{raid.seasonIndex} ·{" "}
              {terrainLocale[raid.terrain]}
            </p>
            <p className="font-bold text-sm xl:text-base">{raid.raidBoss.name}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {raid.startAt ? dayjs(raid.startAt).format("YYYY.MM.DD") : "-"} ~{" "}
              {raid.endAt ? dayjs(raid.endAt).format("YYYY.MM.DD") : "-"}
            </p>
          </div>
          <div className="flex flex-col gap-1 items-start flex-shrink-0">
            {raid.defenseTypes.map(({ defenseType, difficulty }) => (
              <div key={defenseType} className="flex items-center gap-1.5 flex-nowrap">
                <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {difficulty ? difficultyLocale[difficulty as keyof typeof difficultyLocale] : "방어 타입"}
                </span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-semibold text-white whitespace-nowrap flex-shrink-0 ${defenseTypeColorClass[defenseType]}`}
                >
                  {defenseTypeLocale[defenseType]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
