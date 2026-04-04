import { Link, useFetcher } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, NumberInput, ProfileImage } from "~/components/primitives";
import { TierSelector } from "~/components/features/students";

type GrowthStudent = {
  uid: string;
  name: string;
  isRecruited: boolean;
  released: boolean;
  tier: number | null;
  initialTier: number;
  targetTier: number | null;
  relationshipLevel: number | null;
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
};

type ActionResult = {
  success?: boolean;
  error?: string;
};

const fieldDefinitions = [
  { key: "level", targetKey: "targetLevel", label: "레벨", min: 1, max: 90 },
  { key: "skillEx", targetKey: "targetSkillEx", label: "EX", min: 1, max: 5 },
  { key: "skillNormal", targetKey: "targetSkillNormal", label: "기본", min: 1, max: 10 },
  { key: "skillEnhanced", targetKey: "targetSkillEnhanced", label: "강화", min: 1, max: 10 },
  { key: "skillSub", targetKey: "targetSkillSub", label: "서브", min: 1, max: 10 },
  { key: "equip1", targetKey: "targetEquip1", label: "장비1", min: 1, max: 10 },
  { key: "equip2", targetKey: "targetEquip2", label: "장비2", min: 1, max: 10 },
  { key: "equip3", targetKey: "targetEquip3", label: "장비3", min: 1, max: 10 },
  { key: "equipSpecial", targetKey: "targetEquipSpecial", label: "애장품", min: 1, max: 2 },
] as const;

type CurrentFieldKey = (typeof fieldDefinitions)[number]["key"];
type TargetFieldKey = (typeof fieldDefinitions)[number]["targetKey"];
type GrowthValues = Record<CurrentFieldKey | TargetFieldKey, number | null>;

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

function getClientValidationError(values: GrowthValues): string | null {
  for (const { key, targetKey, label, min, max } of fieldDefinitions) {
    const v = values[key];
    const t = values[targetKey];
    if (v != null && (v < min || v > max)) return `${label}은(는) ${min}부터 ${max} 사이만 입력할 수 있어요`;
    if (t != null && (t < min || t > max)) return `${label} 목표값은 ${min}부터 ${max} 사이만 입력할 수 있어요`;
  }
  return null;
}

function formatDelta(delta: number) {
  return `${delta > 0 ? "+" : ""}${delta}`;
}

function getDeltaClass(delta: number) {
  if (delta > 0) return "text-blue-600 dark:text-blue-400";
  if (delta < 0) return "text-red-600 dark:text-red-400";
  return "text-neutral-400 dark:text-neutral-500";
}

const cellBase = "border-b border-neutral-200 dark:border-neutral-800";
const dataCellClass = `${cellBase} w-25 px-1 py-2`;
const targetCellClass = `${cellBase} w-25 px-1 py-1.5 bg-blue-50/40 dark:bg-blue-950/10`;

