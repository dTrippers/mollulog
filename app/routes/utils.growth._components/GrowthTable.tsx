import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { TierSelector } from "~/components/features/students";
import { Button, NumberInput, ProfileImage, ResourceCard } from "~/components/primitives";
import type { GrowthResourceItem } from "~/models/growth-resource";

type GrowthStudent = {
  uid: string;
  name: string;
  isRecruited: boolean;
  released: boolean;
  hasGear: boolean;
  tier: number | null;
  initialTier: number;
  targetTier: number | null;
  relationshipCurrentLevel: number | null;
  relationshipTargetLevel: number | null;
  level: number | null;
  skillEx: number | null;
  skillNormal: number | null;
  skillEnhanced: number | null;
  skillSub: number | null;
  equip1: number | null;
  equip2: number | null;
  equip3: number | null;
  equipSpecial: number | null;
  targetLevel: number | null;
  targetSkillEx: number | null;
  targetSkillNormal: number | null;
  targetSkillEnhanced: number | null;
  targetSkillSub: number | null;
  targetEquip1: number | null;
  targetEquip2: number | null;
  targetEquip3: number | null;
  targetEquipSpecial: number | null;
  resourceRequirements: {
    items: GrowthResourceItem[];
    skillUnavailable: boolean;
  };
};

type ActionResult = {
  success?: boolean;
  error?: string;
};

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

const cellBase = "border-b border-neutral-200 dark:border-neutral-800";
const dataCellClass = `${cellBase} w-25 px-1 py-2`;
const targetCellClass = `${cellBase} w-25 px-1 py-1.5 bg-blue-50/40 dark:bg-blue-950/10`;
const bulkActionCellClass = `${cellBase} border-l border-neutral-200 px-2 py-2 dark:border-neutral-800`;

function isGearField(key: CurrentFieldKey | TargetFieldKey): boolean {
  return key === "equipSpecial" || key === "targetEquipSpecial";
}

