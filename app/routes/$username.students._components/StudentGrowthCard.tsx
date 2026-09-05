import { PencilSquareIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { StudentCard, TierSelector } from "~/components/features/students";
import { Button, Callout, NumberInput, SectionCard } from "~/components/primitives";
import { useNumberInputGridNavigation } from "~/components/primitives/useNumberInputGridNavigation";
import type { UserStudent, UserStudentsGrowth } from "~/views/user-students.server";
import TierStars from "./TierStars";

export const CURRENT_STATE_INTENT = "current-state";

type CurrentStateActionResult =
  | { intent: typeof CURRENT_STATE_INTENT; success: true }
  | { intent: typeof CURRENT_STATE_INTENT; error: string };

type GrowthStudent = UserStudent & { growth: UserStudentsGrowth; tier: number };

type StudentGrowthDraft = {
  tier: number;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  abilityHp: number | null;
  abilityAtk: number | null;
  abilityHeal: number | null;
};

type StudentGrowthCardProps = {
  student: GrowthStudent;
  editable: boolean;
  editDisabled?: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => void;
  onDirtyChange: (studentUid: string, dirty: boolean) => void;
};

const skillFields = [
  { key: "skillEx", label: "EX", min: 1, max: 5 },
  { key: "skillNormal", label: "기본", min: 1, max: 10 },
  { key: "skillEnhanced", label: "강화", min: 1, max: 10 },
  { key: "skillSub", label: "서브", min: 1, max: 10 },
] as const satisfies ReadonlyArray<{
  key: keyof Pick<StudentGrowthDraft, "skillEx" | "skillNormal" | "skillEnhanced" | "skillSub">;
  label: string;
  min: number;
  max: number;
}>;

const equipmentFields = [
  { key: "equip1", label: "장비 1", index: 0 },
  { key: "equip2", label: "장비 2", index: 1 },
  { key: "equip3", label: "장비 3", index: 2 },
] as const;

const abilityFields = [
  { key: "abilityHp", label: "HP 해방" },
  { key: "abilityAtk", label: "공격력 해방" },
  { key: "abilityHeal", label: "치유력 해방" },
] as const;

function createDraft(student: GrowthStudent): StudentGrowthDraft {
  return {
    tier: student.tier,
    level: student.growth.level,
    skillEx: student.growth.skillEx,
    skillNormal: student.growth.skillNormal,
    skillEnhanced: student.growth.skillEnhanced,
    skillSub: student.growth.skillSub,
    equip1: student.growth.equip1,
    equip2: student.growth.equip2,
    equip3: student.growth.equip3,
    equipSpecial: student.growth.equipSpecial,
    abilityHp: student.growth.abilityHp,
    abilityAtk: student.growth.abilityAtk,
    abilityHeal: student.growth.abilityHeal,
  };
}

export function isAbilityEditable(abilityCatalogAvailable: boolean, tier: number): boolean {
  return abilityCatalogAvailable && tier > 5;
}

export function shouldAutoFocusGrowthEditor(editing: boolean): boolean {
  return editing;
}

function displayValue(value: number | null, prefix = "") {
  return value == null ? "미등록" : `${prefix}${value}`;
}

function Metric({
  label,
  value,
  prefix = "",
  unavailable = false,
}: {
  label: string;
  value: number | null;
  prefix?: string;
  unavailable?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/50 px-1.5 py-2">
      <span className="block truncate text-xs text-muted-foreground">{label}</span>
      <strong className="mt-1 block whitespace-nowrap text-xs font-semibold tabular-nums sm:text-sm">
        {unavailable ? "해당 없음" : displayValue(value, prefix)}
      </strong>
    </div>
  );
}

export default function StudentGrowthCard({
  student,
  editable,
  editDisabled = false,
  editing,
  onEdit,
  onCancel,
  onSaved,
  onDirtyChange,
}: StudentGrowthCardProps) {
  const fetcher = useFetcher<CurrentStateActionResult>();
  const [draft, setDraft] = useState<StudentGrowthDraft>(() => createDraft(student));
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveRequestedRef = useRef(false);
  const savedDraft = useMemo(() => createDraft(student), [student]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);
  const saving = fetcher.state !== "idle";
  const abilityAvailable = isAbilityEditable(student.growth.abilityCatalogAvailable, draft.tier);
  const { getInputProps } = useNumberInputGridNavigation({ tabNavigation: true });

  useEffect(() => {
    if (!editing) {
      setDraft(savedDraft);
    }
  }, [editing, savedDraft]);

  useEffect(() => {
    if (editing) onDirtyChange(student.uid, dirty);
  }, [dirty, editing, onDirtyChange, student.uid]);

  useEffect(() => {
    if (!saveRequestedRef.current || fetcher.state !== "idle" || !fetcher.data) return;
    saveRequestedRef.current = false;
    if ("success" in fetcher.data && fetcher.data.success) {
      onDirtyChange(student.uid, false);
      onSaved();
    } else if ("error" in fetcher.data) {
      setSaveError(fetcher.data.error);
    }
  }, [fetcher.data, fetcher.state, onDirtyChange, onSaved, student.uid]);

  const updateDraft = <K extends keyof StudentGrowthDraft>(key: K, value: StudentGrowthDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    if (!dirty || saving) return;
    const formData = new FormData();
    formData.set("intent", CURRENT_STATE_INTENT);
    formData.set("studentUid", student.uid);
    if (draft.tier !== savedDraft.tier) {
      formData.set("tier", String(draft.tier));
    }
    setSaveError(null);
    for (const key of ["level", "skillEx", "skillNormal", "skillEnhanced", "skillSub"] as const) {
      if (draft[key] !== savedDraft[key]) {
        formData.set(key, draft[key] == null ? "" : String(draft[key]));
      }
    }
    for (const field of equipmentFields) {
      if (student.growth.equipmentAvailable[field.index] && draft[field.key] !== savedDraft[field.key]) {
        formData.set(field.key, draft[field.key] == null ? "" : String(draft[field.key]));
      }
    }
    if (student.growth.equipSpecialAvailable && draft.equipSpecial !== savedDraft.equipSpecial) {
      formData.set("equipSpecial", draft.equipSpecial == null ? "" : String(draft.equipSpecial));
    }
    if (abilityAvailable) {
      for (const field of abilityFields) {
        if (draft[field.key] !== savedDraft[field.key]) {
          formData.set(field.key, draft[field.key] == null ? "" : String(draft[field.key]));
        }
      }
    }
    saveRequestedRef.current = true;
    fetcher.submit(formData, { method: "post" });
  };

  const handleCancel = () => {
    if (saving) return;
    setDraft(savedDraft);
    onDirtyChange(student.uid, false);
    onCancel();
  };

  if (!editing) {
    return (
      <SectionCard className="min-w-0 space-y-3 p-3 md:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="w-11 shrink-0">
            <StudentCard uid={student.uid} name={student.name} hideName tier={undefined} flush />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="break-keep text-base font-semibold">{student.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <TierStars tier={student.tier} size="md" />
              <span className="whitespace-nowrap">학생 Lv. {displayValue(student.growth.level)}</span>
            </div>
          </div>
          {editable ? (
            <Button
              icon={PencilSquareIcon}
              text="성장도 편집"
              variant="secondary"
              size="xs"
              disabled={editDisabled}
              onClick={onEdit}
            />
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {skillFields.map((field) => (
            <Metric key={field.key} label={field.label} value={student.growth[field.key]} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {equipmentFields.map((field) => (
            <Metric
              key={field.key}
              label={field.label}
              value={student.growth[field.key]}
              prefix="T"
              unavailable={!student.growth.equipmentAvailable[field.index]}
            />
          ))}
          <Metric
            label="애용품"
            value={student.growth.equipSpecial}
            prefix="T"
            unavailable={!student.growth.equipSpecialAvailable}
          />
        </div>
        {student.growth.abilityAvailable ? (
          <div className="grid grid-cols-3 gap-2">
            {abilityFields.map((field) => (
              <Metric key={field.key} label={field.label} value={student.growth[field.key]} />
            ))}
          </div>
        ) : null}
      </SectionCard>
    );
  }

  return (
    <SectionCard className="min-w-0 space-y-4 p-3 ring-2 ring-primary/20 md:p-4">
      <div className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-2 gap-y-2">
        <div className="w-11 shrink-0">
          <StudentCard uid={student.uid} name={student.name} hideName tier={undefined} flush />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-keep text-base font-semibold">{student.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>성급</span>
            <TierSelector
              initialTier={student.initialTier}
              currentTier={draft.tier}
              iconSize="sm"
              disabled={saving}
              onTierChange={(tier) => updateDraft("tier", tier)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <NumberInput
          label="학생 Lv"
          nullable
          value={draft.level}
          minValue={1}
          maxValue={90}
          fullWidth
          disabled={saving}
          onChange={(value) => updateDraft("level", value)}
          inputProps={{
            ...getInputProps({ rowIndex: 0, columnIndex: 0, disabled: saving }),
            "aria-label": `${student.name} 학생 레벨`,
            autoFocus: shouldAutoFocusGrowthEditor(editing),
          }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {skillFields.map((field, index) => (
          <NumberInput
            key={field.key}
            label={field.label}
            nullable
            value={draft[field.key]}
            minValue={field.min}
            maxValue={field.max}
            fullWidth
            showDecrease={false}
            showIncrease={false}
            disabled={saving}
            onChange={(value) => updateDraft(field.key, value)}
            inputProps={{
              ...getInputProps({ rowIndex: 1, columnIndex: index, disabled: saving }),
              "aria-label": `${student.name} ${field.label} 스킬 레벨`,
            }}
          />
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">장비 및 애용품</p>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {equipmentFields.map((field, index) =>
            student.growth.equipmentAvailable[field.index] ? (
              <NumberInput
                key={field.key}
                label={`${field.label} 티어`}
                nullable
                value={draft[field.key]}
                minValue={1}
                maxValue={10}
                fullWidth
                showDecrease={false}
                showIncrease={false}
                disabled={saving}
                onChange={(value) => updateDraft(field.key, value)}
                inputProps={{
                  ...getInputProps({ rowIndex: 2, columnIndex: index, disabled: saving }),
                  "aria-label": `${student.name} ${field.label} 티어`,
                }}
              />
            ) : (
              <div
                key={field.key}
                className="flex min-h-16 items-center rounded-md bg-muted/50 px-2 text-xs text-muted-foreground"
              >
                {field.label}: 해당 없음
              </div>
            ),
          )}
          {student.growth.equipSpecialAvailable ? (
            <NumberInput
              label="애용품 티어"
              nullable
              value={draft.equipSpecial}
              minValue={1}
              maxValue={2}
              fullWidth
              showDecrease={false}
              showIncrease={false}
              disabled={saving}
              onChange={(value) => updateDraft("equipSpecial", value)}
              inputProps={{
                ...getInputProps({ rowIndex: 2, columnIndex: 3, disabled: saving }),
                "aria-label": `${student.name} 애용품 티어`,
              }}
            />
          ) : (
            <div className="flex min-h-16 items-center rounded-md bg-muted/50 px-2 text-xs text-muted-foreground">
              애용품: 해당 없음
            </div>
          )}
        </div>
      </div>

      {abilityAvailable ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">능력 개방</p>
          <div className="grid grid-cols-3 gap-3">
            {abilityFields.map((field, index) => (
              <NumberInput
                key={field.key}
                label={field.label}
                nullable
                value={draft[field.key]}
                minValue={0}
                maxValue={25}
                fullWidth
                showDecrease={false}
                showIncrease={false}
                disabled={saving}
                onChange={(value) => updateDraft(field.key, value)}
                inputProps={{
                  ...getInputProps({ rowIndex: 3, columnIndex: index, disabled: saving }),
                  "aria-label": `${student.name} ${field.label} 단계`,
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {saveError ? <Callout tone="destructive" title={saveError} /> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground" aria-live="polite">
          {saving ? "저장 중이에요..." : dirty ? "변경 사항이 있어요" : "변경 사항 없음"}
        </span>
        <Button text="취소" variant="secondary" size="sm" disabled={saving} onClick={handleCancel} />
        <Button
          text={saving ? "저장 중" : "저장"}
          variant="primary"
          size="sm"
          disabled={!dirty || saving}
          onClick={handleSave}
        />
      </div>
    </SectionCard>
  );
}

export type { CurrentStateActionResult, GrowthStudent, StudentGrowthCardProps, StudentGrowthDraft };
