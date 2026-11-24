import { useState } from "react";
import type { RaidRecordParty, RaidRecordSnapshotField } from "~/domain/raid-record";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { StudentThumb } from "../students/StudentThumb";
import { splitVisibleStudentName } from "../students/split-student-name";
import { formatRaidStudentName, type RaidPartyStudent } from "./raid-party-student";
import { useBundledGrowthTable } from "./use-bundled-growth-table";

type GrowthColumn = { field: RaidRecordSnapshotField; label: string };
type GrowthBundle = { key: string; label: string; columns: GrowthColumn[] };

const BASIC: GrowthBundle = {
  key: "basic",
  label: "기본 정보",
  columns: [
    { field: "tier", label: "성급" },
    { field: "level", label: "Lv" },
    { field: "weaponLevel", label: "고유무기" },
  ],
};
const SKILL: GrowthBundle = {
  key: "skill",
  label: "스킬",
  columns: [
    { field: "skillEx", label: "EX" },
    { field: "skillNormal", label: "기본" },
    { field: "skillEnhanced", label: "강화" },
    { field: "skillSub", label: "서브" },
  ],
};
const EQUIPMENT_TIER: GrowthColumn[] = [
  { field: "equip1", label: "1" },
  { field: "equip2", label: "2" },
  { field: "equip3", label: "3" },
];
const GEAR: GrowthColumn = { field: "equipSpecial", label: "애용품" };
const ABILITY: GrowthBundle = {
  key: "ability",
  label: "능력 개방",
  columns: [
    { field: "abilityHp", label: "체력" },
    { field: "abilityAtk", label: "공격력" },
    { field: "abilityHeal", label: "치유력" },
  ],
};

// Side-by-side: every value in one row. 애용품 has its own box beside the equipment tiers.
const RAID_GROWTH_WIDE_BUNDLES: GrowthBundle[] = [
  BASIC,
  SKILL,
  { key: "equipment", label: "장비 티어", columns: EQUIPMENT_TIER },
  { key: "gear", label: "", columns: [GEAR] },
  ABILITY,
];

// Stacked: one bundle at a time, the way the "모집한 학생" growth table stacks.
const RAID_GROWTH_STACKED_BUNDLES: GrowthBundle[] = [
  BASIC,
  SKILL,
  { key: "equipment", label: "장비", columns: [...EQUIPMENT_TIER, GEAR] },
  ABILITY,
];

function TierValue({ tier }: { tier: number }) {
  if (tier <= 5) return <span>★{tier}</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      <img src="/icons/exclusive_weapon.png" alt="고유무기" className="size-3.5 shrink-0" />
      {tier - 5}
    </span>
  );
}

// A saved party, read-only: its slots and the growth values recorded with it.
export function RaidPartyView({
  party,
  title,
  studentsByUid,
}: {
  party: RaidRecordParty;
  title: string;
  studentsByUid: ReadonlyMap<string, Pick<RaidPartyStudent, "name">>;
}) {
  const strikers = party.units.filter((unit) => unit.slot < 4);
  const specials = party.units.filter((unit) => unit.slot >= 4);
  const renderThumb = (unit: RaidRecordParty["units"][number]) => {
    const student = studentsByUid.get(unit.studentUid);
    const { name, variant } = splitVisibleStudentName(student?.name ?? "알 수 없는 학생");
    return (
      <li key={unit.slot} className="w-14 sm:w-16">
        <StudentThumb
          studentUid={unit.studentUid}
          name={name}
          variant={variant}
          recruitmentLabel={unit.assist ? "조력자" : undefined}
        />
      </li>
    );
  };
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-lg border border-v2-divider p-3.5">
      <h3 className="text-sm font-semibold text-v2-fg">{title}</h3>
      <div className="flex min-w-0 flex-wrap items-start gap-x-2.5 gap-y-3">
        <div>
          <p aria-hidden="true" className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-v2-fg-tertiary">
            STRIKER
          </p>
          <ul aria-label="STRIKER" className="flex gap-2">
            {strikers.map(renderThumb)}
          </ul>
        </div>
        <span aria-hidden="true" className="mx-1 hidden w-px self-stretch bg-v2-divider sm:block" />
        <div>
          <p aria-hidden="true" className="mb-1.5 text-[0.6875rem] font-semibold tracking-wide text-v2-fg-tertiary">
            SPECIAL
          </p>
          <ul aria-label="SPECIAL" className="flex gap-2">
            {specials.map(renderThumb)}
          </ul>
        </div>
      </div>
      <PartyGrowthReadOnlyTable units={party.units} title={title} studentsByUid={studentsByUid} />
    </section>
  );
}

