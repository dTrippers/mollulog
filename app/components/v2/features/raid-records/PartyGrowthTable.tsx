import { type CSSProperties, useId } from "react";
import type { RaidRecordSnapshotField } from "~/domain/raid-record";
import { STUDENT_GROWTH_EDIT_RANGES } from "~/domain/student-growth-edit";
import { cn } from "~/lib/utils";
import { useNumberInputFlowNavigation } from "../../primitives/use-number-input-flow-navigation";
import { GrowthValueInput } from "../students/GrowthValueInput";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { TierInput } from "../students/TierInput";
import { formatRaidStudentName, isRaidGrowthFieldApplicable, type RaidPartyStudent } from "./raid-party-student";
import { changedRaidFormFields, type RaidFormUnit, setRaidFormUnitValue } from "./raid-record-form-state";

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

// The student column stays in view while the values scroll sideways. Both cards that hold the table are the surface
// color, so the column covers the values under it with that color.
const stickyColumn = "sticky left-0 z-10 bg-v2-surface";
const segmentClassName = "rounded-none border-0 bg-transparent focus-visible:-outline-offset-2";
// Forced colors drop the fill that marks a changed value, so the cell also gets a dashed outline there.
const changedClassName =
  "bg-v2-accent-subtle forced-colors:outline-2 forced-colors:outline-offset-[-3px] forced-colors:outline-dashed";

type Row = { unit: RaidFormUnit; slot: number; student: RaidPartyStudent | undefined; name: string };

// The growth values of a party's students, laid out as the 학생 성장 플래너 table: one row per student, the values of a
// group side by side in one box. A box narrower than the table scrolls sideways, with the student column kept in view.
export function PartyGrowthTable({
  slots,
  title,
  studentsByUid,
  tierRequired = false,
  missingTier = false,
  onChange,
}: {
  slots: readonly (RaidFormUnit | null)[];
  title: string;
  studentsByUid: ReadonlyMap<string, RaidPartyStudent>;
  // 성급 must be filled, as a guide asks; the other values may stay empty.
  tierRequired?: boolean;
  // A save was refused because a student of this party has no 성급.
  missingTier?: boolean;
  onChange: (slot: number, unit: RaidFormUnit) => void;
}) {
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
      <div className="w-fit max-w-full min-w-0 overflow-x-auto">
        <table className="w-max border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{title} 성장 정보</caption>
          <thead>
            <tr>
              <th
                scope="col"
                rowSpan={2}
                className={cn(headerCell, stickyColumn, "pr-1 pb-1.5 text-left align-bottom")}
              >
                학생
              </th>
              {GROUPS.map((group) => (
                <th key={group.key} scope="colgroup" className={cn(headerCell, "h-8 px-1.5 text-left align-bottom")}>
                  <span className="block leading-4">
                    {group.labelHidden ? <span className="sr-only">{group.label}</span> : group.label}
                    {group.labelHidden ? <span aria-hidden="true">&nbsp;</span> : null}
                  </span>
                </th>
              ))}
            </tr>
            <tr>
              {GROUPS.map((group) => (
                <th key={group.key} scope="colgroup" className="h-7 px-1.5 text-xs font-medium text-v2-fg-tertiary">
                  <span className="grid text-center" style={columnsStyle(group.cells)}>
                    {group.cells.map((cell) => (
                      <span key={cell.field} className="truncate">
                        {cell.label}
                        {cell.field === "tier" && tierRequired ? (
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
                <th
                  scope="row"
                  className={cn(stickyColumn, "w-28 max-w-28 py-1.5 pr-1 text-left font-normal sm:w-36 sm:max-w-36")}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <RoundStudentImage studentUid={row.unit.studentUid} size="sm" />
                    <span className="min-w-0 truncate text-sm font-semibold text-v2-fg">{row.name}</span>
                    {row.unit.assist ? (
                      <span className="inline-flex min-h-[1.125rem] shrink-0 items-center rounded bg-v2-inset px-1.5 text-[0.6875rem] font-semibold text-v2-fg-secondary">
                        조력자
                      </span>
                    ) : null}
                  </span>
                </th>
                {GROUPS.map((group) => (
                  <td key={group.key} className="px-1.5 py-1.5">
                    <GrowthFieldBox
                      group={group}
                      row={row}
                      tierRequired={tierRequired}
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
      {tierRequired || anyChanged ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-v2-fg-tertiary">
          {tierRequired ? (
            <span>
              <span aria-hidden="true" className="text-v2-danger">
                *
              </span>{" "}
              필수
            </span>
          ) : null}
          {anyChanged ? (
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className={cn("size-3.5 rounded-sm", changedClassName)} />
              <span id={changedLegendId}>모집한 학생 정보에서 수정한 값</span>
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function GrowthFieldBox({
  group,
  row,
  tierRequired,
  missingTier,
  changedLegendId,
  flowProps,
  onChange,
}: {
  group: GrowthGroup;
  row: Row;
  tierRequired: boolean;
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
                label={tierRequired ? `${row.name} 성급 (필수)` : `${row.name} 성급`}
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
                  tierRequired && value === null && (missingTier ? "bg-v2-danger-subtle" : "bg-v2-warning-subtle"),
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