function GrowthRow({ student }: { student: GrowthStudent }) {
  const fetcher = useFetcher<ActionResult>();
  const initialValues = useMemo(() => pickGrowthValues(student), [student]);
  const [savedValues, setSavedValues] = useState<GrowthValues>(initialValues);
  const [draftValues, setDraftValues] = useState<GrowthValues>(initialValues);
  const [growthError, setGrowthError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef<{ values: GrowthValues; targetTier: number | null } | null>(null);

  const [targetTierDraft, setTargetTierDraft] = useState<number | null>(student.targetTier);
  const [targetTierSaved, setTargetTierSaved] = useState<number | null>(student.targetTier);

  const relationshipFetcher = useFetcher<ActionResult>();
  const initialRelationshipValues = useMemo(() => pickRelationshipValues(student), [student]);
  const [savedRelationshipValues, setSavedRelationshipValues] = useState<RelationshipValues>(initialRelationshipValues);
  const [draftRelationshipValues, setDraftRelationshipValues] = useState<RelationshipValues>(initialRelationshipValues);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const relationshipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relationshipSubmittedRef = useRef<RelationshipValues | null>(null);

  const tierFetcher = useFetcher<ActionResult>();
  const [tierDraft, setTierDraft] = useState(student.tier ?? student.initialTier);
  const tierSubmittedRef = useRef<number | null>(null);

  const removeFetcher = useFetcher<ActionResult>();
  const enrollFetcher = useFetcher<ActionResult>();

  useEffect(() => {
    // Always sync tier display
    setTierDraft(student.tier ?? student.initialTier);
    // Skip draft reset if growth save is in-flight or pending
    if (fetcher.state !== "idle" || saveTimerRef.current != null) return;
    setSavedValues(initialValues);
    setDraftValues(initialValues);
    setTargetTierDraft(student.targetTier);
    setTargetTierSaved(student.targetTier);
    setGrowthError(null);
    submittedRef.current = null;
    tierSubmittedRef.current = null;
  }, [initialValues, student.targetTier, student.tier, student.initialTier, fetcher.state]);

  useEffect(() => {
    if (relationshipFetcher.state !== "idle" || relationshipSaveTimerRef.current != null) return;
    setSavedRelationshipValues(initialRelationshipValues);
    setDraftRelationshipValues(initialRelationshipValues);
    setRelationshipError(null);
    relationshipSubmittedRef.current = null;
  }, [initialRelationshipValues, relationshipFetcher.state]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !submittedRef.current) return;
    const submitted = submittedRef.current;
    submittedRef.current = null;
    if (fetcher.data?.success) {
      setSavedValues({ ...submitted.values });
      setTargetTierSaved(submitted.targetTier);
      setGrowthError(null);
    } else if (fetcher.data?.error) {
      setGrowthError(fetcher.data.error);
      setDraftValues(savedValues);
      setTargetTierDraft(targetTierSaved);
    }
  }, [fetcher.state, fetcher.data, savedValues, targetTierSaved]);

  useEffect(() => {
    if (relationshipFetcher.state !== "idle" || !relationshipSubmittedRef.current) return;
    const submitted = relationshipSubmittedRef.current;
    relationshipSubmittedRef.current = null;
    if (relationshipFetcher.data?.success) {
      setSavedRelationshipValues({ ...submitted });
      setRelationshipError(null);
    } else if (relationshipFetcher.data?.error) {
      setRelationshipError(relationshipFetcher.data.error);
      setDraftRelationshipValues(savedRelationshipValues);
    }
  }, [relationshipFetcher.state, relationshipFetcher.data, savedRelationshipValues]);

  useEffect(() => {
    if (tierFetcher.state !== "idle" || tierSubmittedRef.current == null) return;
    const submitted = tierSubmittedRef.current;
    tierSubmittedRef.current = null;
    if (!tierFetcher.data?.success) {
      setTierDraft(student.tier ?? student.initialTier);
    } else {
      void submitted;
    }
  }, [tierFetcher.state, tierFetcher.data, student.tier, student.initialTier]);

  const scheduleAutoSave = (values: GrowthValues, targetTier: number | null) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const validationError = getClientValidationError(values);
      if (validationError) {
        setGrowthError(validationError);
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

  const studentCell = (
    <td rowSpan={3} className={`sticky left-0 z-10 min-w-32 ${cellBase} bg-white px-3 py-2 dark:bg-neutral-950`}>
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ProfileImage studentUid={student.uid} />
            <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">{student.name}</span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
            <button
              type="button"
              className="text-xs text-red-500 dark:text-red-400 hover:underline cursor-pointer"
              onClick={() =>
                confirm("정말로 성장 목표를 삭제할까요? 삭제된 기록은 복구할 수 없어요.") &&
                removeFetcher.submit(
                  { _intent: "remove", studentUid: student.uid },
                  { method: "post", encType: "application/json" },
                )
              }
            >
              삭제
            </button>
          </div>
          {displayedError && <p className="mt-0.5 text-[11px] text-red-500 dark:text-red-400">{displayedError}</p>}
        </div>
      </div>
    </td>
  );

  return (
    <>
      <tr className="align-middle relative">
        {studentCell}

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
                  <NumberInput
                    nullable
                    compact
                    showMax
                    minValue={min}
                    maxValue={max}
                    value={draftValues[key]}
                    onChange={(v) => handleFieldChange(key, v)}
                  />
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

      <tr className="align-middle">
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
                <NumberInput
                  nullable
                  compact
                  showMax
                  minValue={min}
                  maxValue={max}
                  value={draftValues[targetKey]}
                  onChange={(v) => handleFieldChange(targetKey, v)}
                />
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
          className={`${cellBase} w-0 max-w-0 px-3 pt-2 pb-3 bg-emerald-50/20 dark:bg-emerald-950/5`}
        >
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
              {draftRelationshipValues.relationshipTargetLevel != null && (
                <Button to="/utils/relationship" size="xs" variant="tint-blue">
                  인연 랭크 계산기로
                </Button>
              )}
            </div>
          ) : (
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">추가 재화 없음</p>
              {draftRelationshipValues.relationshipTargetLevel != null && (
                <Button to="/utils/relationship" size="xs" variant="tint-blue">
                  인연 랭크 계산기로
                </Button>
              )}
            </div>
          )}
          {student.resourceRequirements.skillUnavailable && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              스킬 재화는 BAQL 응답을 불러오지 못해 제외됐어요.
            </p>
          )}
        </td>
      </tr>
    </>
  );
}

export default function GrowthTable({ students }: { students: GrowthStudent[] }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="inline-block align-top rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-max border-collapse">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              <th className="sticky left-0 z-10 min-w-32 bg-neutral-50 px-3 py-3 dark:bg-neutral-900">학생</th>
              <th className="px-1 py-3" />
              <th className="px-2 py-3 text-center">성급</th>
              <th className="min-w-20 px-2 py-3 text-center">인연 랭크</th>
              <th className="border-l border-neutral-200 px-2 py-3 text-center dark:border-neutral-800">일괄 적용</th>
              {fieldDefinitions.map(({ key, label }) => (
                <th key={key} className="w-16 px-1 py-3 text-center">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <GrowthRow key={student.uid} student={student} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
