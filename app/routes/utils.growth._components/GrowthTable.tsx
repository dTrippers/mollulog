import { ArrowPathIcon, UserPlusIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { StudentSearchInput, TierSelector } from "~/components/features/students";
import { Button, NumberInput, ProfileImage, ResourceCard } from "~/components/primitives";
import { EQUIPMENT_TYPE_LABELS } from "~/models/growth-resource";
import type { GrowthActionResult, GrowthAvailableStudent, GrowthStudent } from "./types";

function extractStudentUpdate(actionData: GrowthActionResult | undefined): GrowthStudent | null {
  if (!actionData || !("kind" in actionData)) return null;
  return actionData.kind === "studentUpdate" ? actionData.student : null;
}

function isActionSuccess(actionData: GrowthActionResult | undefined): boolean {
  return Boolean(actionData && "kind" in actionData);
}

function getActionError(actionData: GrowthActionResult | undefined): string | null {
  if (actionData && "error" in actionData) return actionData.error;
  return null;
}

const fieldDefinitions = [
  { key: "level", targetKey: "targetLevel", label: "학생 레벨", min: 1, max: 90 },
  { key: "skillEx", targetKey: "targetSkillEx", label: "EX 스킬", min: 1, max: 5 },
  { key: "skillNormal", targetKey: "targetSkillNormal", label: "기본 스킬", min: 1, max: 10 },
  { key: "skillEnhanced", targetKey: "targetSkillEnhanced", label: "강화 스킬", min: 1, max: 10 },
  { key: "skillSub", targetKey: "targetSkillSub", label: "서브 스킬", min: 1, max: 10 },
  { key: "equip1", targetKey: "targetEquip1", label: "장비1", min: 1, max: 10 },
  { key: "equip2", targetKey: "targetEquip2", label: "장비2", min: 1, max: 10 },
  { key: "equip3", targetKey: "targetEquip3", label: "장비3", min: 1, max: 10 },
  { key: "equipSpecial", targetKey: "targetEquipSpecial", label: "애용품", min: 1, max: 2 },
] as const;

type CurrentFieldKey = (typeof fieldDefinitions)[number]["key"];
type TargetFieldKey = (typeof fieldDefinitions)[number]["targetKey"];
type GrowthValues = Record<CurrentFieldKey | TargetFieldKey, number | null>;
type RelationshipValues = {
  relationshipCurrentLevel: number | null;
  relationshipTargetLevel: number | null;
};

function pickGrowthValues(student: GrowthStudent): GrowthValues {
  return {
    level: student.level,
    skillEx: student.skillEx,
    skillNormal: student.skillNormal,
    skillEnhanced: student.skillEnhanced,
    skillSub: student.skillSub,
    equip1: student.equip1,
    equip2: student.equip2,
    equip3: student.equip3,
    equipSpecial: student.equipSpecial,
    targetLevel: student.targetLevel,
    targetSkillEx: student.targetSkillEx,
    targetSkillNormal: student.targetSkillNormal,
    targetSkillEnhanced: student.targetSkillEnhanced,
    targetSkillSub: student.targetSkillSub,
    targetEquip1: student.targetEquip1,
    targetEquip2: student.targetEquip2,
    targetEquip3: student.targetEquip3,
    targetEquipSpecial: student.targetEquipSpecial,
  };
}

function pickRelationshipValues(student: GrowthStudent): RelationshipValues {
  return {
    relationshipCurrentLevel: student.relationshipCurrentLevel,
    relationshipTargetLevel: student.relationshipTargetLevel,
  };
}

function getClientValidationError(values: GrowthValues): string | null {
  for (const { key, targetKey, label, min, max } of fieldDefinitions) {
    const v = values[key];
    const t = values[targetKey];
    if (v != null && (v < min || v > max)) return `${label}은(는) ${min}부터 ${max} 사이만 입력할 수 있어요`;
    if (t != null && (t < min || t > max)) return `${label} 목표값은 ${min}부터 ${max} 사이만 입력할 수 있어요`;
  }
  return null;
}

function getRelationshipValidationError(values: RelationshipValues): string | null {
  const { relationshipCurrentLevel, relationshipTargetLevel } = values;

  if (relationshipCurrentLevel != null && (relationshipCurrentLevel < 1 || relationshipCurrentLevel > 100)) {
    return "현재 인연 랭크는 1부터 100 사이만 입력할 수 있어요";
  }

  if (relationshipTargetLevel != null && (relationshipTargetLevel < 1 || relationshipTargetLevel > 100)) {
    return "목표 인연 랭크는 1부터 100 사이만 입력할 수 있어요";
  }

  if (
    relationshipCurrentLevel != null &&
    relationshipTargetLevel != null &&
    relationshipTargetLevel < relationshipCurrentLevel
  ) {
    return "목표 인연 랭크는 현재 인연 랭크보다 낮을 수 없어요";
  }

  return null;
}

const cellBase = "border-b border-neutral-200 dark:border-neutral-700";
const dataCellClass = `${cellBase} w-25 px-1 py-2`;
const targetCellClass = `${cellBase} w-25 px-1 py-1.5 bg-blue-50/40 dark:bg-blue-950/10`;
const bulkActionCellClass = `${cellBase} border-l border-neutral-200 px-2 py-2 dark:border-neutral-700`;

function isGearField(key: CurrentFieldKey | TargetFieldKey): boolean {
  return key === "equipSpecial" || key === "targetEquipSpecial";
}

function GrowthRow({ student, onStudentUpdate }: { student: GrowthStudent; onStudentUpdate: (s: GrowthStudent) => void }) {
  const fetcher = useFetcher<GrowthActionResult>();
  const initialValues = useMemo(() => pickGrowthValues(student), [student]);
  const [savedValues, setSavedValues] = useState<GrowthValues>(initialValues);
  const [draftValues, setDraftValues] = useState<GrowthValues>(initialValues);
  const [growthError, setGrowthError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef<{ values: GrowthValues; targetTier: number | null } | null>(null);

  const [targetTierDraft, setTargetTierDraft] = useState<number | null>(student.targetTier);
  const [targetTierSaved, setTargetTierSaved] = useState<number | null>(student.targetTier);

  const relationshipFetcher = useFetcher<GrowthActionResult>();
  const initialRelationshipValues = useMemo(() => pickRelationshipValues(student), [student]);
  const [savedRelationshipValues, setSavedRelationshipValues] = useState<RelationshipValues>(initialRelationshipValues);
  const [draftRelationshipValues, setDraftRelationshipValues] = useState<RelationshipValues>(initialRelationshipValues);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const relationshipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relationshipSubmittedRef = useRef<RelationshipValues | null>(null);

  const tierFetcher = useFetcher<GrowthActionResult>();
  const [tierDraft, setTierDraft] = useState(student.tier ?? student.initialTier);
  const tierSubmittedRef = useRef<number | null>(null);

  const removeFetcher = useFetcher<GrowthActionResult>();
  const enrollFetcher = useFetcher<GrowthActionResult>();

  const [isPendingSave, setIsPendingSave] = useState(false);

  const equipLabels: Partial<Record<CurrentFieldKey | TargetFieldKey, string>> = {
    equip1: EQUIPMENT_TYPE_LABELS[student.equipments[0]] ?? "",
    equip2: EQUIPMENT_TYPE_LABELS[student.equipments[1]] ?? "",
    equip3: EQUIPMENT_TYPE_LABELS[student.equipments[2]] ?? "",
    targetEquip1: EQUIPMENT_TYPE_LABELS[student.equipments[0]] ?? "",
    targetEquip2: EQUIPMENT_TYPE_LABELS[student.equipments[1]] ?? "",
    targetEquip3: EQUIPMENT_TYPE_LABELS[student.equipments[2]] ?? "",
  };

  useEffect(() => {
    // Always sync tier display
    setTierDraft(student.tier ?? student.initialTier);
    const shouldKeepSubmittedValues =
      fetcher.state === "idle" &&
      saveTimerRef.current == null &&
      submittedRef.current != null &&
      isActionSuccess(fetcher.data);
    if (shouldKeepSubmittedValues) return;
    // Skip draft reset if growth save is in-flight or pending
    if (fetcher.state !== "idle" || saveTimerRef.current != null) return;
    setSavedValues(initialValues);
    setDraftValues(initialValues);
    setTargetTierDraft(student.targetTier);
    setTargetTierSaved(student.targetTier);
    setGrowthError(null);
    submittedRef.current = null;
    tierSubmittedRef.current = null;
  }, [initialValues, student.targetTier, student.tier, student.initialTier, fetcher.state, fetcher.data]);

  useEffect(() => {
    const shouldKeepSubmittedValues =
      relationshipFetcher.state === "idle" &&
      relationshipSaveTimerRef.current == null &&
      relationshipSubmittedRef.current != null &&
      isActionSuccess(relationshipFetcher.data);
    if (shouldKeepSubmittedValues) return;
    if (relationshipFetcher.state !== "idle" || relationshipSaveTimerRef.current != null) return;
    setSavedRelationshipValues(initialRelationshipValues);
    setDraftRelationshipValues(initialRelationshipValues);
    setRelationshipError(null);
    relationshipSubmittedRef.current = null;
  }, [initialRelationshipValues, relationshipFetcher.state, relationshipFetcher.data]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    setIsPendingSave(false);
    if (!submittedRef.current) return;
    const submitted = submittedRef.current;
    submittedRef.current = null;
    if (isActionSuccess(fetcher.data)) {
      setSavedValues({ ...submitted.values });
      setDraftValues({ ...submitted.values });
      setTargetTierSaved(submitted.targetTier);
      setTargetTierDraft(submitted.targetTier);
      setGrowthError(null);
      const next = extractStudentUpdate(fetcher.data);
      if (next) onStudentUpdate(next);
    } else {
      const err = getActionError(fetcher.data);
      if (err) {
        setGrowthError(err);
        setDraftValues(savedValues);
        setTargetTierDraft(targetTierSaved);
      }
    }
  }, [fetcher.state, fetcher.data, savedValues, targetTierSaved, onStudentUpdate]);

  useEffect(() => {
    if (relationshipFetcher.state !== "idle" || !relationshipSubmittedRef.current) return;
    const submitted = relationshipSubmittedRef.current;
    relationshipSubmittedRef.current = null;
    if (isActionSuccess(relationshipFetcher.data)) {
      setSavedRelationshipValues({ ...submitted });
      setDraftRelationshipValues({ ...submitted });
      setRelationshipError(null);
      const next = extractStudentUpdate(relationshipFetcher.data);
      if (next) onStudentUpdate(next);
    } else {
      const err = getActionError(relationshipFetcher.data);
      if (err) {
        setRelationshipError(err);
        setDraftRelationshipValues(savedRelationshipValues);
      }
    }
  }, [relationshipFetcher.state, relationshipFetcher.data, savedRelationshipValues, onStudentUpdate]);

  useEffect(() => {
    if (tierFetcher.state !== "idle") return;
    setIsPendingSave(false);
    if (tierSubmittedRef.current == null) return;
    const submitted = tierSubmittedRef.current;
    tierSubmittedRef.current = null;
    if (isActionSuccess(tierFetcher.data)) {
      const next = extractStudentUpdate(tierFetcher.data);
      if (next) onStudentUpdate(next);
    } else {
      void submitted;
      setTierDraft(student.tier ?? student.initialTier);
    }
  }, [tierFetcher.state, tierFetcher.data, student.tier, student.initialTier, onStudentUpdate]);

  const scheduleAutoSave = (values: GrowthValues, targetTier: number | null) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setIsPendingSave(true);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const validationError = getClientValidationError(values);
      if (validationError) {
        setGrowthError(validationError);
        setIsPendingSave(false);
        return;
      }
      setGrowthError(null);
      submittedRef.current = { values, targetTier };
      fetcher.submit(
        { studentUid: student.uid, ...values, targetTier },
        { method: "post", encType: "application/json" },
      );
    }, 500);
  };

  const scheduleRelationshipSave = (values: RelationshipValues) => {
    if (relationshipSaveTimerRef.current) clearTimeout(relationshipSaveTimerRef.current);
    relationshipSaveTimerRef.current = setTimeout(() => {
      relationshipSaveTimerRef.current = null;
      const validationError = getRelationshipValidationError(values);
      if (validationError) {
        setRelationshipError(validationError);
        return;
      }
      setRelationshipError(null);
      relationshipSubmittedRef.current = values;
      relationshipFetcher.submit(
        {
          _intent: "relationship",
          studentUid: student.uid,
          currentLevel: values.relationshipCurrentLevel,
          targetLevel: values.relationshipTargetLevel,
        },
        { method: "post", encType: "application/json" },
      );
    }, 500);
  };

  const effectiveTier = student.isRecruited ? tierDraft : student.initialTier;
  const handleFieldChange = (field: keyof GrowthValues, nextValue: number | null) => {
    const newValues = { ...draftValues, [field]: nextValue };
    setDraftValues(newValues);
    scheduleAutoSave(newValues, targetTierDraft);
  };

  const handleRelationshipFieldChange = (field: keyof RelationshipValues, nextValue: number | null) => {
    const newValues = { ...draftRelationshipValues, [field]: nextValue };
    setDraftRelationshipValues(newValues);
    scheduleRelationshipSave(newValues);
  };

  const handleTargetTierChange = (newTier: number) => {
    const clamped = Math.max(newTier, effectiveTier);
    setTargetTierDraft(clamped);
    scheduleAutoSave(draftValues, clamped);
  };

  const handleCurrentTierChange = (newTier: number) => {
    setTierDraft(newTier);
    setIsPendingSave(true);
    tierSubmittedRef.current = newTier;
    tierFetcher.submit(
      { _intent: "tier", studentUid: student.uid, tier: newTier },
      { method: "post", encType: "application/json" },
    );
  };

  const handleSetAllMaxCurrent = () => {
    const newValues = { ...draftValues };
    for (const { key, max } of fieldDefinitions) {
      if (!student.hasGear && isGearField(key)) {
        continue;
      }
      newValues[key] = max;
    }
    setDraftValues(newValues);
    // Submit growth immediately (no debounce) to avoid race with tier revalidation
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const validationError = getClientValidationError(newValues);
    if (!validationError) {
      setGrowthError(null);
      setIsPendingSave(true);
      submittedRef.current = { values: newValues, targetTier: targetTierDraft };
      fetcher.submit(
        { studentUid: student.uid, ...newValues, targetTier: targetTierDraft },
        { method: "post", encType: "application/json" },
      );
    }
  };

  const handleSetAllMaxTargets = () => {
    const newValues = { ...draftValues };
    for (const { targetKey, max } of fieldDefinitions) {
      if (!student.hasGear && isGearField(targetKey)) {
        continue;
      }
      newValues[targetKey] = max;
    }
    setDraftValues(newValues);
    scheduleAutoSave(newValues, targetTierDraft);
  };

  const displayedError = growthError ?? relationshipError;

  return (
    <>
      <tr className="bg-neutral-100 dark:bg-neutral-900">
        <td colSpan={TOTAL_COLS} className={`${cellBase} px-3 py-2`}>
          <div className="flex items-center gap-2">
            <div className="flex grow items-center gap-2 min-w-0">
              <ProfileImage studentUid={student.uid} />
              <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">{student.name}</span>
              {displayedError && <p className="text-xs text-red-500 dark:text-red-400">{displayedError}</p>}
            </div>
            {(student.relationshipCurrentLevel != null || student.relationshipTargetLevel != null) && (
              <Link to="/utils/relationship">
                <Button size="xs">
                  인연 랭크 계산기
                </Button>
              </Link>
            )}
            <Button
              size="xs"
              variant="tint-red"
              onClick={() =>
                confirm("정말로 성장 목표를 삭제할까요? 삭제된 기록은 복구할 수 없어요.") &&
                removeFetcher.submit(
                  { _intent: "remove", studentUid: student.uid },
                  { method: "post", encType: "application/json" },
                )
              }
            >
              삭제
            </Button>
          </div>
        </td>
      </tr>

      <tr className="align-top relative">

        <td
          className={`${cellBase} w-10 px-1 py-2 text-center text-xs font-medium text-neutral-400 dark:text-neutral-500`}
        >
          현재
        </td>

        {student.isRecruited ? (
          <>
            <td className={`${cellBase} min-w-28 px-2 py-2`}>
              <TierSelector
                initialTier={student.initialTier}
                currentTier={tierDraft}
                onTierChange={handleCurrentTierChange}
              />
            </td>

            <td className={`${cellBase} w-25 px-1 py-2`}>
              <NumberInput
                nullable
                compact
                showMax
                minValue={1}
                maxValue={100}
                value={draftRelationshipValues.relationshipCurrentLevel}
                onChange={(v) => handleRelationshipFieldChange("relationshipCurrentLevel", v)}
              />
            </td>

            <td className={bulkActionCellClass}>
              <Button size="xs" onClick={handleSetAllMaxCurrent}>
                모두 최대
              </Button>
            </td>

            {fieldDefinitions.map(({ key, min, max }) => (
              <td key={key} className={dataCellClass}>
                {student.hasGear || !isGearField(key) ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <NumberInput
                      nullable
                      compact
                      showMax
                      minValue={min}
                      maxValue={max}
                      value={draftValues[key]}
                      onChange={(v) => handleFieldChange(key, v)}
                    />
                    {equipLabels[key] && (
                      <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">
                        {equipLabels[key]}
                      </span>
                    )}
                  </div>
                ) : null}
              </td>
            ))}
          </>
        ) : (
          <>
            <td className={`${cellBase} min-w-28 px-3 py-2 text-center`}>
              <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">미모집</span>
            </td>

            <td className={`${cellBase} w-25 px-1 py-2`}>
              <NumberInput
                nullable
                compact
                showMax
                minValue={1}
                maxValue={100}
                value={draftRelationshipValues.relationshipCurrentLevel}
                onChange={(v) => handleRelationshipFieldChange("relationshipCurrentLevel", v)}
              />
            </td>

            <td className={bulkActionCellClass} />

            <td colSpan={fieldDefinitions.length} className={`${cellBase} relative px-3 py-2`}>
              <div className="pointer-events-none select-none opacity-20 blur-sm flex items-center gap-2">
                {fieldDefinitions.map(({ key }) => (
                  <div key={key} className="h-4 w-10 rounded bg-neutral-400 dark:bg-neutral-500" />
                ))}
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                {student.released ? (
                  <Button
                    size="xs"
                    onClick={() =>
                      enrollFetcher.submit(
                        { _intent: "enroll", studentUid: student.uid },
                        { method: "post", encType: "application/json" },
                      )
                    }
                  >
                    모집 학생으로 등록
                  </Button>
                ) : (
                  <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500">
                    아직 모집하지 않은 학생이에요
                  </p>
                )}
              </div>
            </td>
          </>
        )}
      </tr>

      <tr className="align-top">
        <td
          className={`${cellBase} w-10 px-1 py-1.5 text-center text-xs font-medium text-blue-500 bg-blue-50/40 dark:text-blue-400 dark:bg-blue-950/10`}
        >
          목표
        </td>

        <td className={`${cellBase} min-w-28 px-2 py-1.5 bg-blue-50/40 dark:bg-blue-950/10`}>
          <TierSelector
            initialTier={student.initialTier}
            currentTier={targetTierDraft ?? tierDraft}
            onTierChange={handleTargetTierChange}
          />
        </td>

        <td className={targetCellClass}>
          <NumberInput
            nullable
            compact
            showMax
            minValue={1}
            maxValue={100}
            value={draftRelationshipValues.relationshipTargetLevel}
            onChange={(v) => handleRelationshipFieldChange("relationshipTargetLevel", v)}
          />
        </td>

        <td className={`${bulkActionCellClass} bg-blue-50/40 dark:bg-blue-950/10`}>
          <Button size="xs" onClick={handleSetAllMaxTargets}>
            모두 최대
          </Button>
        </td>

        {fieldDefinitions.map(({ targetKey, min, max }) => {
          return (
            <td key={targetKey} className={targetCellClass}>
              {student.hasGear || !isGearField(targetKey) ? (
                <div className="flex flex-col items-center gap-0.5">
                  <NumberInput
                    nullable
                    compact
                    showMax
                    minValue={min}
                    maxValue={max}
                    value={draftValues[targetKey]}
                    onChange={(v) => handleFieldChange(targetKey, v)}
                  />
                  {equipLabels[targetKey] && (
                    <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">
                      {equipLabels[targetKey]}
                    </span>
                  )}
                </div>
              ) : null}
            </td>
          );
        })}
      </tr>

      <tr className="align-top">
        <td
          className={`${cellBase} w-10 px-1 py-2 text-center text-xs font-medium text-emerald-600 bg-emerald-50/60 dark:text-emerald-400 dark:bg-emerald-950/10`}
        >
          재화
        </td>
        <td
          colSpan={fieldDefinitions.length + 3}
          className={`relative ${cellBase} w-0 max-w-0 px-3 pt-2 pb-3 bg-emerald-50/20 dark:bg-emerald-950/5`}
        >
          {(() => {
            const isCalculating = isPendingSave || fetcher.state !== "idle" || tierFetcher.state !== "idle";
            return (
              <>
                <div className={`${isCalculating ? "opacity-40 pointer-events-none" : ""} transition-opacity duration-200`}>
                  {student.resourceRequirements.items.length > 0 ? (
                    <div className="flex min-w-0 max-w-full flex-wrap items-start gap-2">
                      {student.resourceRequirements.items.map((item) => (
                        <ResourceCard
                          key={`${student.uid}-${item.uid}`}
                          itemUid={item.uid}
                          resourceType={item.type}
                          rarity={item.rarity}
                          label={item.amount.toLocaleString()}
                          name={item.name}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-center font-medium text-neutral-400 dark:text-neutral-500">
                      필요한 재화가 없어요
                    </p>
                  )}
                </div>
                {isCalculating && (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    <ArrowPathIcon className="size-4 animate-spin" />
                    <span>재화 계산 중...</span>
                  </div>
                )}
              </>
            );
          })()}
        </td>
      </tr>
    </>
  );
}

const TOTAL_COLS = 4 + fieldDefinitions.length;

function AddStudentRow({ availableStudents, isFirst }: { availableStudents: GrowthAvailableStudent[]; isFirst: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const fetcher = useFetcher();

  return (
    <tr>
      <td colSpan={TOTAL_COLS} className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
        {isFirst && (
          <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
            학생 이름을 검색하여 성장 목표를 관리할 학생을 등록해주세요.
          </p>
        )}
        {isOpen ? (
          <div className="py-1 max-w-md">
            <StudentSearchInput
              placeholder="학생 이름으로 검색해서 추가..."
              students={availableStudents}
              grid={6}
              size="sm"
              onSelect={(studentUid) => {
                fetcher.submit({ _intent: "add", studentUid }, { method: "post", encType: "application/json" });
              }}
            />
            <Button size="sm" variant="default" onClick={() => setIsOpen(false)}>
              취소
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="inverse" onClick={() => setIsOpen(true)}>
            <UserPlusIcon className="size-4" />
            학생 추가
          </Button>
        )}
      </td>
    </tr>
  );
}

export default function GrowthTable({
  students,
  availableStudents,
  onStudentUpdate,
}: {
  students: GrowthStudent[];
  availableStudents: GrowthAvailableStudent[];
  onStudentUpdate: (student: GrowthStudent) => void;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-block align-top overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
        <table className="w-max border-collapse">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              <th className="px-1 py-3" />
              <th className="px-2 py-3 text-center">성급</th>
              <th className="min-w-20 px-2 py-3 text-center">인연 랭크</th>
              <th className="px-2 py-3 text-center">일괄 적용</th>
              {fieldDefinitions.map(({ key, label }) => (
                <th key={key} className="w-16 px-1 py-3 text-center">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AddStudentRow availableStudents={availableStudents} isFirst={students.length === 0} />
            {students.map((student) => (
              <GrowthRow key={student.uid} student={student} onStudentUpdate={onStudentUpdate} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
