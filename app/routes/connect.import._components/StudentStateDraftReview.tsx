import { ArchiveBoxIcon, StarIcon as StarIconOutline } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Form, useNavigation } from "react-router";
import { TierSelector } from "~/components/features/students";
import {
  EmptyView,
  NumberInput,
  type NumberInputGridNavigationInputProps,
  ProfileImage,
  useNumberInputGridNavigation,
} from "~/components/primitives";
import { EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import {
  type StudentStateCurrentComparisonValue,
  type StudentStateTargetComparisonValue,
  isStudentStateCurrentChanged,
  isStudentStateCurrentFieldUpdateTarget,
  isStudentStateTargetChanged,
  isStudentStateTargetFieldUpdateTarget,
  mergeStudentStateDraftValueForUpdate,
} from "~/domain/student-state";
import type {
  StudentStateDraftCurrentValue,
  StudentStateDraftTargetValue,
  StudentStateDraftValue,
} from "~/domain/student-state";
import {
  type StudentStateComparisonField,
  type StudentStateFieldDefinition,
  studentStateComparisonFields,
  studentStateCurrentFields,
  studentStateTargetFields,
} from "~/domain/student-state";
import { cn } from "~/lib/utils";
import type { SyncDraft } from "~/models/sync-draft";
import DraftReviewView, {
  DraftReviewActions,
  parseConfidence,
  type SyncDraftDisplayMetadata,
  type SyncDraftReviewActionData,
} from "./DraftReviewView";

export type StudentStateCurrentValues = Record<string, StudentStateStoredValue>;

export type StudentStateStoredValue = {
  current: StudentStateStoredCurrentValue;
  target: StudentStateStoredTargetValue;
};

export type StudentStateStoredCurrentValue = StudentStateCurrentComparisonValue;

export type StudentStateStoredTargetValue = StudentStateTargetComparisonValue;

export type StudentStateProposedValues = Record<string, { value: StudentStateDraftValue | null; error: string | null }>;

type StudentStateDraftReviewRow = {
  entry: SyncDraft["entries"][number];
  metadata: SyncDraftDisplayMetadata;
  currentValue: StudentStateCurrentValues[string];
  proposed: StudentStateProposedValues[string];
  draftValue: StudentStateDraftValue | null;
  confidence: number | null;
  currentIsUpdate: boolean;
  targetIsUpdate: boolean;
};

type StudentStateDraftReviewProps = {
  draft: SyncDraft;
  metadataByKey: Record<string, SyncDraftDisplayMetadata>;
  currentValues: StudentStateCurrentValues;
  proposedValues: StudentStateProposedValues;
  actionData?: SyncDraftReviewActionData;
};

type EditableStudentStateRowValue = StudentStateDraftCurrentValue | StudentStateDraftTargetValue | null;
type NumberInputGridNavigation = ReturnType<typeof useNumberInputGridNavigation>;

const currentFields = studentStateCurrentFields;
const targetFields = studentStateTargetFields;
const comparisonFields = studentStateComparisonFields;
type StudentStateDisplayField = Omit<StudentStateFieldDefinition, "key">;

const cellBase = "border-b border-neutral-200 align-middle dark:border-neutral-700";
const groupTopCellClass = "border-t border-neutral-200 dark:border-neutral-700";
const studentHeaderCellClass = `${cellBase} px-3 py-2 text-left align-middle`;
const rowHeaderCellClass = `${cellBase} w-32 px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-neutral-400 dark:text-neutral-500`;
const importedRowHeaderCellClass = `${cellBase} w-32 px-2 py-1.5 text-left text-xs font-medium whitespace-nowrap text-blue-500 dark:text-blue-400`;
const headerCellClass = "w-16 px-0.5 py-1.5 text-center";

export default function StudentStateDraftReview({
  draft,
  metadataByKey,
  currentValues,
  proposedValues,
  actionData,
}: StudentStateDraftReviewProps) {
  const navigation = useNavigation();
  const draftFormId = "student-state-draft-review-form";
  const initialDraftValues = useMemo(
    () => Object.fromEntries(Object.entries(proposedValues).map(([uid, proposed]) => [uid, proposed.value])),
    [proposedValues],
  );
  const [draftValues, setDraftValues] = useState(initialDraftValues);
  const isPending = draft.status === "pending";

  useEffect(() => {
    setDraftValues(initialDraftValues);
  }, [initialDraftValues]);

  const rows: StudentStateDraftReviewRow[] = draft.entries.flatMap((entry) => {
    const metadata = metadataByKey[entry.entryKey];
    if (!metadata) {
      return [];
    }

    const proposed = proposedValues[entry.uid] ?? {
      value: null,
      error: "학생 상태 변경안 데이터를 찾을 수 없어요",
    };
    const draftValue = draftValues[entry.uid] ?? proposed.value;
    const currentValue = currentValues[entry.entryKey] ?? emptyStoredValue();
    const initialTier = metadata.initialTier ?? 1;
    const hasGear = metadata.hasGear ?? true;
    const visibleFields = getVisibleComparisonFields(hasGear);
    const currentIsUpdate =
      draftValue?.current != null &&
      !isMinimumCurrentDraftValue(draftValue.current, visibleFields, initialTier) &&
      isStudentStateCurrentChanged(draftValue.current, currentValue.current, { initialTier, hasGear });
    const targetIsUpdate = isStudentStateTargetChanged(draftValue?.target ?? null, currentValue.target, {
      initialTier,
      hasGear,
    });

    return [
      {
        entry,
        metadata,
        currentValue,
        proposed,
        draftValue,
        confidence: parseConfidence(entry.meta),
        currentIsUpdate,
        targetIsUpdate,
      },
    ];
  });
  const visibleRows = rows.filter((row) => row.proposed.error || row.currentIsUpdate || row.targetIsUpdate);
  const errorRows = rows.filter((row) => row.proposed.error);
  const lowConfidenceRows = visibleRows.filter((row) => row.confidence !== null && row.confidence < 0.7);

  const updateCurrentValue = (entryUid: string, field: keyof StudentStateStoredCurrentValue, value: number | null) => {
    setDraftValues((values) => {
      const draftValue = values[entryUid];
      if (!draftValue?.current) {
        return values;
      }

      return {
        ...values,
        [entryUid]: {
          ...draftValue,
          current: {
            ...draftValue.current,
            [field]: value,
          },
        },
      };
    });
  };

  const updateTargetValue = (entryUid: string, field: keyof StudentStateStoredTargetValue, value: number | null) => {
    setDraftValues((values) => {
      const draftValue = values[entryUid];
      if (!draftValue?.target) {
        return values;
      }

      return {
        ...values,
        [entryUid]: {
          ...draftValue,
          target: {
            ...draftValue.target,
            [field]: value,
          },
        },
      };
    });
  };

  return (
    <DraftReviewView
      lowConfidenceCount={lowConfidenceRows.length}
      notices={
        errorRows.length > 0
          ? [
              {
                id: "invalid-student-state-draft-entries",
                tone: "danger",
                content: `읽을 수 없는 항목이 ${errorRows.length.toLocaleString()}개 있어요. 해당 항목은 반영할 수 없어요.`,
              },
            ]
          : []
      }
      actionData={actionData}
      actions={isPending ? <DraftReviewActions applyDisabled={errorRows.length > 0} draftFormId={draftFormId} /> : null}
    >
      <Form method="post" id={draftFormId} className="space-y-3">
        {visibleRows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8">
            <EmptyView Icon={ArchiveBoxIcon} text="검토할 항목이 없어요" />
          </div>
        ) : null}

        {rows.map(({ entry, metadata, currentValue, proposed, draftValue, currentIsUpdate, targetIsUpdate }) =>
          proposed.error || draftValue == null ? null : (
            <Fragment key={`hidden:${entry.uid}`}>
              <StudentStateDraftHiddenInputs
                entryUid={entry.uid}
                value={draftValue}
                currentValue={currentValue}
                initialTier={metadata.initialTier ?? 1}
                hasGear={metadata.hasGear ?? true}
                currentIsUpdate={currentIsUpdate}
                targetIsUpdate={targetIsUpdate}
              />
            </Fragment>
          ),
        )}

        {visibleRows.length > 0 ? (
          <>
            <div className="max-w-full overflow-x-auto">
              <div className="inline-block overflow-hidden rounded-lg border border-neutral-200 align-top dark:border-neutral-700">
                <StudentStateComparisonTable
                  rows={visibleRows}
                  disabled={navigation.state === "submitting" || !isPending}
                  onCurrentChange={updateCurrentValue}
                  onTargetChange={updateTargetValue}
                />
              </div>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              키보드 화살표로 각 입력칸을 이동할 수 있어요
            </p>
          </>
        ) : null}
      </Form>
    </DraftReviewView>
  );
}

