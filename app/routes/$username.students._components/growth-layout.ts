import type { StudentGrowthEditField } from "~/domain/student-growth-edit";

// One cell of the growth table. A field cell is one stored value; an equipment cell (read-only table) shows one
// slot's image, tier and level together.
export type GrowthCell = { kind: "field"; field: StudentGrowthEditField } | { kind: "equipment"; slot: 0 | 1 | 2 };

// A group is one bordered box in the edit table (rule 1) and one column span in the read-only table. `rows` has one
// entry per input row of the box, each as wide as `headers`.
export type GrowthGroup = {
  key: string;
  label: string;
  // The group has no visible heading but still needs a name for screen readers.
  labelHidden?: boolean;
  headers: string[];
  rows: GrowthCell[][];
  // Names for the rows of a box with more than one row, such as "T" (tier) and "Lv".
  rowLabels?: string[];
};

const field = (name: StudentGrowthEditField): GrowthCell => ({ kind: "field", field: name });

const basic: GrowthGroup = {
  key: "basic",
  label: "기본 정보",
  headers: ["성급", "Lv", "고유무기", "인연"],
  rows: [[field("tier"), field("level"), field("weaponLevel"), field("bond")]],
};

const skill: GrowthGroup = {
  key: "skill",
  label: "스킬",
  headers: ["EX", "기본", "강화", "서브"],
  rows: [[field("skillEx"), field("skillNormal"), field("skillEnhanced"), field("skillSub")]],
};

const abilities: GrowthCell[] = [field("abilityHp"), field("abilityAtk"), field("abilityHeal")];

// The read-only table, the way the student detail shows equipment: image, tier and level in one cell.
export const VIEW_GROUPS: GrowthGroup[] = [
  basic,
  skill,
  {
    key: "equipment",
    label: "장비",
    headers: ["1", "2", "3"],
    rows: [
      [
        { kind: "equipment", slot: 0 },
        { kind: "equipment", slot: 1 },
        { kind: "equipment", slot: 2 },
      ],
    ],
  },
  {
    key: "ability",
    label: "능력 개방",
    headers: ["애용품", "체력", "공격력", "치유력"],
    rows: [[field("equipSpecial"), ...abilities]],
  },
];

// The edit table: tier and level of the equipment are separate boxes, so each box holds values of one kind.
export const EDIT_GROUPS: GrowthGroup[] = [
  basic,
  skill,
  {
    key: "equipment-tier",
    label: "장비 티어",
    headers: ["1", "2", "3"],
    rows: [[field("equip1"), field("equip2"), field("equip3")]],
  },
  {
    key: "equipment-level",
    label: "장비 Lv",
    headers: ["1", "2", "3"],
    rows: [[field("equip1Level"), field("equip2Level"), field("equip3Level")]],
  },
  {
    key: "gear",
    label: "애용품",
    labelHidden: true,
    headers: ["애용품"],
    rows: [[field("equipSpecial")]],
  },
  { key: "ability", label: "능력 개방", headers: ["체력", "공격력", "치유력"], rows: [abilities] },
];

// The stacked layout shows one group per tab, so a tab keeps the student column and four value columns at most.
export type GrowthTab = { key: string; label: string; groups: GrowthGroup[] };

export const VIEW_TABS: GrowthTab[] = [
  { key: "basic", label: "기본 정보", groups: [basic] },
  { key: "skill", label: "스킬", groups: [skill] },
  {
    key: "equipment",
    label: "장비",
    groups: [
      VIEW_GROUPS[2],
      { key: "gear", label: "애용품", labelHidden: true, headers: ["애용품"], rows: [[field("equipSpecial")]] },
    ],
  },
  {
    key: "ability",
    label: "능력 개방",
    groups: [{ key: "ability", label: "능력 개방", headers: ["체력", "공격력", "치유력"], rows: [abilities] }],
  },
];

export const EDIT_TABS: GrowthTab[] = [
  { key: "basic", label: "기본 정보", groups: [basic] },
  { key: "skill", label: "스킬", groups: [skill] },
  {
    key: "equipment",
    label: "장비",
    groups: [
      {
        key: "equipment",
        label: "장비",
        headers: ["1", "2", "3"],
        rowLabels: ["T", "Lv"],
        rows: [
          [field("equip1"), field("equip2"), field("equip3")],
          [field("equip1Level"), field("equip2Level"), field("equip3Level")],
        ],
      },
      { key: "gear", label: "애용품", labelHidden: true, headers: ["애용품"], rows: [[field("equipSpecial")]] },
    ],
  },
  {
    key: "ability",
    label: "능력 개방",
    groups: [{ key: "ability", label: "능력 개방", headers: ["체력", "공격력", "치유력"], rows: [abilities] }],
  },
];

export function getGrowthFieldLabel(group: GrowthGroup, columnIndex: number): string {
  return group.headers[columnIndex] ?? "";
}

// "compact" is the read-only table beside the Aside on desktop, which fits the main column without scrolling; "wide" is
// the edit table, which has the full width while the Aside is collapsed.
export type GrowthWidthMode = "stacked" | "compact" | "wide";

// Column widths in rem, the same for the header, the read-only cell, and the input box, so they line up.
export function getGrowthCellWidthRem(cell: GrowthCell, mode: GrowthWidthMode): number {
  if (mode === "compact") {
    if (cell.kind === "equipment") return 4;
    if (cell.field === "weaponLevel" || cell.field === "equipSpecial") return 2.75;
    if (cell.field === "bond") return 2;
    return 2.25;
  }
  const stacked = mode === "stacked";
  if (cell.kind === "equipment") return stacked ? 3.25 : 4.75;
  if (cell.field === "tier") return 3.5;
  if (cell.field === "equipSpecial") return stacked ? 3 : 3.5;
  return 2.75;
}

// The narrow column that names the rows of a box with more than one row.
export const GROWTH_ROW_LABEL_WIDTH_REM = 1.25;

export function getGrowthGroupWidthRem(group: GrowthGroup, mode: GrowthWidthMode): number {
  const cells = group.rows[0].reduce((sum, cell) => sum + getGrowthCellWidthRem(cell, mode), 0);
  return cells + (group.rowLabels ? GROWTH_ROW_LABEL_WIDTH_REM : 0);
}
