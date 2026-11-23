import { type CSSProperties, useId, useState } from "react";
import type { RaidRecordSnapshotField } from "~/domain/raid-record";
import { STUDENT_GROWTH_EDIT_RANGES } from "~/domain/student-growth-edit";
import { cn } from "~/lib/utils";
import { SegmentedControl } from "../../primitives/SegmentedControl";
import { useNumberInputFlowNavigation } from "../../primitives/use-number-input-flow-navigation";
import {
  formatRaidStudentName,
  isRaidGrowthFieldApplicable,
  type RaidPartyStudent,
} from "../raid-records/RaidPartyEditor";
import { changedRaidFormFields, type RaidFormUnit, setRaidFormUnitValue } from "../raid-records/raid-record-form-state";
import { GrowthValueInput } from "../students/GrowthValueInput";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { TierInput } from "../students/TierInput";

type GrowthCell = { field: RaidRecordSnapshotField; label: string };
type GrowthGroupKey = "basic" | "skill" | "equipment" | "gear" | "ability";
type GrowthGroup = { key: GrowthGroupKey; label: string; labelHidden?: boolean; cells: GrowthCell[] };

// The groups and column names of the 학생 성장 플래너 table, without 인연, which a guide does not record.
const GROUPS: GrowthGroup[] = [
  {
    key: "basic",
    label: "기본 정보",
    cells: [
      { field: "tier", label: "성급" },
      { field: "level", label: "Lv" },
      { field: "weaponLevel", label: "고유무기" },
    ],
  },
  {
    key: "skill",
    label: "스킬",
    cells: [
      { field: "skillEx", label: "EX" },
      { field: "skillNormal", label: "기본" },
      { field: "skillEnhanced", label: "강화" },
      { field: "skillSub", label: "서브" },
    ],
  },
  {
    key: "equipment",
    label: "장비 티어",
    cells: [
      { field: "equip1", label: "1" },
      { field: "equip2", label: "2" },
      { field: "equip3", label: "3" },
    ],
  },
  { key: "gear", label: "애용품", labelHidden: true, cells: [{ field: "equipSpecial", label: "애용품" }] },
  {
    key: "ability",
    label: "능력 개방",
    cells: [
      { field: "abilityHp", label: "체력" },
      { field: "abilityAtk", label: "공격력" },
      { field: "abilityHeal", label: "치유력" },
    ],
  },
];

type GrowthTab = { key: "basic" | "skill" | "equipment" | "ability"; label: string; groups: GrowthGroupKey[] };

// The planner's tabs on a narrow page.
const TABS: GrowthTab[] = [
  { key: "basic", label: "기본 정보", groups: ["basic"] },
  { key: "skill", label: "스킬", groups: ["skill"] },
  { key: "equipment", label: "장비", groups: ["equipment", "gear"] },
  { key: "ability", label: "능력 개방", groups: ["ability"] },
];

const SKILL_FIELDS: ReadonlySet<RaidRecordSnapshotField> = new Set([
  "skillEx",
  "skillNormal",
  "skillEnhanced",
  "skillSub",
]);

// The planner's cell widths without the step buttons.
function cellWidthRem(cell: GrowthCell): number {
  return cell.field === "tier" ? 3.5 : 2.75;
}

function columnsStyle(cells: readonly GrowthCell[]): CSSProperties {
  return { gridTemplateColumns: cells.map((cell) => `${cellWidthRem(cell)}rem`).join(" ") };
}

const segmentClassName = "rounded-none border-0 bg-transparent focus-visible:-outline-offset-2";
// Forced colors drop the fill that marks a changed value, so the cell also gets a dashed outline there.
const changedClassName =
  "bg-v2-accent-subtle forced-colors:outline-2 forced-colors:outline-offset-[-3px] forced-colors:outline-dashed";

type Row = { unit: RaidFormUnit; slot: number; student: RaidPartyStudent | undefined; name: string };