function StudentStateComparisonTable({
  rows,
  disabled,
  onCurrentChange,
  onTargetChange,
}: {
  rows: StudentStateDraftReviewRow[];
  disabled: boolean;
  onCurrentChange: (entryUid: string, field: keyof StudentStateStoredCurrentValue, value: number | null) => void;
  onTargetChange: (entryUid: string, field: keyof StudentStateStoredTargetValue, value: number | null) => void;
}) {
  const fields = getVisibleComparisonFields(rows.some((row) => row.metadata.hasGear ?? true));
  const numberInputGridNavigation = useNumberInputGridNavigation();
  let navigationRowIndex = 0;

  return (
    <table className="w-max border-collapse">
      <tbody>
        {rows.map((row, rowIndex) => {
          const { entry, metadata, currentValue, proposed, draftValue, confidence, currentIsUpdate, targetIsUpdate } =
            row;
          const initialTier = metadata.initialTier ?? 1;
          const importedCurrentValue = draftValue?.current ?? null;
          const currentNavigationRowIndex = currentIsUpdate ? navigationRowIndex++ : null;
          const targetNavigationRowIndex = targetIsUpdate ? navigationRowIndex++ : null;
          const visibleRowCount = getVisibleStudentRowCount(row);

          if (proposed.error || draftValue == null || visibleRowCount === 0) {
            return (
              <Fragment key={entry.uid}>
                <StudentHeaderRow
                  entryKey={entry.entryKey}
                  metadata={metadata}
                  confidence={confidence}
                  fields={fields}
                  isFirstRow={rowIndex === 0}
                />
                <tr className="align-middle">
                  <td
                    colSpan={fields.length + 1}
                    className={cn(cellBase, "px-3 py-2 text-sm text-red-700 dark:text-red-300")}
                  >
                    {proposed.error ?? "학생 상태 변경안 데이터를 읽을 수 없어요"}
                  </td>
                </tr>
              </Fragment>
            );
          }

          return (
            <Fragment key={entry.uid}>
              <StudentHeaderRow
                entryKey={entry.entryKey}
                metadata={metadata}
                confidence={confidence}
                fields={fields}
                isFirstRow={rowIndex === 0}
              />
              {currentIsUpdate && draftValue.current != null ? (
                <>
                  <ReadonlyStudentStateRow
                    label="현재 육성 상태"
                    value={currentValue.current}
                    valueType="current"
                    fields={fields}
                    hasGear={metadata.hasGear ?? true}
                  />
                  <EditableStudentStateRow
                    label="가져온 육성 상태"
                    baseValue={currentValue.current}
                    draftValue={importedCurrentValue}
                    valueType="current"
                    fields={fields}
                    hasGear={metadata.hasGear ?? true}
                    initialTier={initialTier}
                    disabled={disabled}
                    entryUid={entry.uid}
                    navigationRowIndex={currentNavigationRowIndex ?? 0}
                    numberInputGridNavigation={numberInputGridNavigation}
                    onChange={onCurrentChange}
                  />
                </>
              ) : null}
              {targetIsUpdate && draftValue.target != null ? (
                <>
                  <ReadonlyStudentStateRow
                    label="현재 육성 목표"
                    value={currentValue.target}
                    valueType="target"
                    fields={fields}
                    hasGear={metadata.hasGear ?? true}
                  />
                  <EditableStudentStateRow
                    label="가져온 육성 목표"
                    baseValue={currentValue.target}
                    draftValue={draftValue.target}
                    valueType="target"
                    fields={fields}
                    hasGear={metadata.hasGear ?? true}
                    initialTier={initialTier}
                    disabled={disabled}
                    entryUid={entry.uid}
                    navigationRowIndex={targetNavigationRowIndex ?? 0}
                    numberInputGridNavigation={numberInputGridNavigation}
                    onChange={onTargetChange}
                  />
                </>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function StudentHeaderRow({
  entryKey,
  metadata,
  confidence,
  fields,
  isFirstRow,
}: {
  entryKey: string;
  metadata: SyncDraftDisplayMetadata;
  confidence: number | null;
  fields: readonly StudentStateComparisonField[];
  isFirstRow: boolean;
}) {
  const equipments = metadata.equipments ?? [];

  return (
    <tr className="bg-neutral-50 text-left text-xs font-semibold tracking-wide text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
      <th colSpan={2} className={cn(studentHeaderCellClass, !isFirstRow && groupTopCellClass)}>
        <div className="flex min-w-0 items-center gap-3">
          <ProfileImage studentUid={metadata.studentUid ?? entryKey} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold normal-case tracking-normal text-neutral-900 dark:text-neutral-50">
              {metadata.label}
            </p>
            {confidence !== null && confidence < 0.7 ? (
              <p className="text-xs font-medium normal-case tracking-normal text-amber-700 dark:text-amber-300">
                인식 신뢰도 {Math.round(confidence * 100)}%
              </p>
            ) : null}
          </div>
        </div>
      </th>
      {fields.slice(1).map((field) => (
        <th
          key={field.label}
          className={cn(cellBase, !isFirstRow && groupTopCellClass, field.headerClassName ?? headerCellClass)}
        >
          <ColumnHeaderLabel field={field} equipments={equipments} />
        </th>
      ))}
    </tr>
  );
}

function getVisibleComparisonFields(hasGear: boolean): readonly StudentStateComparisonField[] {
  return comparisonFields.filter((field) => hasGear || !field.gearOnly);
}

function getVisibleStudentRowCount(row: StudentStateDraftReviewRow): number {
  if (!row.draftValue) {
    return 0;
  }

  return (
    Number(row.currentIsUpdate && row.draftValue.current != null) * 2 +
    Number(row.targetIsUpdate && row.draftValue.target != null) * 2
  );
}

function isStudentStateFieldVisible(field: StudentStateComparisonField, hasGear: boolean): boolean {
  return hasGear || !field.gearOnly;
}

function getReadonlyCellClass(field: StudentStateComparisonField): string {
  return cn(
    cellBase,
    field.dataCellClassName ?? "w-16 px-0.5 py-1.5",
    "text-center text-xs font-medium tabular-nums text-neutral-400 dark:text-neutral-500",
  );
}

function getTargetCellClass(field: StudentStateComparisonField): string {
  return cn(cellBase, field.targetCellClassName ?? "w-16 px-0.5 py-1.5", "text-center");
}

function getSkeletonWidth(field: StudentStateComparisonField): string {
  if (field.kind === "tier") {
    return "w-24";
  }
  return "w-10";
}

function isMinimumCurrentDraftValue(
  value: StudentStateDraftCurrentValue,
  fields: readonly StudentStateComparisonField[],
  initialTier: number,
): boolean {
  return fields.every((field) => {
    const key = field.currentKey;
    if (!key) {
      return true;
    }

    const currentValue = value[key];
    const minimumValue = key === "tier" ? initialTier : field.min;
    return currentValue == null || currentValue <= minimumValue;
  });
}

function ColumnHeaderLabel({ field, equipments }: { field: StudentStateDisplayField; equipments: string[] }) {
  if (field.kind === "tier") {
    return <span className="sr-only">{field.label}</span>;
  }

  const equipmentLabel = getEquipmentLabel(field, equipments);

  return (
    <span className="flex flex-col items-center gap-0.5">
      <span>{field.label}</span>
      {equipmentLabel ? (
        <span className="text-xs font-medium normal-case tracking-normal text-neutral-400 dark:text-neutral-500">
          {equipmentLabel}
        </span>
      ) : null}
    </span>
  );
}

function ReadonlyStudentStateRow({
  label,
  value,
  valueType,
  fields,
  hasGear,
}: {
  label: string;
  value: StudentStateStoredCurrentValue | StudentStateStoredTargetValue;
  valueType: "current" | "target";
  fields: readonly StudentStateComparisonField[];
  hasGear: boolean;
}) {
  if (valueType === "current" && getStudentStateValue(value, "tier") == null) {
    return (
      <tr className="relative align-middle">
        <td className={rowHeaderCellClass}>{label}</td>
        <td colSpan={fields.length} className={cn(cellBase, "relative px-3 py-2")}>
          <div className="pointer-events-none flex select-none items-center gap-2 opacity-20 blur-sm">
            {fields.map((field) => (
              <div key={field.label} className={cn("h-4 rounded-sm bg-muted", getSkeletonWidth(field))} />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500">아직 모집하지 않은 학생이에요</p>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="align-middle">
      <td className={rowHeaderCellClass}>{label}</td>
      {fields.map((field) => {
        const key = valueType === "current" ? field.currentKey : field.targetKey;
        const isFieldVisible = isStudentStateFieldVisible(field, hasGear);
        return (
          <td key={field.label} className={getReadonlyCellClass(field)}>
            {key && isFieldVisible ? (
              <StudentStateReadonlyCell field={field} value={getStudentStateValue(value, key)} />
            ) : (
              "-"
            )}
          </td>
        );
      })}
    </tr>
  );
}

function StudentStateReadonlyCell({ field, value }: { field: StudentStateDisplayField; value: number | null }) {
  return <span>{formatFieldValue(field, value)}</span>;
}

function EditableStudentStateRow({
  label,
  baseValue,
  draftValue,
  valueType,
  fields,
  hasGear,
  initialTier,
  disabled,
  entryUid,
  navigationRowIndex,
  numberInputGridNavigation,
  onChange,
}: {
  label: string;
  baseValue: StudentStateStoredCurrentValue | StudentStateStoredTargetValue;
  draftValue: EditableStudentStateRowValue;
  valueType: "current" | "target";
  fields: readonly StudentStateComparisonField[];
  hasGear: boolean;
  initialTier: number;
  disabled: boolean;
  entryUid: string;
  navigationRowIndex: number;
  numberInputGridNavigation: NumberInputGridNavigation;
  onChange:
    | ((entryUid: string, field: keyof StudentStateStoredCurrentValue, value: number | null) => void)
    | ((entryUid: string, field: keyof StudentStateStoredTargetValue, value: number | null) => void);
}) {
  return (
    <tr className="align-middle">
      <td className={importedRowHeaderCellClass}>{label}</td>
      {draftValue == null ? (
        <td colSpan={fields.length} className={`${cellBase} bg-blue-50/40 px-3 py-2 dark:bg-sky-400/10`}>
          <p className="text-center text-xs font-medium text-neutral-400 dark:text-neutral-500">
            아직 모집하지 않은 학생이에요
          </p>
        </td>
      ) : null}
      {draftValue == null
        ? null
        : fields.map((field, fieldIndex) => {
            const key = valueType === "current" ? field.currentKey : field.targetKey;
            const isFieldVisible = isStudentStateFieldVisible(field, hasGear);
            const base = key && isFieldVisible ? getStudentStateValue(baseValue, key) : null;
            const imported = key && isFieldVisible ? getStudentStateValue(draftValue, key) : null;
            const isChanged =
              key != null &&
              isFieldVisible &&
              isStudentStateComparisonFieldUpdateTarget({
                field,
                valueType,
                baseValue,
                draftValue,
                initialTier,
                hasGear,
              });
            const isDecreased = isChanged && base != null && imported != null && imported < base;
            return (
              <td
                key={field.label}
                className={cn(
                  getTargetCellClass(field),
                  key == null && "bg-background text-muted-foreground dark:bg-background",
                  isChanged && "bg-blue-50/70 dark:bg-sky-400/10",
                  isDecreased && "bg-red-100/80 dark:bg-red-950/40",
                )}
              >
                {key && isFieldVisible ? (
                  <EditableStudentStateCell
                    field={field}
                    value={imported}
                    initialTier={initialTier}
                    isChanged={isChanged}
                    isDecreased={isDecreased}
                    disabled={disabled}
                    inputProps={numberInputGridNavigation.getInputProps({
                      rowIndex: navigationRowIndex,
                      columnIndex: fieldIndex,
                      disabled,
                    })}
                    onChange={(value) => {
                      if (valueType === "current") {
                        (
                          onChange as (
                            entryUid: string,
                            field: keyof StudentStateStoredCurrentValue,
                            value: number | null,
                          ) => void
                        )(
                          entryUid,
                          key as keyof StudentStateStoredCurrentValue,
                          field.kind === "tier" ? (value ?? 1) : value,
                        );
                        return;
                      }

                      (
                        onChange as (
                          entryUid: string,
                          field: keyof StudentStateStoredTargetValue,
                          value: number | null,
                        ) => void
                      )(
                        entryUid,
                        key as keyof StudentStateStoredTargetValue,
                        field.kind === "tier" ? (value ?? 1) : value,
                      );
                    }}
                  />
                ) : (
                  "-"
                )}
              </td>
            );
          })}
    </tr>
  );
}

function getStudentStateValue(value: Record<string, number | null>, key: string): number | null {
  return value[key] ?? null;
}

function isStudentStateComparisonFieldUpdateTarget({
  field,
  valueType,
  baseValue,
  draftValue,
  initialTier,
  hasGear,
}: {
  field: StudentStateComparisonField;
  valueType: "current" | "target";
  baseValue: StudentStateStoredCurrentValue | StudentStateStoredTargetValue;
  draftValue: Exclude<EditableStudentStateRowValue, null>;
  initialTier: number;
  hasGear: boolean;
}): boolean {
  if (valueType === "current") {
    const key = field.currentKey;
    if (!key) {
      return false;
    }
    return isStudentStateCurrentFieldUpdateTarget(
      key,
      draftValue as StudentStateDraftCurrentValue,
      baseValue as StudentStateStoredCurrentValue,
      { initialTier, hasGear },
    );
  }

  const key = field.targetKey;
  if (!key) {
    return false;
  }
  return isStudentStateTargetFieldUpdateTarget(
    key,
    draftValue as StudentStateDraftTargetValue,
    baseValue as StudentStateStoredTargetValue,
    { initialTier, hasGear },
  );
}

function formatFieldValue(field: StudentStateDisplayField, value: number | null): ReactNode {
  return field.kind === "tier" ? formatTier(value, { muted: true }) : formatPlainValue(value);
}

function EditableStudentStateCell({
  field,
  value,
  initialTier,
  isChanged,
  isDecreased,
  disabled,
  inputProps,
  onChange,
}: {
  field: StudentStateDisplayField;
  value: number | null;
  initialTier: number;
  isChanged: boolean;
  isDecreased: boolean;
  disabled: boolean;
  inputProps?: NumberInputGridNavigationInputProps;
  onChange: (value: number | null) => void;
}) {
  if (field.kind === "tier") {
    return (
      <div className={cn("flex flex-col items-center gap-1", disabled && "pointer-events-none opacity-60")}>
        <TierSelector
          initialTier={initialTier}
          currentTier={value ?? initialTier}
          iconSize="sm"
          onTierChange={(tier) => onChange(tier)}
        />
        {isDecreased ? <DecreaseWarningLabel /> : null}
      </div>
    );
  }

  return (
    <div
      className={cn("mx-auto flex w-14 flex-col items-center gap-0.5", disabled && "pointer-events-none opacity-60")}
    >
      <NumberInput
        nullable
        size="sm"
        showDecrease={false}
        showIncrease={false}
        minValue={field.min}
        maxValue={field.max}
        value={value}
        disabled={disabled}
        inputProps={{
          ...inputProps,
          className: cn("font-semibold text-neutral-950 dark:text-neutral-50", inputProps?.className),
        }}
        controlClassName={cn(
          !isChanged && "border-neutral-300 bg-white/70 dark:border-neutral-700 dark:bg-neutral-950/60",
          isChanged && "border-blue-300 bg-white dark:border-sky-500 dark:bg-neutral-950",
          isDecreased && "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/20",
        )}
        onChange={onChange}
      />
      {isDecreased ? <DecreaseWarningLabel /> : null}
    </div>
  );
}

function DecreaseWarningLabel() {
  return <span className="text-xs font-medium text-red-700 dark:text-red-300">기존보다 값이 감소했어요</span>;
}

function getEquipmentLabel(field: StudentStateDisplayField, equipments: string[]): string | undefined {
  const index = field.equipmentIndex;
  if (index == null) {
    return undefined;
  }

  const equipmentType = equipments[index];
  return equipmentType ? (EQUIPMENT_TYPE_LABELS[equipmentType] ?? equipmentType) : undefined;
}

function StudentStateDraftHiddenInputs({
  entryUid,
  value,
  currentValue,
  initialTier,
  hasGear,
  currentIsUpdate,
  targetIsUpdate,
}: {
  entryUid: string;
  value: StudentStateDraftValue;
  currentValue: StudentStateStoredValue;
  initialTier: number;
  hasGear: boolean;
  currentIsUpdate: boolean;
  targetIsUpdate: boolean;
}) {
  const mergedValue = mergeStudentStateDraftValueForUpdate(value, currentValue, { initialTier, hasGear });
  const submitCurrent = currentIsUpdate && mergedValue.current != null;
  const submitTarget = targetIsUpdate && mergedValue.target != null;

  return (
    <>
      <input type="hidden" name={`studentState:${entryUid}:hasCurrent`} value={submitCurrent ? "1" : "0"} />
      {submitCurrent
        ? currentFields.map(({ key }) => (
            <input
              key={`current:${key}`}
              type="hidden"
              name={`studentState:${entryUid}:current:${key}`}
              value={formatFormValue(mergedValue.current?.[key])}
            />
          ))
        : null}
      <input type="hidden" name={`studentState:${entryUid}:hasTarget`} value={submitTarget ? "1" : "0"} />
      {submitTarget
        ? targetFields.map(({ key }) => (
            <input
              key={`target:${key}`}
              type="hidden"
              name={`studentState:${entryUid}:target:${key}`}
              value={formatFormValue(mergedValue.target?.[key])}
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

function formatTier(value: number | null, options?: { muted?: boolean }): ReactNode {
  return value == null ? "-" : <TierStars tier={value} muted={options?.muted ?? false} />;
}

function formatPlainValue(value: number | null): ReactNode {
  return value == null ? "-" : value.toLocaleString();
}

function TierStars({ tier, muted }: { tier: number; muted: boolean }) {
  return (
    <span className={cn("inline-flex items-center", muted && "opacity-80")} aria-label={`${tier}성`}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((eachTier) => {
        const Icon = eachTier <= tier ? StarIconSolid : StarIconOutline;
        return (
          <Icon
            key={eachTier}
            className={cn(
              muted ? "size-3.5" : "size-4",
              eachTier <= 5 ? "text-yellow-500" : "text-teal-500",
              eachTier === 5 && "mr-1",
              eachTier > tier && "opacity-25",
            )}
          />
        );
      })}
    </span>
  );
}