// The growth values of a saved party's students, read-only. Stacks into one bundle at a time on narrow widths.
export function PartyGrowthReadOnlyTable({
  units,
  title,
  studentsByUid,
}: {
  units: readonly Pick<RaidRecordParty["units"][number], "slot" | "studentUid" | "assist" | "snapshot">[];
  title: string;
  studentsByUid: ReadonlyMap<string, Pick<RaidPartyStudent, "name">>;
}) {
  const { ref: tableBoxRef, bundled: stacked } = useBundledGrowthTable();
  const [bundleKey, setBundleKey] = useState(RAID_GROWTH_STACKED_BUNDLES[0].key);
  const bundles = stacked
    ? RAID_GROWTH_STACKED_BUNDLES.filter((bundle) => bundle.key === bundleKey)
    : RAID_GROWTH_WIDE_BUNDLES;
  const nameOf = (uid: string) => {
    const student = studentsByUid.get(uid);
    return student ? formatRaidStudentName(student.name) : "알 수 없는 학생";
  };
  const display = (field: RaidRecordSnapshotField, value: number | undefined) =>
    value === undefined ? (
      <span className="text-v2-fg-tertiary">–</span>
    ) : field === "tier" ? (
      <TierValue tier={value} />
    ) : (
      value
    );
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {stacked ? (
        <fieldset className="flex min-w-0 gap-1 overflow-x-auto border-0 border-b border-v2-divider p-0">
          <legend className="sr-only">성장 정보 묶음</legend>
          {RAID_GROWTH_STACKED_BUNDLES.map((bundle) => (
            <button
              key={bundle.key}
              type="button"
              aria-pressed={bundle.key === bundleKey}
              onClick={() => setBundleKey(bundle.key)}
              className={cn(
                "flex min-h-8 shrink-0 cursor-pointer items-center border-b-2 px-2.5 text-sm whitespace-nowrap",
                bundle.key === bundleKey
                  ? "border-v2-link font-semibold text-v2-fg"
                  : "border-transparent text-v2-fg-secondary hover:text-v2-fg v2-interaction-transition",
                v2FocusRing,
              )}
            >
              {bundle.label}
            </button>
          ))}
        </fieldset>
      ) : null}
      <div ref={tableBoxRef} className="min-w-0 overflow-x-auto">
        <table className="border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
          <caption className="sr-only">{title} 성장 정보</caption>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>
                <span className="sr-only">학생</span>
              </th>
              {bundles.map((bundle) => (
                <th
                  key={bundle.key}
                  scope="colgroup"
                  colSpan={bundle.columns.length}
                  hidden={stacked}
                  className="pl-3 text-center text-[0.6875rem] font-semibold text-v2-fg-secondary"
                >
                  {bundle.label || <span className="sr-only">애용품</span>}
                </th>
              ))}
            </tr>
            <tr>
              {bundles.flatMap((bundle) =>
                bundle.columns.map((column, index) => (
                  <th
                    key={column.field}
                    scope="col"
                    className={cn(
                      index === 0 && "pl-3",
                      "text-center text-[0.6875rem] font-normal whitespace-nowrap text-v2-fg-tertiary",
                    )}
                  >
                    {column.label}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.slot}>
                <th scope="row" className="w-28 max-w-28 text-left font-normal sm:w-36 sm:max-w-36">
                  <span className="flex min-w-0 items-center gap-2">
                    <RoundStudentImage studentUid={unit.studentUid} size="sm" />
                    <span className="min-w-0 truncate text-sm font-semibold text-v2-fg">{nameOf(unit.studentUid)}</span>
                    {unit.assist ? (
                      <span className="inline-flex min-h-[1.125rem] shrink-0 items-center rounded bg-v2-inset px-1.5 text-[0.6875rem] font-semibold text-v2-fg-secondary">
                        조력자
                      </span>
                    ) : null}
                  </span>
                </th>
                {bundles.flatMap((bundle) =>
                  bundle.columns.map((column, index) => (
                    <td
                      key={column.field}
                      className={cn("w-10 text-center text-v2-fg tabular-nums", index === 0 && "pl-3")}
                    >
                      {display(column.field, unit.snapshot[column.field])}
                    </td>
                  )),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
