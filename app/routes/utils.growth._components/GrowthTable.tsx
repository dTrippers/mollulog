import { ArrowPathIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { StudentSelectForm } from "~/components/features/forms";
import { TierSelector } from "~/components/features/students";
import { Button, NumberInput, ProfileImage, ResourceCard, useNumberInputGridNavigation } from "~/components/primitives";
import { CHARACTER_EXP_REPORTS, EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  getWeaponLevelMaxByTier,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";
import { getRelationshipLevelValidationError } from "~/models/relationship-level";
import type { GrowthActionResult, GrowthAvailableStudent, GrowthStudent } from "./types";

function extractStudentUpdate(actionData: GrowthActionResult | undefined): GrowthStudent | null {
  if (!actionData || !("kind" in actionData)) return null;
  return actionData.kind === "studentUpdate" ? actionData.student : null;
}

function isActionSuccess(actionData: GrowthActionResult | undefined): boolean {
  return Boolean(actionData && "kind" in actionData);
}

function getActionSubmissionId(actionData: GrowthActionResult | undefined): string | null {
  if (!actionData || !("kind" in actionData)) {
    return null;
  }
  if (actionData.kind !== "studentUpdate") {
    return null;
  }
  return actionData.submissionId ?? null;
}

function getActionError(actionData: GrowthActionResult | undefined): string | null {
  if (actionData && "error" in actionData) return actionData.error;
  return null;
}

const fieldDefinitions = [
  { key: "level", targetKey: "targetLevel", label: "학생 Lv", min: 1, max: 90 },
  { key: "weaponLevel", targetKey: "targetWeaponLevel", label: "고유무기 Lv", min: 0, max: WEAPON_LEVEL_MAX_LEVEL },
  { key: "skillEx", targetKey: "targetSkillEx", label: "EX 스킬", min: 1, max: 5 },
  { key: "skillNormal", targetKey: "targetSkillNormal", label: "기본 스킬", min: 1, max: 10 },
  { key: "skillEnhanced", targetKey: "targetSkillEnhanced", label: "강화 스킬", min: 1, max: 10 },
  { key: "skillSub", targetKey: "targetSkillSub", label: "서브 스킬", min: 1, max: 10 },
  { key: "equip1", targetKey: "targetEquip1", label: "장비1", min: 1, max: 10 },
  { key: "equip2", targetKey: "targetEquip2", label: "장비2", min: 1, max: 10 },
  { key: "equip3", targetKey: "targetEquip3", label: "장비3", min: 1, max: 10 },
  { key: "equipSpecial", targetKey: "targetEquipSpecial", label: "애용품", min: 1, max: 2 },
  { key: "abilityHp", targetKey: "targetAbilityHp", label: "HP 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  { key: "abilityAtk", targetKey: "targetAbilityAtk", label: "공격력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
  { key: "abilityHeal", targetKey: "targetAbilityHeal", label: "치유력 해방", min: 0, max: ABILITY_RELEASE_MAX_LEVEL },
] as const;

type CurrentFieldKey = (typeof fieldDefinitions)[number]["key"];
type TargetFieldKey = (typeof fieldDefinitions)[number]["targetKey"];
type GrowthValues = Record<CurrentFieldKey | TargetFieldKey, number | null>;
type NumberInputGridNavigation = ReturnType<typeof useNumberInputGridNavigation>;
type RelationshipValues = {
  relationshipCurrentLevel: number | null;
  relationshipTargetLevel: number | null;
};

function pickGrowthValues(student: GrowthStudent): GrowthValues {
  return {
    level: student.level,
    weaponLevel: student.weaponLevel,
    abilityHp: student.abilityHp,
    abilityAtk: student.abilityAtk,
    abilityHeal: student.abilityHeal,
    skillEx: student.skillEx,
    skillNormal: student.skillNormal,
    skillEnhanced: student.skillEnhanced,
    skillSub: student.skillSub,
    equip1: student.equip1,
    equip2: student.equip2,
    equip3: student.equip3,
    equipSpecial: student.equipSpecial,
    targetLevel: student.targetLevel,
    targetWeaponLevel: student.targetWeaponLevel,
    targetAbilityHp: student.targetAbilityHp,
    targetAbilityAtk: student.targetAbilityAtk,
    targetAbilityHeal: student.targetAbilityHeal,
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

function getClientValidationError(values: GrowthValues, currentTier: number, targetTier: number | null): string | null {
  for (const { key, targetKey, label, min, max } of fieldDefinitions) {
    const v = values[key];
    const t = values[targetKey];
    const currentMax = getFieldMax(key, max, currentTier);
    const effectiveTargetTier = targetTier ?? currentTier;
    const targetMax = getFieldMax(targetKey, max, effectiveTargetTier);
    if (isAbilityReleaseDisabled(key, currentTier) && (v ?? 0) > 0) {
      return "능력 해방은 고유무기 장착 후 입력할 수 있어요";
    }
    if (isAbilityReleaseDisabled(targetKey, effectiveTargetTier) && (t ?? 0) > 0) {
      return "능력 해방 목표값은 고유무기 장착 후 입력할 수 있어요";
    }
    if (v != null && (v < min || v > currentMax))
      return `${label}은(는) ${min}부터 ${currentMax} 사이만 입력할 수 있어요`;
    if (t != null && (t < min || t > targetMax))
      return `${label} 목표값은 ${min}부터 ${targetMax} 사이만 입력할 수 있어요`;
  }
  return null;
}

const cellBase = "border-b border-border";
const dataCellClass = `${cellBase} w-25 px-1 py-2`;
const targetCellClass = `${cellBase} w-25 px-1 py-1.5 bg-blue-50/40 dark:bg-blue-950/10`;
const bulkActionCellClass = `${cellBase} border-l border-border px-2 py-2`;
const stickyRowLabelClass = "sticky left-0 z-20 border-r border-border";
const studentHeaderContentClass =
  "sticky left-3 z-10 flex w-max max-w-[calc(100vw-2rem)] items-center gap-2 bg-muted pr-3";

function isGearField(key: CurrentFieldKey | TargetFieldKey): boolean {
  return key === "equipSpecial" || key === "targetEquipSpecial";
}

function isWeaponLevelField(key: CurrentFieldKey | TargetFieldKey): boolean {
  return key === "weaponLevel" || key === "targetWeaponLevel";
}

function isAbilityReleaseField(key: CurrentFieldKey | TargetFieldKey): boolean {
  return (
    key === "abilityHp" ||
    key === "abilityAtk" ||
    key === "abilityHeal" ||
    key === "targetAbilityHp" ||
    key === "targetAbilityAtk" ||
    key === "targetAbilityHeal"
  );
}

function isAbilityReleaseDisabled(key: CurrentFieldKey | TargetFieldKey, tier: number): boolean {
  return isAbilityReleaseField(key) && tier <= 5;
}

function getFieldMax(key: CurrentFieldKey | TargetFieldKey, fallbackMax: number, tier: number): number {
  return isWeaponLevelField(key) ? getWeaponLevelMaxByTier(tier) : fallbackMax;
}

function normalizeTargetValuesForTier(values: GrowthValues, tier: number): GrowthValues {
  const nextValues = { ...values };
  const weaponLevelMax = getWeaponLevelMaxByTier(tier);
  if (nextValues.targetWeaponLevel != null && nextValues.targetWeaponLevel > weaponLevelMax) {
    nextValues.targetWeaponLevel = weaponLevelMax;
  }

  if (tier <= 5) {
    nextValues.targetAbilityHp = null;
    nextValues.targetAbilityAtk = null;
    nextValues.targetAbilityHeal = null;
  }

  return nextValues;
}

type GrowthSubmission = {
  id: string;
  values: GrowthValues;
  targetTier: number | null;
  draftRevision: number;
};

type RelationshipSubmission = {
  id: string;
  values: RelationshipValues;
};

type RowState = {
  savedValues: GrowthValues;
  draftValues: GrowthValues;
  growthError: string | null;
  targetTierDraft: number | null;
  targetTierSaved: number | null;
  growthDraftRevision: number;
  savedRelationshipValues: RelationshipValues;
  draftRelationshipValues: RelationshipValues;
  relationshipError: string | null;
  tierDraft: number;
  enrollError: string | null;
  isPendingSave: boolean;
};

type RowAction =
  | { type: "syncGrowth"; values: GrowthValues; targetTier: number | null; tier: number }
  | { type: "syncRelationship"; values: RelationshipValues }
  | { type: "setDraftValues"; values: GrowthValues; draftRevision: number }
  | { type: "setDraftRelationshipValues"; values: RelationshipValues }
  | { type: "setTargetTierDraft"; targetTier: number | null; draftRevision: number }
  | { type: "setTierDraft"; tier: number }
  | { type: "setPendingSave"; pending: boolean }
  | { type: "setGrowthError"; error: string | null }
  | { type: "setRelationshipError"; error: string | null }
  | { type: "clearEnrollError" }
  | { type: "growthSuccess"; submitted: GrowthSubmission }
  | { type: "growthFailure"; error: string; submitted: GrowthSubmission }
  | { type: "relationshipSuccess"; submitted: RelationshipSubmission }
  | { type: "relationshipFailure"; error: string }
  | { type: "tierFailure"; tier: number }
  | { type: "enrollSuccess" }
  | { type: "enrollFailure"; error: string };

function createRowState(
  initialValues: GrowthValues,
  initialRelationshipValues: RelationshipValues,
  student: GrowthStudent,
): RowState {
  return {
    savedValues: initialValues,
    draftValues: initialValues,
    growthError: null,
    targetTierDraft: student.targetTier,
    targetTierSaved: student.targetTier,
    growthDraftRevision: 0,
    savedRelationshipValues: initialRelationshipValues,
    draftRelationshipValues: initialRelationshipValues,
    relationshipError: null,
    tierDraft: student.tier ?? student.initialTier,
    enrollError: null,
    isPendingSave: false,
  };
}

function rowReducer(state: RowState, action: RowAction): RowState {
  switch (action.type) {
    case "syncGrowth":
      return {
        ...state,
        savedValues: action.values,
        draftValues: action.values,
        targetTierDraft: action.targetTier,
        targetTierSaved: action.targetTier,
        growthDraftRevision: 0,
        tierDraft: action.tier,
        growthError: null,
        enrollError: null,
      };
    case "syncRelationship":
      return {
        ...state,
        savedRelationshipValues: action.values,
        draftRelationshipValues: action.values,
        relationshipError: null,
      };
    case "setDraftValues":
      return { ...state, draftValues: action.values, growthDraftRevision: action.draftRevision };
    case "setDraftRelationshipValues":
      return { ...state, draftRelationshipValues: action.values };
    case "setTargetTierDraft":
      return { ...state, targetTierDraft: action.targetTier, growthDraftRevision: action.draftRevision };
    case "setTierDraft":
      return { ...state, tierDraft: action.tier };
    case "setPendingSave":
      return { ...state, isPendingSave: action.pending };
    case "setGrowthError":
      return { ...state, growthError: action.error };
    case "setRelationshipError":
      return { ...state, relationshipError: action.error };
    case "clearEnrollError":
      return { ...state, enrollError: null };
    case "growthSuccess":
      return {
        ...state,
        savedValues: { ...action.submitted.values },
        draftValues:
          state.growthDraftRevision === action.submitted.draftRevision
            ? { ...action.submitted.values }
            : state.draftValues,
        targetTierSaved: action.submitted.targetTier,
        targetTierDraft:
          state.growthDraftRevision === action.submitted.draftRevision
            ? action.submitted.targetTier
            : state.targetTierDraft,
        growthError: null,
        isPendingSave: false,
      };
    case "growthFailure":
      return {
        ...state,
        growthError: action.error,
        draftValues:
          state.growthDraftRevision === action.submitted.draftRevision ? state.savedValues : state.draftValues,
        targetTierDraft:
          state.growthDraftRevision === action.submitted.draftRevision ? state.targetTierSaved : state.targetTierDraft,
        isPendingSave: false,
      };
    case "relationshipSuccess":
      return {
        ...state,
        savedRelationshipValues: { ...action.submitted.values },
        draftRelationshipValues: { ...action.submitted.values },
        relationshipError: null,
      };
    case "relationshipFailure":
      return {
        ...state,
        relationshipError: action.error,
        draftRelationshipValues: state.savedRelationshipValues,
      };
    case "tierFailure":
      return { ...state, tierDraft: action.tier, isPendingSave: false };
    case "enrollSuccess":
      return { ...state, enrollError: null };
    case "enrollFailure":
      return { ...state, enrollError: action.error };
  }

  return state;
}

function GrowthRow({
  student,
  rowIndexBase,
  numberInputGridNavigation,
  onStudentUpdate,
}: {
  student: GrowthStudent;
  rowIndexBase: number;
  numberInputGridNavigation: NumberInputGridNavigation;
  onStudentUpdate: (s: GrowthStudent) => void;
}) {
  const fetcher = useFetcher<GrowthActionResult>();
  const initialValues = useMemo(() => pickGrowthValues(student), [student]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef<GrowthSubmission | null>(null);

  const relationshipFetcher = useFetcher<GrowthActionResult>();
  const initialRelationshipValues = useMemo(() => pickRelationshipValues(student), [student]);
  const relationshipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relationshipSubmittedRef = useRef<RelationshipSubmission | null>(null);

  const tierFetcher = useFetcher<GrowthActionResult>();
  const tierSubmittedRef = useRef<{ id: string; tier: number } | null>(null);

  const removeFetcher = useFetcher<GrowthActionResult>();
  const enrollFetcher = useFetcher<GrowthActionResult>();
  const enrollSubmittedRef = useRef<{ id: string } | null>(null);
  const submissionSequenceRef = useRef(0);
  const growthDraftRevisionRef = useRef(0);
  const [rowState, dispatchRow] = useReducer(
    rowReducer,
    { initialValues, initialRelationshipValues, student },
    ({ initialValues, initialRelationshipValues, student }) =>
      createRowState(initialValues, initialRelationshipValues, student),
  );
  const {
    draftValues,
    growthError,
    targetTierDraft,
    draftRelationshipValues,
    relationshipError,
    tierDraft,
    enrollError,
    isPendingSave,
  } = rowState;

  const [isResourceRequirementsOpen, setIsResourceRequirementsOpen] = useState(false);
  const resourceRequirementsContentRef = useRef<HTMLDivElement>(null);
  const [resourceRequirementsHeight, setResourceRequirementsHeight] = useState(0);

  const equipLabels: Partial<Record<CurrentFieldKey | TargetFieldKey, string>> = {
    equip1: EQUIPMENT_TYPE_LABELS[student.equipments[0]] ?? "",
    equip2: EQUIPMENT_TYPE_LABELS[student.equipments[1]] ?? "",
    equip3: EQUIPMENT_TYPE_LABELS[student.equipments[2]] ?? "",
    targetEquip1: EQUIPMENT_TYPE_LABELS[student.equipments[0]] ?? "",
    targetEquip2: EQUIPMENT_TYPE_LABELS[student.equipments[1]] ?? "",
    targetEquip3: EQUIPMENT_TYPE_LABELS[student.equipments[2]] ?? "",
  };

  const nextSubmissionId = () => {
    submissionSequenceRef.current += 1;
    return `${student.uid}:${submissionSequenceRef.current}`;
  };
  const nextGrowthDraftRevision = () => {
    growthDraftRevisionRef.current += 1;
    return growthDraftRevisionRef.current;
  };

  useEffect(() => {
    // Always sync tier display
    const nextTier = student.tier ?? student.initialTier;
    dispatchRow({ type: "setTierDraft", tier: nextTier });
    const shouldKeepSubmittedValues =
      fetcher.state === "idle" &&
      saveTimerRef.current == null &&
      submittedRef.current != null &&
      isActionSuccess(fetcher.data);
    if (shouldKeepSubmittedValues) return;
    // Skip draft reset if growth save is in-flight or pending
    if (fetcher.state !== "idle" || saveTimerRef.current != null) return;
    growthDraftRevisionRef.current = 0;
    dispatchRow({ type: "syncGrowth", values: initialValues, targetTier: student.targetTier, tier: nextTier });
    submittedRef.current = null;
    tierSubmittedRef.current = null;
  }, [initialValues, student.targetTier, student.tier, student.initialTier, fetcher.state, fetcher.data]);

  useEffect(() => {
    if (!isResourceRequirementsOpen) {
      setResourceRequirementsHeight(0);
      return;
    }

    const content = resourceRequirementsContentRef.current;
    if (!content) return;

    const updateHeight = () => {
      setResourceRequirementsHeight(content.scrollHeight);
    };
    updateHeight();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateHeight);
    observer.observe(content);
    return () => observer.disconnect();
  }, [isResourceRequirementsOpen]);

  useEffect(() => {
    const shouldKeepSubmittedValues =
      relationshipFetcher.state === "idle" &&
      relationshipSaveTimerRef.current == null &&
      relationshipSubmittedRef.current != null &&
      isActionSuccess(relationshipFetcher.data);
    if (shouldKeepSubmittedValues) return;
    if (relationshipFetcher.state !== "idle" || relationshipSaveTimerRef.current != null) return;
    dispatchRow({ type: "syncRelationship", values: initialRelationshipValues });
    relationshipSubmittedRef.current = null;
  }, [initialRelationshipValues, relationshipFetcher.state, relationshipFetcher.data]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    dispatchRow({ type: "setPendingSave", pending: false });
    if (!submittedRef.current) return;
    const submitted = submittedRef.current;
    const responseSubmissionId = getActionSubmissionId(fetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    submittedRef.current = null;
    if (isActionSuccess(fetcher.data)) {
      dispatchRow({ type: "growthSuccess", submitted });
      const next = extractStudentUpdate(fetcher.data);
      if (next) onStudentUpdate(next);
    } else {
      const err = getActionError(fetcher.data);
      if (err) {
        dispatchRow({ type: "growthFailure", error: err, submitted });
      }
    }
  }, [fetcher.state, fetcher.data, onStudentUpdate]);

  useEffect(() => {
    if (relationshipFetcher.state !== "idle" || !relationshipSubmittedRef.current) return;
    const submitted = relationshipSubmittedRef.current;
    const responseSubmissionId = getActionSubmissionId(relationshipFetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    relationshipSubmittedRef.current = null;
    if (isActionSuccess(relationshipFetcher.data)) {
      dispatchRow({ type: "relationshipSuccess", submitted });
      const next = extractStudentUpdate(relationshipFetcher.data);
      if (next) onStudentUpdate(next);
    } else {
      const err = getActionError(relationshipFetcher.data);
      if (err) {
        dispatchRow({ type: "relationshipFailure", error: err });
      }
    }
  }, [relationshipFetcher.state, relationshipFetcher.data, onStudentUpdate]);

  useEffect(() => {
    if (tierFetcher.state !== "idle") return;
    dispatchRow({ type: "setPendingSave", pending: false });
    if (tierSubmittedRef.current == null) return;
    const submitted = tierSubmittedRef.current;
    const responseSubmissionId = getActionSubmissionId(tierFetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    tierSubmittedRef.current = null;
    if (isActionSuccess(tierFetcher.data)) {
      const next = extractStudentUpdate(tierFetcher.data);
      if (next) onStudentUpdate(next);
    } else {
      dispatchRow({ type: "tierFailure", tier: student.tier ?? student.initialTier });
    }
  }, [tierFetcher.state, tierFetcher.data, student.tier, student.initialTier, onStudentUpdate]);

  useEffect(() => {
    if (enrollFetcher.state !== "idle") return;
    if (!enrollFetcher.data) return;
    if (!enrollSubmittedRef.current) return;
    const submitted = enrollSubmittedRef.current;
    const responseSubmissionId = getActionSubmissionId(enrollFetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    enrollSubmittedRef.current = null;

    if (isActionSuccess(enrollFetcher.data)) {
      dispatchRow({ type: "enrollSuccess" });
      const next = extractStudentUpdate(enrollFetcher.data);
      if (next) onStudentUpdate(next);
      return;
    }

    const err = getActionError(enrollFetcher.data);
    if (err) {
      dispatchRow({ type: "enrollFailure", error: err });
    }
  }, [enrollFetcher.state, enrollFetcher.data, onStudentUpdate]);

  const scheduleAutoSave = (values: GrowthValues, targetTier: number | null, draftRevision: number) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    dispatchRow({ type: "setPendingSave", pending: true });
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      const validationError = getClientValidationError(values, tierDraft, targetTier);
      if (validationError) {
        dispatchRow({ type: "setGrowthError", error: validationError });
        dispatchRow({ type: "setPendingSave", pending: false });
        return;
      }
      dispatchRow({ type: "setGrowthError", error: null });
      const submissionId = nextSubmissionId();
      submittedRef.current = { id: submissionId, values, targetTier, draftRevision };
      fetcher.submit(
        { studentUid: student.uid, _submissionId: submissionId, ...values, targetTier },
        { method: "post", encType: "application/json" },
      );
    }, 500);
  };

  const scheduleRelationshipSave = (values: RelationshipValues) => {
    if (relationshipSaveTimerRef.current) clearTimeout(relationshipSaveTimerRef.current);
    relationshipSaveTimerRef.current = setTimeout(() => {
      relationshipSaveTimerRef.current = null;
      const validationError = getRelationshipLevelValidationError({
        currentLevel: values.relationshipCurrentLevel,
        targetLevel: values.relationshipTargetLevel,
      });
      if (validationError) {
        dispatchRow({ type: "setRelationshipError", error: validationError });
        return;
      }
      dispatchRow({ type: "setRelationshipError", error: null });
      const submissionId = nextSubmissionId();
      relationshipSubmittedRef.current = { id: submissionId, values };
      relationshipFetcher.submit(
        {
          _intent: "relationship",
          _submissionId: submissionId,
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
    const draftRevision = nextGrowthDraftRevision();
    dispatchRow({ type: "setDraftValues", values: newValues, draftRevision });
    scheduleAutoSave(newValues, targetTierDraft, draftRevision);
  };

  const handleRelationshipFieldChange = (field: keyof RelationshipValues, nextValue: number | null) => {
    const newValues = { ...draftRelationshipValues, [field]: nextValue };
    dispatchRow({ type: "setDraftRelationshipValues", values: newValues });
    scheduleRelationshipSave(newValues);
  };

  const handleTargetTierChange = (newTier: number) => {
    const clamped = Math.max(newTier, effectiveTier);
    const nextValues = normalizeTargetValuesForTier(draftValues, clamped);
    const draftRevision = nextGrowthDraftRevision();
    dispatchRow({ type: "setDraftValues", values: nextValues, draftRevision });
    dispatchRow({ type: "setTargetTierDraft", targetTier: clamped, draftRevision });
    scheduleAutoSave(nextValues, clamped, draftRevision);
  };

  const handleCurrentTierChange = (newTier: number) => {
    dispatchRow({ type: "setTierDraft", tier: newTier });
    dispatchRow({ type: "setPendingSave", pending: true });
    const submissionId = nextSubmissionId();
    tierSubmittedRef.current = { id: submissionId, tier: newTier };
    tierFetcher.submit(
      { _intent: "tier", _submissionId: submissionId, studentUid: student.uid, tier: newTier },
      { method: "post", encType: "application/json" },
    );
  };

  const handleSetAllMaxCurrent = () => {
    const newValues = { ...draftValues };
    for (const { key, max } of fieldDefinitions) {
      if (!student.hasGear && isGearField(key)) {
        continue;
      }
      if (isAbilityReleaseDisabled(key, tierDraft)) {
        continue;
      }
      newValues[key] = getFieldMax(key, max, tierDraft);
    }
    const draftRevision = nextGrowthDraftRevision();
    dispatchRow({ type: "setDraftValues", values: newValues, draftRevision });
    // Submit growth immediately (no debounce) to avoid race with tier revalidation
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const validationError = getClientValidationError(newValues, tierDraft, targetTierDraft);
    if (!validationError) {
      dispatchRow({ type: "setGrowthError", error: null });
      dispatchRow({ type: "setPendingSave", pending: true });
      const submissionId = nextSubmissionId();
      submittedRef.current = { id: submissionId, values: newValues, targetTier: targetTierDraft, draftRevision };
      fetcher.submit(
        { studentUid: student.uid, _submissionId: submissionId, ...newValues, targetTier: targetTierDraft },
        { method: "post", encType: "application/json" },
      );
    }
  };

  const handleSetAllMaxTargets = () => {
    const newValues = { ...draftValues };
    const effectiveTargetTier = targetTierDraft ?? tierDraft;
    for (const { targetKey, max } of fieldDefinitions) {
      if (!student.hasGear && isGearField(targetKey)) {
        continue;
      }
      if (isAbilityReleaseDisabled(targetKey, effectiveTargetTier)) {
        continue;
      }
      newValues[targetKey] = getFieldMax(targetKey, max, effectiveTargetTier);
    }
    const draftRevision = nextGrowthDraftRevision();
    dispatchRow({ type: "setDraftValues", values: newValues, draftRevision });
    scheduleAutoSave(newValues, targetTierDraft, draftRevision);
  };

  const displayedError = enrollError ?? growthError ?? relationshipError;
  const isCalculatingResources = isPendingSave || fetcher.state !== "idle" || tierFetcher.state !== "idle";
  const hasResourceRequirements =
    student.resourceRequirements.items.length > 0 ||
    student.resourceRequirements.characterExp > 0 ||
    student.resourceRequirements.credit > 0;
  const currentNavigationRowIndex = rowIndexBase;
  const targetNavigationRowIndex = rowIndexBase + 1;

  return (
    <>
      <tr className="bg-muted">
        <td colSpan={TOTAL_COLS} className={`${cellBase} px-3 py-2`}>
          <div className={studentHeaderContentClass}>
            <div className="flex min-w-0 grow items-center gap-2">
              <ProfileImage studentUid={student.uid} />
              <span className="truncate text-sm font-semibold text-foreground">{student.name}</span>
              {displayedError && <p className="text-xs text-red-500 dark:text-red-400">{displayedError}</p>}
            </div>
            {(student.relationshipCurrentLevel != null || student.relationshipTargetLevel != null) && (
              <Link to={`/utils/relationship?studentUid=${encodeURIComponent(student.uid)}`}>
                <Button size="xs">인연 랭크 계산기</Button>
              </Link>
            )}
            <Button
              size="xs"
              variant="danger-subtle"
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

      <tr className="relative align-top">
        <td
          className={`${cellBase} ${stickyRowLabelClass} w-10 bg-card px-1 py-2 text-center text-xs font-medium text-muted-foreground`}
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
                size="sm"
                showMax
                minValue={1}
                maxValue={100}
                value={draftRelationshipValues.relationshipCurrentLevel}
                inputProps={numberInputGridNavigation.getInputProps({
                  rowIndex: currentNavigationRowIndex,
                  columnIndex: 0,
                })}
                onChange={(v) => handleRelationshipFieldChange("relationshipCurrentLevel", v)}
              />
            </td>

            <td className={bulkActionCellClass}>
              <Button size="xs" onClick={handleSetAllMaxCurrent}>
                모두 최대
              </Button>
            </td>

            {fieldDefinitions.map(({ key, min, max }, fieldIndex) => {
              const disabled = isAbilityReleaseDisabled(key, tierDraft);
              return (
                <td key={key} className={dataCellClass}>
                  {student.hasGear || !isGearField(key) ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <NumberInput
                        nullable
                        size="sm"
                        showMax
                        minValue={min}
                        maxValue={getFieldMax(key, max, tierDraft)}
                        value={draftValues[key]}
                        disabled={disabled}
                        inputProps={numberInputGridNavigation.getInputProps({
                          rowIndex: currentNavigationRowIndex,
                          columnIndex: fieldIndex + 1,
                          disabled,
                        })}
                        onChange={(v) => handleFieldChange(key, v)}
                      />
                      {equipLabels[key] && (
                        <span className="text-xs font-medium text-muted-foreground">{equipLabels[key]}</span>
                      )}
                    </div>
                  ) : null}
                </td>
              );
            })}
          </>
        ) : (
          <>
            <td className={`${cellBase} min-w-28 px-3 py-2 text-center`}>
              <span className="text-xs font-medium text-muted-foreground">미모집</span>
            </td>

            <td className={`${cellBase} w-25 px-1 py-2`}>
              <NumberInput
                nullable
                size="sm"
                showMax
                minValue={1}
                maxValue={100}
                value={draftRelationshipValues.relationshipCurrentLevel}
                inputProps={numberInputGridNavigation.getInputProps({
                  rowIndex: currentNavigationRowIndex,
                  columnIndex: 0,
                })}
                onChange={(v) => handleRelationshipFieldChange("relationshipCurrentLevel", v)}
              />
            </td>

            <td className={bulkActionCellClass} />

            <td colSpan={fieldDefinitions.length} className={`${cellBase} relative px-3 py-2`}>
              <div className="pointer-events-none flex select-none items-center gap-2 opacity-20 blur-sm">
                {fieldDefinitions.map(({ key }) => (
                  <div key={key} className="h-4 w-10 rounded-sm bg-muted" />
                ))}
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                {student.released ? (
                  <Button
                    size="xs"
                    onClick={() => {
                      dispatchRow({ type: "clearEnrollError" });
                      const submissionId = nextSubmissionId();
                      enrollSubmittedRef.current = { id: submissionId };
                      enrollFetcher.submit(
                        { _intent: "enroll", _submissionId: submissionId, studentUid: student.uid },
                        { method: "post", encType: "application/json" },
                      );
                    }}
                  >
                    모집 학생으로 등록
                  </Button>
                ) : (
                  <p className="text-xs font-medium text-muted-foreground">아직 모집하지 않은 학생이에요</p>
                )}
              </div>
            </td>
          </>
        )}
      </tr>

      <tr className="align-top">
        <td
          className={`${cellBase} ${stickyRowLabelClass} w-10 bg-blue-50 px-1 py-1.5 text-center text-xs font-medium text-blue-500 dark:bg-card dark:text-blue-400`}
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
            size="sm"
            showMax
            minValue={1}
            maxValue={100}
            value={draftRelationshipValues.relationshipTargetLevel}
            inputProps={numberInputGridNavigation.getInputProps({
              rowIndex: targetNavigationRowIndex,
              columnIndex: 0,
            })}
            onChange={(v) => handleRelationshipFieldChange("relationshipTargetLevel", v)}
          />
        </td>

        <td className={`${bulkActionCellClass} bg-blue-50/40 dark:bg-blue-950/10`}>
          <Button size="xs" onClick={handleSetAllMaxTargets}>
            모두 최대
          </Button>
        </td>

        {fieldDefinitions.map(({ targetKey, min, max }, fieldIndex) => {
          const effectiveTargetTier = targetTierDraft ?? tierDraft;
          const disabled = isAbilityReleaseDisabled(targetKey, effectiveTargetTier);
          return (
            <td key={targetKey} className={targetCellClass}>
              {student.hasGear || !isGearField(targetKey) ? (
                <div className="flex flex-col items-center gap-0.5">
                  <NumberInput
                    nullable
                    size="sm"
                    showMax
                    minValue={min}
                    maxValue={getFieldMax(targetKey, max, effectiveTargetTier)}
                    value={draftValues[targetKey]}
                    disabled={disabled}
                    inputProps={numberInputGridNavigation.getInputProps({
                      rowIndex: targetNavigationRowIndex,
                      columnIndex: fieldIndex + 1,
                      disabled,
                    })}
                    onChange={(v) => handleFieldChange(targetKey, v)}
                  />
                  {equipLabels[targetKey] && (
                    <span className="text-xs font-medium text-muted-foreground">{equipLabels[targetKey]}</span>
                  )}
                </div>
              ) : null}
            </td>
          );
        })}
      </tr>

      <tr className="align-top">
        <td
          className={`${cellBase} ${stickyRowLabelClass} w-10 bg-emerald-50 px-1 py-2 text-center text-xs font-medium text-emerald-600 dark:bg-card dark:text-emerald-400`}
        >
          <button
            type="button"
            className="flex w-full items-center justify-center"
            aria-expanded={isResourceRequirementsOpen}
            onClick={() => setIsResourceRequirementsOpen((open) => !open)}
          >
            <span className="whitespace-nowrap">재화</span>
          </button>
        </td>
        <td
          colSpan={fieldDefinitions.length + 3}
          className={`relative ${cellBase} w-0 max-w-0 px-3 py-2 bg-emerald-50/20 dark:bg-emerald-950/5`}
        >
          <div
            className={`${isCalculatingResources ? "opacity-40 pointer-events-none" : ""} transition-opacity duration-200`}
          >
            <button
              type="button"
              className="flex w-full items-center justify-start gap-1.5 text-left text-xs font-medium text-muted-foreground"
              aria-expanded={isResourceRequirementsOpen}
              disabled={!hasResourceRequirements}
              onClick={() => setIsResourceRequirementsOpen((open) => !open)}
            >
              <span>
                {hasResourceRequirements
                  ? isResourceRequirementsOpen
                    ? "필요 재화 접기"
                    : "펼쳐서 필요 재화 확인"
                  : "필요한 재화가 없어요"}
              </span>
              {hasResourceRequirements ? (
                <ChevronDownIcon
                  className={`size-4 shrink-0 transition-transform ${isResourceRequirementsOpen ? "rotate-180" : ""}`}
                />
              ) : null}
            </button>
            <div
              className="overflow-hidden transition-all duration-200 ease-out"
              style={{
                maxHeight: isResourceRequirementsOpen ? resourceRequirementsHeight : 0,
                opacity: isResourceRequirementsOpen ? 1 : 0,
              }}
              aria-hidden={!isResourceRequirementsOpen}
            >
              <div ref={resourceRequirementsContentRef} className="pt-2">
                {hasResourceRequirements ? (
                  <div className="flex min-w-0 max-w-full flex-wrap items-start gap-2">
                    {student.resourceRequirements.characterExp > 0 ? (
                      <CharacterExpRequirementCard characterExp={student.resourceRequirements.characterExp} />
                    ) : null}
                    {student.resourceRequirements.credit > 0 ? (
                      <CreditRequirementCard credit={student.resourceRequirements.credit} />
                    ) : null}
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
                  <p className="text-center text-xs font-medium text-muted-foreground">필요한 재화가 없어요</p>
                )}
              </div>
            </div>
          </div>
          {isCalculatingResources && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
              <ArrowPathIcon className="size-4 animate-spin" />
              <span>재화 계산 중...</span>
            </div>
          )}
        </td>
      </tr>
    </>
  );
}

function GrowthFieldHeaderRow() {
  return (
    <tr className="bg-muted/60 text-left text-xs font-semibold tracking-wide text-muted-foreground">
      <th className={`${cellBase} ${stickyRowLabelClass} z-30 bg-muted/60 px-1 py-3`} />
      <th className={`${cellBase} px-2 py-3 text-center`}>성급</th>
      <th className={`${cellBase} min-w-20 px-2 py-3 text-center`}>인연 랭크</th>
      <th className={`${cellBase} px-2 py-3 text-center`}>일괄 적용</th>
      {fieldDefinitions.map(({ key, label }) => (
        <th key={key} className={`${cellBase} w-16 px-1 py-3 text-center`}>
          {label}
        </th>
      ))}
    </tr>
  );
}

function GrowthTableColumnGroup() {
  return (
    <colgroup>
      <col style={{ width: 40 }} />
      <col style={{ width: 200 }} />
      <col style={{ width: 100 }} />
      <col style={{ width: 80 }} />
      {fieldDefinitions.map(({ key }) => (
        <col key={key} style={{ width: 100 }} />
      ))}
    </colgroup>
  );
}

const TOTAL_COLS = 4 + fieldDefinitions.length;

function AddStudentControl({
  availableStudents,
  isEmpty,
}: {
  availableStudents: GrowthAvailableStudent[];
  isEmpty: boolean;
}) {
  const fetcher = useFetcher();
  const [selectKey, setSelectKey] = useState(0);

  return (
    <div className="relative z-40 flex items-start gap-3">
      <div className="w-full max-w-md">
        <StudentSelectForm
          key={selectKey}
          placeholder="성장 목표 학생 추가"
          searchPlaceholder="학생 이름으로 검색"
          students={availableStudents}
          className="max-w-none"
          containerClassName="mt-0 mb-0"
          onSelect={(value) => {
            const studentUid = Array.isArray(value) ? value[0] : value;
            if (!studentUid) return;

            fetcher.submit({ _intent: "add", studentUid }, { method: "post", encType: "application/json" });
            setSelectKey((key) => key + 1);
          }}
        />
      </div>
      {isEmpty ? (
        <p className="pt-8 text-sm text-muted-foreground">
          학생 이름을 검색하여 성장 목표를 관리할 학생을 등록해주세요.
        </p>
      ) : null}
    </div>
  );
}

function CharacterExpRequirementCard({ characterExp }: { characterExp: number }) {
  return (
    <div className="flex items-center gap-2 pr-1">
      <ResourceCard
        itemUid={CHARACTER_EXP_REPORTS[0].uid}
        rarity={CHARACTER_EXP_REPORTS[0].rarity}
        name="활동 보고서"
      />
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">레벨 경험치</p>
        <p className="text-xs font-semibold tabular-nums text-foreground/85">{characterExp.toLocaleString()}</p>
      </div>
    </div>
  );
}

function CreditRequirementCard({ credit }: { credit: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex size-8 items-center justify-center rounded-md bg-amber-200 text-xs font-bold text-amber-800 dark:bg-amber-400/20 dark:text-amber-200">
        Cr
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">크레딧</p>
        <p className="text-xs font-semibold tabular-nums text-foreground/85">{credit.toLocaleString()}</p>
      </div>
    </div>
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
  const numberInputGridNavigation = useNumberInputGridNavigation();
  const headerScrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-2">
      <AddStudentControl availableStudents={availableStudents} isEmpty={students.length === 0} />
      <div>
        <div
          ref={headerScrollRef}
          className="sticky top-[var(--mobile-header-height)] z-30 max-w-full overflow-hidden rounded-t-lg border-x border-t border-border bg-card lg:top-0"
        >
          <table className="w-[1720px] table-fixed border-collapse">
            <GrowthTableColumnGroup />
            <thead>
              <GrowthFieldHeaderRow />
            </thead>
          </table>
        </div>
        <div
          className="max-w-full overflow-x-auto"
          onScroll={(event) => {
            if (headerScrollRef.current) {
              headerScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
        >
          <div className="inline-block overflow-clip rounded-b-lg border-x border-b border-border align-top">
            <table className="w-[1720px] table-fixed border-collapse">
              <GrowthTableColumnGroup />
              <thead>
                <tr className="sr-only">
                  <th>구분</th>
                  <th>성급</th>
                  <th>인연 랭크</th>
                  <th>일괄 적용</th>
                  {fieldDefinitions.map(({ key, label }) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student, studentIndex) => (
                  <GrowthRow
                    key={student.uid}
                    student={student}
                    rowIndexBase={studentIndex * 2}
                    numberInputGridNavigation={numberInputGridNavigation}
                    onStudentUpdate={onStudentUpdate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
