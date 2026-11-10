import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { type CSSProperties, Fragment, useEffect, useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { TierInput } from "~/components/v2/features/students/TierInput";
import { useV2Page } from "~/components/v2/layout/V2Page";
import { NumberInput } from "~/components/v2/primitives/NumberInput";
import { SectionTabs } from "~/components/v2/primitives/SectionTabs";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import {
  type NumberInputFlowNavigationInputProps,
  useNumberInputFlowNavigation,
} from "~/components/v2/primitives/use-number-input-flow-navigation";
import type {
  StudentStateDraftCurrentValue,
  StudentStateDraftTargetValue,
  StudentStateDraftValue,
} from "~/domain/student-state";
import {
  isStudentStateCurrentChanged,
  isStudentStateCurrentFieldUpdateTarget,
  isStudentStateDraftFieldProvided,
  isStudentStateTargetChanged,
  isStudentStateTargetFieldUpdateTarget,
  mergeStudentStateDraftValueForUpdate,
  type StudentStateComparisonField,
  type StudentStateCurrentComparisonValue,
  type StudentStateTargetComparisonValue,
  setStudentStateDraftFieldPresence,
  studentStateComparisonFields,
  studentStateCurrentFields,
  studentStateTargetFields,
} from "~/domain/student-state";
import { cn } from "~/lib/utils";
import { formatVisibleName } from "~/models/student-name";
import type { SyncDraft } from "~/models/sync-draft";
import { ConnectStateMessage } from "../connect._components/ConnectStateMessage";
import { parseConfidence } from "../connect._components/sync-draft-labels";
import {
  DraftApplyBar,
  ReviewLegend,
  ReviewWarningMark,
  reviewChangedClassName,
  SelectionCheckbox,
  type SyncDraftDisplayMetadata,
  type SyncDraftReviewActionData,
  TierFace,
} from "./review-shared";

export type StudentStateCurrentValues = Record<string, StudentStateStoredValue>;

export type StudentStateStoredValue = {
  current: StudentStateStoredCurrentValue;
  target: StudentStateStoredTargetValue;
};

export type StudentStateStoredCurrentValue = StudentStateCurrentComparisonValue;

export type StudentStateStoredTargetValue = StudentStateTargetComparisonValue;

export type StudentStateProposedValues = Record<string, { value: StudentStateDraftValue | null; error: string | null }>;

type Section = "current" | "target";
type ReviewFilter = "all" | "changed" | "review";

/** A recognition confidence below this needs a second look (the scanner's review uses the same line). */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

type StudentStateDraftReviewProps = {
  draft: SyncDraft;
  metadataByKey: Record<string, SyncDraftDisplayMetadata>;
  currentValues: StudentStateCurrentValues;
  proposedValues: StudentStateProposedValues;
  writeMode: "legacy" | "nullable";
  actionData?: SyncDraftReviewActionData;
};

type ReviewRow = {
  entry: SyncDraft["entries"][number];
  metadata: SyncDraftDisplayMetadata;
  currentValue: StudentStateStoredValue;
  proposed: StudentStateProposedValues[string];
  draftValue: StudentStateDraftValue | null;
  confidence: number | null;
  currentIsUpdate: boolean;
  targetIsUpdate: boolean;
  submittedCurrent: StudentStateDraftValue["current"];
  submittedTarget: StudentStateDraftValue["target"];
  hasGear: boolean;
  initialTier: number;
};

type NumberInputFlow = ReturnType<typeof useNumberInputFlowNavigation>;

const currentFields = studentStateCurrentFields;
const targetFields = studentStateTargetFields;

export function getStudentStateDraftReviewChanges(
  draftValue: StudentStateDraftValue | null,
  currentValue: StudentStateStoredValue,
  options: { initialTier: number; hasGear: boolean },
  writeMode: "legacy" | "nullable",
  visibleFields = getVisibleComparisonFields(options.hasGear),
): {
  currentIsUpdate: boolean;
  targetIsUpdate: boolean;
  submittedCurrent: StudentStateDraftValue["current"];
  submittedTarget: StudentStateDraftValue["target"];
} {
  const currentIsUpdate =
    draftValue?.current != null &&
    (writeMode === "nullable" || !isMinimumCurrentDraftValue(draftValue.current, visibleFields, options.initialTier)) &&
    isStudentStateCurrentChanged(draftValue.current, currentValue.current, options, writeMode);
  const targetIsUpdate = isStudentStateTargetChanged(
    draftValue?.target ?? null,
    currentValue.target,
    options,
    writeMode,
  );
  const mergedValue = draftValue
    ? mergeStudentStateDraftValueForUpdate(draftValue, currentValue, options, writeMode)
    : null;
  return {
    currentIsUpdate,
    targetIsUpdate,
    submittedCurrent: currentIsUpdate ? (mergedValue?.current ?? null) : null,
    submittedTarget: targetIsUpdate ? (mergedValue?.target ?? null) : null,
  };
}

function getVisibleComparisonFields(hasGear: boolean): readonly StudentStateComparisonField[] {
  return studentStateComparisonFields.filter((field) => hasGear || !field.gearOnly);
}

function isMinimumCurrentDraftValue(
  value: StudentStateDraftCurrentValue,
  fields: readonly StudentStateComparisonField[],
  initialTier: number,
): boolean {
  return fields.every((field) => {
    const key = field.currentKey;
    if (!key) return true;
    const currentValue = value[key];
    const minimumValue = key === "tier" ? initialTier : field.min;
    return currentValue == null || currentValue <= minimumValue;
  });
}

// The review groups in column order. A field is found by its current key, which every comparison field has.
type ReviewGroup = {
  label: string;
  fields: readonly { currentKey: keyof StudentStateStoredCurrentValue; column: string; width: string; name: string }[];
};

const REVIEW_GROUPS: readonly ReviewGroup[] = [
  { label: "", fields: [{ currentKey: "tier", column: "성급", width: "3.75rem", name: "성급이" }] },
  {
    label: "기본 정보",
    fields: [
      { currentKey: "level", column: "Lv", width: "2.75rem", name: "Lv가" },
      { currentKey: "weaponLevel", column: "고유무기", width: "3.25rem", name: "고유무기 Lv가" },
      { currentKey: "bond", column: "인연", width: "2.75rem", name: "인연 랭크가" },
    ],
  },
  {
    label: "스킬",
    fields: [
      { currentKey: "skillEx", column: "EX", width: "2.5rem", name: "EX 스킬이" },
      { currentKey: "skillNormal", column: "기본", width: "2.5rem", name: "기본 스킬이" },
      { currentKey: "skillEnhanced", column: "강화", width: "2.5rem", name: "강화 스킬이" },
      { currentKey: "skillSub", column: "서브", width: "2.5rem", name: "서브 스킬이" },
    ],
  },
  {
    label: "장비 티어",
    fields: [
      { currentKey: "equip1", column: "1", width: "2.75rem", name: "장비 1 티어가" },
      { currentKey: "equip2", column: "2", width: "2.75rem", name: "장비 2 티어가" },
      { currentKey: "equip3", column: "3", width: "2.75rem", name: "장비 3 티어가" },
    ],
  },
  { label: "", fields: [{ currentKey: "equipSpecial", column: "애용품", width: "3.25rem", name: "애용품이" }] },
  {
    label: "능력 해방",
    fields: [
      { currentKey: "abilityHp", column: "HP", width: "2.75rem", name: "HP 해방이" },
      { currentKey: "abilityAtk", column: "공격력", width: "3.25rem", name: "공격력 해방이" },
      { currentKey: "abilityHeal", column: "치유력", width: "3.25rem", name: "치유력 해방이" },
    ],
  },
];

function findComparisonField(currentKey: keyof StudentStateStoredCurrentValue): StudentStateComparisonField {
  const field = studentStateComparisonFields.find((candidate) => candidate.currentKey === currentKey);
  if (!field) throw new Error(`Unknown student state field: ${currentKey}`);
  return field;
}

function getSectionKey(field: StudentStateComparisonField, section: Section): string | undefined {
  return section === "current" ? field.currentKey : field.targetKey;
}

function getStoredNumber(value: object | null | undefined, key: string | undefined): number | null {
  if (!value || !key) return null;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "number" ? entry : null;
}

function isFieldUpdateTarget(
  row: ReviewRow,
  section: Section,
  field: StudentStateComparisonField,
  writeMode: "legacy" | "nullable",
): boolean {
  const isUpdate = section === "current" ? row.currentIsUpdate : row.targetIsUpdate;
  const draftSection = row.draftValue?.[section];
  if (!isUpdate || !draftSection) return false;
  if (section === "current") {
    return field.currentKey
      ? isStudentStateCurrentFieldUpdateTarget(
          field.currentKey,
          draftSection as StudentStateDraftCurrentValue,
          row.currentValue.current,
          { initialTier: row.initialTier, hasGear: row.hasGear },
          writeMode,
        )
      : false;
  }
  return field.targetKey
    ? isStudentStateTargetFieldUpdateTarget(
        field.targetKey,
        draftSection as StudentStateDraftTargetValue,
        row.currentValue.target,
        { initialTier: row.initialTier, hasGear: row.hasGear },
        writeMode,
      )
    : false;
}

type FieldState = {
  field: StudentStateComparisonField;
  group: ReviewGroup["fields"][number];
  key: string | undefined;
  visible: boolean;
  imported: number | null;
  stored: number | null;
  changed: boolean;
  decreased: boolean;
};

function getFieldStates(row: ReviewRow, section: Section, writeMode: "legacy" | "nullable"): FieldState[] {
  return REVIEW_GROUPS.flatMap((group) =>
    group.fields.map((groupField) => {
      const field = findComparisonField(groupField.currentKey);
      const key = getSectionKey(field, section);
      const visible = key != null && (row.hasGear || !field.gearOnly);
      const imported = visible ? getStoredNumber(row.draftValue?.[section], key) : null;
      const stored = visible ? getStoredNumber(row.currentValue[section], key) : null;
      const changed = visible && isFieldUpdateTarget(row, section, field, writeMode);
      return {
        field,
        group: groupField,
        key,
        visible,
        imported,
        stored,
        changed,
        decreased: changed && imported != null && stored != null && imported < stored,
      };
    }),
  );
}

function getWarningReasons(row: ReviewRow, section: Section, writeMode: "legacy" | "nullable"): string[] {
  const reasons: string[] = [];
  if (row.confidence !== null && row.confidence < LOW_CONFIDENCE_THRESHOLD) {
    reasons.push("인식 신뢰도가 낮아요.");
  }
  for (const state of getFieldStates(row, section, writeMode)) {
    if (state.decreased) reasons.push(`${state.group.name} 지금 값보다 낮아져요.`);
  }
  return reasons;
}

export default function StudentStateDraftReview({
  draft,
  metadataByKey,
  currentValues,
  proposedValues,
  writeMode,
  actionData,
}: StudentStateDraftReviewProps) {
  const { stacked } = useV2Page();
  const flow = useNumberInputFlowNavigation();
  const formId = "student-state-draft-review-form";
  const initialDraftValues = useMemo(
    () => Object.fromEntries(Object.entries(proposedValues).map(([uid, proposed]) => [uid, proposed.value])),
    [proposedValues],
  );
  const [draftValues, setDraftValues] = useState(initialDraftValues);
  const [deselected, setDeselected] = useState<ReadonlySet<string>>(new Set());
  const [section, setSection] = useState<Section>("current");
  const [filter, setFilter] = useState<ReviewFilter>("changed");
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  useEffect(() => {
    setDraftValues(initialDraftValues);
    setDeselected(new Set());
  }, [initialDraftValues]);

  const rows: ReviewRow[] = draft.entries.flatMap((entry) => {
    const metadata = metadataByKey[entry.entryKey];
    if (!metadata) return [];
    const proposed = proposedValues[entry.uid] ?? { value: null, error: "가져온 학생 데이터를 읽을 수 없어요" };
    const draftValue = draftValues[entry.uid] ?? proposed.value;
    const currentValue = currentValues[entry.entryKey] ?? emptyStoredValue();
    const initialTier = metadata.initialTier ?? 1;
    const hasGear = metadata.hasGear ?? true;
    const changes = getStudentStateDraftReviewChanges(
      draftValue,
      currentValue,
      { initialTier, hasGear },
      writeMode,
      getVisibleComparisonFields(hasGear),
    );
    return [
      {
        entry,
        metadata,
        currentValue,
        proposed,
        draftValue,
        confidence: parseConfidence(entry.meta),
        hasGear,
        initialTier,
        ...changes,
      },
    ];
  });

  const hasSection = (row: ReviewRow, target: Section) =>
    row.proposed.error != null || row.draftValue?.[target] != null;
  const sections = (["current", "target"] as const).filter((target) =>
    rows.some((row) => row.draftValue?.[target] != null),
  );
  const activeSection: Section = sections.includes(section) ? section : (sections[0] ?? "current");
  const tabRows = rows.filter((row) => hasSection(row, activeSection));
  const isChangedIn = (row: ReviewRow, target: Section) =>
    target === "current" ? row.currentIsUpdate : row.targetIsUpdate;
  const needsReview = (row: ReviewRow) =>
    row.proposed.error != null || getWarningReasons(row, activeSection, writeMode).length > 0;
  const counts = {
    all: tabRows.length,
    changed: tabRows.filter((row) => row.proposed.error != null || isChangedIn(row, activeSection)).length,
    review: tabRows.filter(needsReview).length,
  };
  const visibleRows = tabRows.filter((row) =>
    filter === "all"
      ? true
      : filter === "changed"
        ? row.proposed.error != null || isChangedIn(row, activeSection)
        : needsReview(row),
  );

  const isSelectable = (row: ReviewRow) => row.proposed.error == null && (row.currentIsUpdate || row.targetIsUpdate);
  const selectedRows = rows.filter((row) => isSelectable(row) && !deselected.has(row.entry.entryKey));
  const unselectedCount = rows.filter((row) => isSelectable(row) && deselected.has(row.entry.entryKey)).length;
  const changedValueCount = selectedRows.reduce(
    (total, row) =>
      total +
      getFieldStates(row, "current", writeMode).filter((state) => state.changed).length +
      getFieldStates(row, "target", writeMode).filter((state) => state.changed).length,
    0,
  );
  const visibleSelectable = visibleRows.filter(isSelectable);
  const selectedVisibleCount = visibleSelectable.filter((row) => !deselected.has(row.entry.entryKey)).length;
  const allVisibleSelected = visibleSelectable.length > 0 && selectedVisibleCount === visibleSelectable.length;

  const toggleRow = (entryKey: string, selected: boolean) =>
    setDeselected((current) => {
      const next = new Set(current);
      if (selected) next.delete(entryKey);
      else next.add(entryKey);
      return next;
    });
  const toggleVisible = (selected: boolean) =>
    setDeselected((current) => {
      const next = new Set(current);
      for (const row of visibleSelectable) {
        if (selected) next.delete(row.entry.entryKey);
        else next.add(row.entry.entryKey);
      }
      return next;
    });

  const updateValue = (entryUid: string, target: Section, field: string, value: number | null) => {
    setDraftValues((values) => {
      const draftValue = values[entryUid];
      const draftSection = draftValue?.[target];
      if (!draftValue || !draftSection) return values;
      const providedCurrent = currentFields
        .filter(({ key }) => isStudentStateDraftFieldProvided(draftValue, "current", key))
        .map(({ key }) => key as string);
      const providedTarget = targetFields
        .filter(({ key }) => isStudentStateDraftFieldProvided(draftValue, "target", key))
        .map(({ key }) => key as string);
      return {
        ...values,
        [entryUid]: setStudentStateDraftFieldPresence(
          { ...draftValue, [target]: { ...draftSection, [field]: value } } as StudentStateDraftValue,
          {
            current: target === "current" ? [...providedCurrent, field] : providedCurrent,
            target: target === "target" ? [...providedTarget, field] : providedTarget,
          },
        ),
      };
    });
  };

  const fieldErrors = actionData?.fieldErrors ?? {};
  const invalidInputCount = Object.keys(fieldErrors).length;
  const tabItems = sections.map((target) => ({
    id: target,
    label: `${target === "current" ? "학생 현재 상태" : "육성 목표"} ${rows.filter((row) => row.draftValue?.[target] != null).length.toLocaleString("ko-KR")}`,
  }));

  const table =
    visibleRows.length === 0 ? (
      <div className="rounded-lg bg-v2-surface">
        {tabRows.length === 0 ? (
          <ConnectStateMessage Icon={ArchiveBoxIcon} title="검토할 항목이 없어요" />
        ) : (
          <ConnectStateMessage
            Icon={ArchiveBoxIcon}
            title="바뀌는 값이 없어요"
            description="가져온 값이 모두 지금 값과 같아요. 전체를 눌러 모든 학생을 볼 수 있어요."
          />
        )}
      </div>
    ) : stacked ? (
      <ul className="flex flex-col gap-v2-list-gap">
        {visibleRows.map((row) => (
          <li key={row.entry.uid} className="rounded-lg bg-v2-surface p-v2-block-p">
            <ReviewCard
              row={row}
              section={activeSection}
              writeMode={writeMode}
              flow={flow}
              selected={isSelectable(row) && !deselected.has(row.entry.entryKey)}
              selectable={isSelectable(row)}
              disabled={submitting}
              fieldError={fieldErrors[row.entry.entryKey]}
              onSelectedChange={(selected) => toggleRow(row.entry.entryKey, selected)}
              onValueChange={(field, value) => updateValue(row.entry.uid, activeSection, field, value)}
            />
          </li>
        ))}
      </ul>
    ) : (
      <div className="overflow-x-auto rounded-lg bg-v2-surface py-1">
        <table className="w-max min-w-full border-collapse">
          <thead>
            <ReviewTableHead
              allSelected={allVisibleSelected}
              someSelected={selectedVisibleCount > 0 && !allVisibleSelected}
              disabled={visibleSelectable.length === 0}
              onToggle={toggleVisible}
            />
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <ReviewTableRow
                key={row.entry.uid}
                row={row}
                section={activeSection}
                writeMode={writeMode}
                flow={flow}
                selected={isSelectable(row) && !deselected.has(row.entry.entryKey)}
                selectable={isSelectable(row)}
                disabled={submitting}
                fieldError={fieldErrors[row.entry.entryKey]}
                onSelectedChange={(selected) => toggleRow(row.entry.entryKey, selected)}
                onValueChange={(field, value) => updateValue(row.entry.uid, activeSection, field, value)}
              />
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className={cn("flex flex-col gap-v2-block-gap", stacked && "pb-28")}>
      <SectionTabs
        items={tabItems}
        selectedId={activeSection}
        onChange={(id) => setSection(id === "target" ? "target" : "current")}
        label="가져온 데이터 종류"
      />
      <fieldset className="m-0 min-w-0 border-0 p-0 flex flex-wrap items-center gap-2" aria-label="검토 필터">
        <ToggleChip pressed={filter === "all"} onPressedChange={() => setFilter("all")}>
          전체 {counts.all.toLocaleString("ko-KR")}
        </ToggleChip>
        <ToggleChip pressed={filter === "changed"} onPressedChange={() => setFilter("changed")}>
          바뀌는 학생만 {counts.changed.toLocaleString("ko-KR")}
        </ToggleChip>
        <ToggleChip pressed={filter === "review"} onPressedChange={() => setFilter("review")}>
          확인 필요 {counts.review.toLocaleString("ko-KR")}
        </ToggleChip>
        {stacked ? null : (
          <span className="ml-auto text-xs text-v2-fg-tertiary">화살표 키로 입력칸 사이를 이동할 수 있어요.</span>
        )}
      </fieldset>
      <ReviewLegend />
      <Form method="post" id={formId} className="flex flex-col gap-v2-block-gap">
        <input type="hidden" name="stateFormat" value={writeMode} />
        {selectedRows.map((row) => (
          <Fragment key={`selected:${row.entry.uid}`}>
            <input type="hidden" name="selected" value={row.entry.entryKey} />
            <StudentStateDraftHiddenInputs
              entryUid={row.entry.uid}
              submittedCurrent={row.submittedCurrent}
              submittedTarget={row.submittedTarget}
              writeMode={writeMode}
            />
          </Fragment>
        ))}
        {table}
      </Form>
      <DraftApplyBar
        applyFormId={formId}
        summary={`학생 ${selectedRows.length.toLocaleString("ko-KR")}명 · 바뀌는 값 ${changedValueCount.toLocaleString("ko-KR")}개`}
        discardNote={
          unselectedCount > 0
            ? `선택하지 않은 학생 ${unselectedCount.toLocaleString("ko-KR")}명의 값은 반영되지 않고 삭제돼요.`
            : "선택하지 않은 학생의 값은 반영되지 않고 삭제돼요."
        }
        canApply={!submitting && selectedRows.length > 0}
        actionData={actionData}
        invalidInputCount={invalidInputCount}
      />
    </div>
  );
}

const groupCellClassName = "px-1.5 py-2 align-top";
const headerCellClassName = "px-1.5 text-left text-xs font-medium text-v2-fg-tertiary";

function gridStyle(group: ReviewGroup, mobile: boolean): CSSProperties {
  return {
    gridTemplateColumns: mobile
      ? `repeat(${group.fields.length}, minmax(0, 1fr))`
      : group.fields.map((field) => field.width).join(" "),
  };
}

function ReviewTableHead({
  allSelected,
  someSelected,
  disabled,
  onToggle,
}: {
  allSelected: boolean;
  someSelected: boolean;
  disabled: boolean;
  onToggle: (selected: boolean) => void;
}) {
  return (
    <>
      <tr>
        <th className="pl-v2-block-p" />
        {REVIEW_GROUPS.map((group) => (
          <th
            key={group.fields[0]?.currentKey}
            className={cn(headerCellClassName, "pt-2 pb-1 font-semibold text-v2-fg-secondary")}
          >
            {group.label}
          </th>
        ))}
        <th />
      </tr>
      <tr>
        <th scope="col" className={cn(headerCellClassName, "pb-1 pl-v2-block-p")}>
          <span className="inline-flex items-center gap-2">
            <SelectionCheckbox
              checked={allSelected}
              mixed={someSelected}
              disabled={disabled}
              label="보이는 학생 모두 선택"
              onCheckedChange={onToggle}
            />
            학생
          </span>
        </th>
        {REVIEW_GROUPS.map((group) => (
          <th key={group.fields[0]?.currentKey} scope="colgroup" className={cn(headerCellClassName, "pb-1")}>
            <div className="grid text-center" style={gridStyle(group, false)}>
              {group.fields.map((field) => (
                <span key={field.currentKey}>{field.column}</span>
              ))}
            </div>
          </th>
        ))}
        <th scope="col" className={cn(headerCellClassName, "pr-v2-block-p pb-1 text-right")}>
          변화
        </th>
      </tr>
    </>
  );
}

type RowProps = {
  row: ReviewRow;
  section: Section;
  writeMode: "legacy" | "nullable";
  flow: NumberInputFlow;
  selected: boolean;
  selectable: boolean;
  disabled: boolean;
  fieldError?: string;
  onSelectedChange: (selected: boolean) => void;
  onValueChange: (field: string, value: number | null) => void;
};

function ReviewTableRow(props: RowProps) {
  const { row, section, writeMode, selected, selectable, fieldError, onSelectedChange } = props;
  const failed = row.proposed.error != null || row.draftValue?.[section] == null;
  const states = failed ? [] : getFieldStates(row, section, writeMode);
  const changedCount = states.filter((state) => state.changed).length;
  return (
    <tr className={cn("border-t border-v2-divider first:border-t-0", selectable && !selected && "opacity-60")}>
      <td className="py-2 pl-v2-block-p align-top">
        <div className="flex items-center gap-2">
          <SelectionCheckbox
            checked={selected}
            disabled={!selectable}
            label={`${row.metadata.label} 반영`}
            onCheckedChange={onSelectedChange}
          />
          <ReviewStudentIdentity row={row} section={section} writeMode={writeMode} fieldError={fieldError} />
        </div>
      </td>
      {failed ? (
        <td colSpan={REVIEW_GROUPS.length + 1} className="px-1.5 py-2 text-sm text-v2-danger">
          {row.proposed.error ?? "가져온 학생 데이터를 읽을 수 없어요"}
        </td>
      ) : (
        <>
          {REVIEW_GROUPS.map((group) => (
            <td key={group.fields[0]?.currentKey} className={groupCellClassName}>
              <ReviewGroupFields group={group} states={states} mobile={false} {...props} />
            </td>
          ))}
          <td className="py-2 pr-v2-block-p text-right align-top text-xs text-v2-fg-tertiary tabular-nums">
            {changedCount > 0 ? `${changedCount.toLocaleString("ko-KR")}개` : ""}
          </td>
        </>
      )}
    </tr>
  );
}

function ReviewCard(props: RowProps) {
  const { row, section, writeMode, selected, selectable, fieldError, onSelectedChange } = props;
  const failed = row.proposed.error != null || row.draftValue?.[section] == null;
  const states = failed ? [] : getFieldStates(row, section, writeMode);
  const changedCount = states.filter((state) => state.changed).length;
  return (
    <div className={cn("flex flex-col gap-3", selectable && !selected && "opacity-60")}>
      <div className="flex items-center gap-2">
        <SelectionCheckbox
          checked={selected}
          disabled={!selectable}
          label={`${row.metadata.label} 반영`}
          onCheckedChange={onSelectedChange}
        />
        <div className="min-w-0 flex-1">
          <ReviewStudentIdentity row={row} section={section} writeMode={writeMode} fieldError={fieldError} />
        </div>
        {changedCount > 0 ? (
          <span className="shrink-0 text-xs text-v2-fg-tertiary tabular-nums">
            {changedCount.toLocaleString("ko-KR")}개 변화
          </span>
        ) : null}
      </div>
      {failed ? (
        <p className="text-sm text-v2-danger">{row.proposed.error ?? "가져온 학생 데이터를 읽을 수 없어요"}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {REVIEW_GROUPS.filter((group) =>
            group.fields.some((field) => states.some((state) => state.group === field && state.visible)),
          ).map((group) => (
            <div key={group.fields[0]?.currentKey} className="flex min-w-0 flex-col gap-1.5">
              <p className="text-sm font-semibold text-v2-fg-secondary">{group.label || group.fields[0]?.column}</p>
              <div
                className="grid text-center text-xs leading-4 text-v2-fg-tertiary"
                style={gridStyle(group, true)}
                aria-hidden="true"
              >
                {group.fields.map((field) => (
                  <span key={field.currentKey}>{field.column}</span>
                ))}
              </div>
              <ReviewGroupFields group={group} states={states} mobile {...props} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewStudentIdentity({
  row,
  section,
  writeMode,
  fieldError,
}: {
  row: ReviewRow;
  section: Section;
  writeMode: "legacy" | "nullable";
  fieldError?: string;
}) {
  const { name, variant } = splitVisibleStudentName(row.metadata.label);
  const reasons = row.proposed.error == null ? getWarningReasons(row, section, writeMode) : [];
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="block shrink-0">
        <StudentThumb
          studentUid={row.metadata.studentUid ?? row.entry.entryKey}
          name={row.metadata.label}
          variant={null}
          recruitmentLabel=""
          isNew={false}
          favorite={NO_FAVORITE_LABEL}
          compact
          showCaption={false}
        />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-sm font-medium text-v2-fg" title={formatVisibleName(row.metadata.label)}>
            {name}
          </span>
          <ReviewWarningMark reasons={reasons} />
        </div>
        {variant ? <span className="block truncate text-xs text-v2-fg-tertiary">{variant}</span> : null}
        {fieldError ? <span className="block text-xs text-v2-danger">{fieldError}</span> : null}
      </div>
    </div>
  );
}

const NO_FAVORITE_LABEL = { visible: false, icon: "unfavorited", countText: null, accessibleName: "" } as const;

// A segment of a grouped box: no border or corners of its own, and a focus ring drawn inside, so the group clips nothing.
const segmentInputClassName =
  "rounded-none border-0 bg-transparent px-0 outline-offset-[-2px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// One group of values: one bordered box split by inner rules, with the caption line (the saved value) under each value.
function ReviewGroupFields({
  group,
  states,
  mobile,
  row,
  section,
  flow,
  disabled,
  onValueChange,
}: RowProps & { group: ReviewGroup; states: FieldState[]; mobile: boolean }) {
  const groupStates = states.filter((state) => group.fields.includes(state.group));
  if (!groupStates.some((state) => state.visible) && !mobile) {
    return <span className="block text-center text-sm text-v2-fg-tertiary">—</span>;
  }
  const studentName = row.metadata.label;
  return (
    <div className="flex flex-col">
      <div
        className="grid divide-x divide-v2-control-border overflow-hidden rounded-md border border-v2-control-border bg-v2-surface focus-within:border-v2-control-border-strong"
        style={gridStyle(group, mobile)}
      >
        {groupStates.map((state) => {
          const label = `${studentName} ${section === "target" ? "목표 " : ""}${state.field.label}`;
          if (!state.visible) {
            return (
              <span
                key={state.group.currentKey}
                className="flex min-h-7 items-center justify-center text-sm text-v2-fg-tertiary"
              >
                —
              </span>
            );
          }
          const warning = state.decreased;
          const cellClassName = cn(
            segmentInputClassName,
            state.changed ? reviewChangedClassName : "text-v2-fg-secondary focus:text-v2-fg",
            warning && "bg-v2-warning-subtle",
          );
          if (state.field.kind === "tier") {
            return (
              <TierInput
                key={state.group.currentKey}
                label={studentName}
                value={state.imported}
                initialTier={row.initialTier}
                min={state.field.min}
                // Both tier fields define their max (9: the exclusive weapon levels after ★5); the type only makes it optional.
                max={state.field.max ?? 9}
                disabled={disabled}
                warning={warning}
                compact
                flowProps={flow.getInputProps({ disabled })}
                onChange={(tier) => onValueChange(state.key as string, tier)}
                className={cn(cellClassName, "h-full")}
              />
            );
          }
          return (
            <NumberInput
              key={state.group.currentKey}
              {...(flow.getInputProps({ disabled }) as NumberInputFlowNavigationInputProps)}
              compact
              min={state.field.min}
              max={state.field.max}
              value={state.imported ?? ""}
              disabled={disabled}
              warning={warning}
              className={cellClassName}
              aria-label={label}
              onChange={(event) => {
                const next = event.currentTarget.value === "" ? null : Number(event.currentTarget.value);
                onValueChange(state.key as string, next);
              }}
            />
          );
        })}
      </div>
      <div className="grid" style={gridStyle(group, mobile)}>
        {groupStates.map((state) => (
          <span
            key={state.group.currentKey}
            className="block h-4 truncate text-center text-[0.6875rem] leading-4 text-v2-fg-tertiary tabular-nums"
          >
            {state.changed && state.stored != null ? (
              <>
                <span className="sr-only">지금 값 </span>
                {state.field.kind === "tier" ? <TierFace tier={state.stored} /> : state.stored}
                {state.decreased ? <span aria-hidden="true"> ↓</span> : null}
              </>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function StudentStateDraftHiddenInputs({
  entryUid,
  submittedCurrent,
  submittedTarget,
  writeMode,
}: {
  entryUid: string;
  submittedCurrent: StudentStateDraftValue["current"];
  submittedTarget: StudentStateDraftValue["target"];
  writeMode: "legacy" | "nullable";
}) {
  const submitCurrent = submittedCurrent != null;
  const submitTarget = submittedTarget != null;
  const currentPresence = submittedCurrent?.providedFields ?? [];
  const targetPresence = submittedTarget?.providedFields ?? [];

  return (
    <>
      <input type="hidden" name={`studentState:${entryUid}:hasCurrent`} value={submitCurrent ? "1" : "0"} />
      {submitCurrent && writeMode === "nullable" ? (
        <input
          type="hidden"
          name={`studentState:${entryUid}:current:providedFields`}
          value={currentPresence.join(",")}
        />
      ) : null}
      {submitCurrent
        ? currentFields.map(({ key }) => (
            <input
              key={`current:${key}`}
              type="hidden"
              name={`studentState:${entryUid}:current:${key}`}
              value={formatFormValue(submittedCurrent?.[key])}
            />
          ))
        : null}
      <input type="hidden" name={`studentState:${entryUid}:hasTarget`} value={submitTarget ? "1" : "0"} />
      {submitTarget && writeMode === "nullable" ? (
        <input type="hidden" name={`studentState:${entryUid}:target:providedFields`} value={targetPresence.join(",")} />
      ) : null}
      {submitTarget
        ? targetFields.map(({ key }) => (
            <input
              key={`target:${key}`}
              type="hidden"
              name={`studentState:${entryUid}:target:${key}`}
              value={formatFormValue(submittedTarget?.[key])}
            />
          ))
        : null}
    </>
  );
}

function formatFormValue(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function emptyStoredValue(): StudentStateStoredValue {
  return {
    current: {
      level: null,
      tier: null,
      weaponLevel: null,
      skillEx: null,
      skillNormal: null,
      skillEnhanced: null,
      skillSub: null,
      equip1: null,
      equip2: null,
      equip3: null,
      equipSpecial: null,
      abilityHp: null,
      abilityAtk: null,
      abilityHeal: null,
      bond: null,
    },
    target: {
      targetBond: null,
      targetLevel: null,
      targetTier: null,
      targetWeaponLevel: null,
      targetSkillEx: null,
      targetSkillNormal: null,
      targetSkillEnhanced: null,
      targetSkillSub: null,
      targetEquip1: null,
      targetEquip2: null,
      targetEquip3: null,
      targetEquipSpecial: null,
      targetAbilityHp: null,
      targetAbilityAtk: null,
      targetAbilityHeal: null,
    },
  };
}