// The growth values of a party's students, laid out as the 학생 성장 플래너 table: one row per student, the values of a
// group side by side in one box. A narrow page shows one group at a time, as the planner does. 성급 is required; the
// rest may stay empty.
export function WalkthroughGrowthTable({
  slots,
  title,
  studentsByUid,
  stacked,
  missingTier,
  onChange,
}: {
  slots: readonly (RaidFormUnit | null)[];
  title: string;
  studentsByUid: ReadonlyMap<string, RaidPartyStudent>;
  stacked: boolean;
  // A save was refused because a student of this party has no 성급.
  missingTier: boolean;
  onChange: (slot: number, unit: RaidFormUnit) => void;
}) {
  const [tabKey, setTabKey] = useState<GrowthTab["key"]>("basic");
  const tab = TABS.find((candidate) => candidate.key === tabKey) ?? TABS[0];
  const groups = stacked ? GROUPS.filter((group) => tab.groups.includes(group.key)) : GROUPS;
  const { getInputProps } = useNumberInputFlowNavigation();
  const changedLegendId = useId();
  const rows: Row[] = slots.flatMap((unit, slot) => {
    if (!unit) return [];
    const student = studentsByUid.get(unit.studentUid);
    return [{ unit, slot, student, name: student ? formatRaidStudentName(student.name) : "알 수 없는 학생" }];
  });
  const anyChanged = rows.some(({ unit }) => changedRaidFormFields(unit).size > 0);
  const headerCell = "text-xs font-semibold text-v2-fg-secondary";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {stacked ? (
        <SegmentedControl
          label="성장 정보 묶음"
          options={TABS.map((candidate) => ({ value: candidate.key, label: candidate.label }))}
          value={tab.key}
          onChange={setTabKey}
          className="flex w-full [&>label]:flex-1"
        />
      ) : null}
      <div className={cn("min-w-0 overflow-x-auto", !stacked && "w-fit max-w-full")}>
        <table className={cn("border-separate border-spacing-0 text-sm", stacked ? "w-full" : "w-max")}>
          <caption className="sr-only">{title} 성장 정보</caption>
          <thead>
            {stacked ? null : (
              <tr>
                <th
                  scope="col"
                  rowSpan={2}
                  className={cn(headerCell, "border-b border-v2-divider pr-1 pb-1.5 text-left align-bottom")}
                >
                  학생
                </th>
                {groups.map((group) => (
                  <th key={group.key} scope="colgroup" className={cn(headerCell, "h-8 px-1.5 text-left align-bottom")}>
                    <span className={cn("block pb-1 leading-4", !group.labelHidden && "border-b border-v2-divider")}>
                      {group.labelHidden ? <span className="sr-only">{group.label}</span> : group.label}
                      {group.labelHidden ? <span aria-hidden="true">&nbsp;</span> : null}
                    </span>
                  </th>
                ))}
              </tr>
            )}
            <tr>
              {stacked ? (
                <th scope="col" className="w-full">
                  <span className="sr-only">학생</span>
                </th>
              ) : null}
              {groups.map((group) => (
                <th
                  key={group.key}
                  scope="colgroup"
                  className={cn(
                    "h-7 px-1.5 text-xs font-medium text-v2-fg-tertiary",
                    stacked ? "pr-0" : "border-b border-v2-divider",
                  )}
                >
                  {stacked ? <span className="sr-only">{group.label}</span> : null}
                  <span className="grid text-center" style={columnsStyle(group.cells)}>
                    {group.cells.map((cell) => (
                      <span key={cell.field} className="truncate">
                        {cell.label}
                        {cell.field === "tier" ? (
                          <span aria-hidden="true" className="text-v2-danger">
                            *
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slot}>
                <th scope="row" className={cn("py-1.5 pr-1 text-left font-normal", !stacked && "w-32 max-w-32")}>
                  <span className="flex min-w-0 items-center gap-2">
                    <RoundStudentImage studentUid={row.unit.studentUid} size="sm" />
                    <span className="min-w-0 truncate text-sm font-semibold text-v2-fg">{row.name}</span>
                  </span>
                </th>
                {groups.map((group) => (
                  <td key={group.key} className={cn("py-1.5 pl-1.5", stacked ? "pr-0" : "pr-1.5")}>
                    <GrowthFieldBox
                      group={group}
                      row={row}
                      missingTier={missingTier}
                      changedLegendId={changedLegendId}
                      flowProps={getInputProps}
                      onChange={(field, value) => onChange(row.slot, setRaidFormUnitValue(row.unit, field, value))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-v2-fg-tertiary">
        <span>
          <span aria-hidden="true" className="text-v2-danger">
            *
          </span>{" "}
          필수
        </span>
        {anyChanged ? (
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className={cn("size-3.5 rounded-sm", changedClassName)} />
            <span id={changedLegendId}>모집한 학생 정보에서 수정한 값</span>
          </span>
        ) : null}
      </p>
    </div>
  );
}

function GrowthFieldBox({
  group,
  row,
  missingTier,
  changedLegendId,
  flowProps,
  onChange,
}: {
  group: GrowthGroup;
  row: Row;
  missingTier: boolean;
  changedLegendId: string;
  flowProps: ReturnType<typeof useNumberInputFlowNavigation>["getInputProps"];
  onChange: (field: RaidRecordSnapshotField, value: number | null) => void;
}) {
  const changed = changedRaidFormFields(row.unit);
  return (
    <fieldset
      aria-label={`${row.name} ${group.label}`}
      className="m-0 grid min-w-0 divide-x divide-v2-control-border overflow-hidden rounded-md border border-v2-control-border bg-v2-surface p-0"
      style={columnsStyle(group.cells)}
    >
      {group.cells.map((cell) => {
        const value = row.unit.snapshot[cell.field] ?? null;
        const range = STUDENT_GROWTH_EDIT_RANGES[cell.field];
        const isChanged = changed.has(cell.field);
        const describedBy = isChanged ? changedLegendId : undefined;
        // A stored value that the tier no longer allows stays editable, so it can be corrected.
        const editable = isRaidGrowthFieldApplicable(cell.field, row.student, row.unit.snapshot.tier) || value !== null;
        if (cell.field === "tier") {
          return (
            <div key={cell.field} className={cn("min-w-0", isChanged && changedClassName)}>
              <TierInput
                label={`${row.name} 성급 (필수)`}
                value={value}
                initialTier={row.student?.initialTier ?? 1}
                min={range.min}
                max={range.max}
                compact
                describedBy={describedBy}
                flowProps={flowProps()}
                onChange={(tier) => onChange("tier", tier)}
                // An empty 성급 asks to be filled; after a refused save it shows as the error.
                className={cn(
                  segmentClassName,
                  value === null && (missingTier ? "bg-v2-danger-subtle" : "bg-v2-warning-subtle"),
                )}
              />
            </div>
          );
        }
        if (!editable) {
          return <span key={cell.field} aria-hidden="true" className="block h-7 bg-v2-inset" />;
        }
        return (
          <div key={cell.field} className={cn("min-w-0", isChanged && changedClassName)}>
            <GrowthValueInput
              label={`${row.name} ${range.label}`}
              value={value}
              min={range.min}
              max={range.max}
              showSteps={false}
              flowProps={flowProps()}
              describedBy={describedBy}
              onChange={(next) => onChange(cell.field, next)}
              // A skill at its highest level reads "MAX", as the planner shows it.
              maxText={SKILL_FIELDS.has(cell.field) ? "MAX" : undefined}
            />
          </div>
        );
      })}
    </fieldset>
  );
}