function GrowthRow({ student }: { student: GrowthStudent }) {
  const fetcher = useFetcher<ActionResult>();
  const initialValues = useMemo(() => pickGrowthValues(student), [student]);
  const [savedValues, setSavedValues] = useState<GrowthValues>(initialValues);
  const [draftValues, setDraftValues] = useState<GrowthValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef<{ values: GrowthValues; targetTier: number | null } | null>(null);

  const [targetTierDraft, setTargetTierDraft] = useState<number | null>(student.targetTier);
  const [targetTierSaved, setTargetTierSaved] = useState<number | null>(student.targetTier);

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
    setError(null);
    submittedRef.current = null;
    tierSubmittedRef.current = null;
  }, [initialValues, student.targetTier, student.tier, student.initialTier, fetcher.state]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !submittedRef.current) return;
    const submitted = submittedRef.current;
    submittedRef.current = null;
    if (fetcher.data?.success) {
      setSavedValues({ ...submitted.values });
      setTargetTierSaved(submitted.targetTier);
      setError(null);
    } else if (fetcher.data?.error) {
      setError(fetcher.data.error);
      setDraftValues(savedValues);
      setTargetTierDraft(targetTierSaved);
    }
  }, [fetcher.state, fetcher.data, savedValues, targetTierSaved]);

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
      const validationError = getClientValidationError(values);
      if (validationError) { setError(validationError); return; }
      setError(null);
      submittedRef.current = { values, targetTier };
      fetcher.submit(
        { studentUid: student.uid, ...values, targetTier },
        { method: "post", encType: "application/json" },
      );
    }, 500);
  };

  const effectiveTier = student.isRecruited ? tierDraft : student.initialTier;
  const tierDelta = targetTierDraft != null ? targetTierDraft - effectiveTier : null;

  const handleFieldChange = (field: keyof GrowthValues, nextValue: number | null) => {
    const newValues = { ...draftValues, [field]: nextValue };
    setDraftValues(newValues);
    scheduleAutoSave(newValues, targetTierDraft);
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
      newValues[key] = max;
    }
    setDraftValues(newValues);
    // Submit growth immediately (no debounce) to avoid race with tier revalidation
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    const validationError = getClientValidationError(newValues);
    if (!validationError) {
      setError(null);
      submittedRef.current = { values: newValues, targetTier: targetTierDraft };
      fetcher.submit(
        { studentUid: student.uid, ...newValues, targetTier: targetTierDraft },
        { method: "post", encType: "application/json" },
      );
    }
    handleCurrentTierChange(9);
  };

  const handleSetAllMaxTargets = () => {
    const newValues = { ...draftValues };
    for (const { targetKey, max } of fieldDefinitions) {
      newValues[targetKey] = max;
    }
    setDraftValues(newValues);
    setTargetTierDraft(9);
    scheduleAutoSave(newValues, 9);
  };

  const studentCell = (
    <td
      rowSpan={2}
      className={`sticky left-0 z-10 min-w-32 ${cellBase} bg-white px-3 py-2 dark:bg-neutral-950`}
    >
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ProfileImage studentUid={student.uid} />
            <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-50">
              {student.name}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
            <button
              type="button"
              className="text-xs text-red-500 dark:text-red-400 hover:underline cursor-pointer"
              onClick={() => confirm("정말로 성장 목표를 삭제할까요? 삭제된 기록은 복구할 수 없어요.") && removeFetcher.submit(
                { _intent: "remove", studentUid: student.uid },
                { method: "post", encType: "application/json" },
              )}
            >
              삭제
            </button>
          </div>
          {error && <p className="mt-0.5 text-[11px] text-red-500 dark:text-red-400">{error}</p>}
        </div>
      </div>
    </td>
  );

  return (
    <>
      {/* Current values row */}
      <tr className="align-middle relative">
        {studentCell}

        {/* Row label */}
        <td className={`${cellBase} w-10 px-1 py-2 text-center text-xs font-medium text-neutral-400 dark:text-neutral-500`}>
          현재
        </td>

        <td className={`${cellBase} px-2 py-2`}>
          <Button size="xs" onClick={handleSetAllMaxCurrent}>
            모두 최대
          </Button>
        </td>

        {student.isRecruited ? (
          <>
            {/* Current tier */}
            <td className={`${cellBase} min-w-28 px-2 py-2`}>
              <TierSelector
                initialTier={student.initialTier}
                currentTier={tierDraft}
                onTierChange={handleCurrentTierChange}
              />
            </td>

            {/* Current value cells */}
            {fieldDefinitions.map(({ key, min, max }) => (
              <td key={key} className={dataCellClass}>
                <NumberInput
                  nullable compact showMax
                  minValue={min} maxValue={max}
                  value={draftValues[key]}
                  onChange={(v) => handleFieldChange(key, v)}
                />
              </td>
            ))}

            {/* Relationship */}
            <td className={`${cellBase} min-w-20 px-2 py-2 text-center`}>
              <Link to="/utils/relationship" className="text-sm text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
                {student.relationshipLevel != null ? `Lv.${student.relationshipLevel}` : "설정"}
              </Link>
            </td>
          </>
        ) : (
          /* Not recruited: blurred placeholder + overlay message */
          <td colSpan={fieldDefinitions.length + 2} className={`${cellBase} relative px-3 py-2`}>
            <div className="pointer-events-none select-none opacity-20 blur-sm flex items-center gap-2">
              <div className="h-4 w-24 rounded bg-neutral-400 dark:bg-neutral-500" />
              {fieldDefinitions.map(({ key }) => (
                <div key={key} className="h-4 w-10 rounded bg-neutral-400 dark:bg-neutral-500" />
              ))}
              <div className="h-4 w-14 rounded bg-neutral-400 dark:bg-neutral-500" />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              {student.released ? (
                <Button
                  size="xs"
                  onClick={() => enrollFetcher.submit(
                    { _intent: "enroll", studentUid: student.uid },
                    { method: "post", encType: "application/json" },
                  )}
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
        )}
      </tr>

      {/* Target values row */}
      <tr className="align-middle">
        {/* Row label */}
        <td className={`${cellBase} w-10 px-1 py-1.5 text-center text-xs font-medium text-blue-500 bg-blue-50/40 dark:text-blue-400 dark:bg-blue-950/10`}>
          목표
        </td>

        <td className={`${cellBase} px-2 py-2 bg-blue-50/40 dark:bg-blue-950/10`}>
          <Button size="xs" onClick={handleSetAllMaxTargets}>
            모두 최대
          </Button>
        </td>

        {/* Target tier */}
        <td className={`${cellBase} min-w-28 px-2 py-1.5 bg-blue-50/40 dark:bg-blue-950/10`}>
          <TierSelector
            initialTier={student.initialTier}
            currentTier={targetTierDraft ?? tierDraft}
            onTierChange={handleTargetTierChange}
          />
          {/* {tierDelta != null && tierDelta !== 0 && (
            <p className={`mt-0.5 text-center text-xs font-medium ${getDeltaClass(tierDelta)}`}>
              {formatDelta(tierDelta)}
            </p>
          )} */}
        </td>

        {/* Target value cells */}
        {fieldDefinitions.map(({ targetKey, min, max }) => {
          // const currentVal = draftValues[key];
          // const effectiveCurrent = student.isRecruited ? currentVal : min;
          // const delta = effectiveCurrent != null && draftValues[targetKey] != null ? draftValues[targetKey] - effectiveCurrent : null;

          return (
            <td key={targetKey} className={targetCellClass}>
              <NumberInput
                nullable compact showMax
                minValue={min} maxValue={max}
                value={draftValues[targetKey]}
                onChange={(v) => handleFieldChange(targetKey, v)}
              />
            </td>
          );
        })}

        {/* Resource cost placeholder */}
        <td className={`${targetCellClass} min-w-20 px-2 py-1.5 text-center text-xs text-neutral-400 dark:text-neutral-500`}>
          {/* TODO: resource cost calculation from BAQL */}
          재료 준비 중
        </td>
      </tr>
    </>
  );
}

export default function GrowthTable({ students }: { students: GrowthStudent[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
      <table className="border-collapse">
        <thead className="bg-neutral-50 dark:bg-neutral-900">
          <tr className="text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            <th className="sticky left-0 z-10 min-w-32 bg-neutral-50 px-3 py-3 dark:bg-neutral-900">학생</th>
            <th className="px-1 py-3" />
            <th className="px-1 py-3" />
            <th className="px-2 py-3 text-center">성급</th>
            {fieldDefinitions.map(({ key, label }) => (
              <th key={key} className="w-16 px-1 py-3 text-center">{label}</th>
            ))}
            <th className="min-w-20 px-2 py-3 text-center">인연</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <GrowthRow key={student.uid} student={student} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
