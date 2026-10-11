import { ArrowPathIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { StudentSelectForm } from "~/components/features/forms";
import { TierSelector } from "~/components/features/students";
import { Button, NumberInput, ProfileImage, ResourceCard, useNumberInputGridNavigation } from "~/components/primitives";
import { CHARACTER_EXP_REPORTS, EQUIPMENT_TYPE_LABELS } from "~/domain/growth-resource";
import { getRelationshipLevelValidationError } from "~/domain/relationship-level";
import {
  ABILITY_RELEASE_MAX_LEVEL,
  getWeaponLevelMaxByTier,
  WEAPON_LEVEL_MAX_LEVEL,
} from "~/domain/student-growth-state";
import { isStaleStudentStateActionResult, STUDENT_STATE_STALE_MESSAGE } from "~/domain/student-state-errors";
import GrowthViewSettingsPopover from "./GrowthViewSettingsPopover";
import { shouldSyncRowDraft } from "./growth-row-sync";
import { type GrowthSortOrder, sortGrowthStudents } from "./growth-sort";
import { useGrowthViewSettings } from "./growth-view-settings";
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

function isRetryableActionError(actionData: GrowthActionResult | undefined): boolean {
  return Boolean(actionData && "error" in actionData && actionData.retryable === true);
}

const fieldDefinitions = [
  { key: "level", targetKey: "targetLevel", label: "학생 Lv", min: 1, max: 90, group: null },
  {
    key: "weaponLevel",
    targetKey: "targetWeaponLevel",
    label: "고유무기 Lv",
    min: 0,
    max: WEAPON_LEVEL_MAX_LEVEL,
    group: null,
  },
  { key: "skillEx", targetKey: "targetSkillEx", label: "EX 스킬", min: 1, max: 5, group: "skills" },
  {
    key: "skillNormal",
    targetKey: "targetSkillNormal",
    label: "기본 스킬",
    min: 1,
    max: 10,
    group: "skills",
  },
  {
    key: "skillEnhanced",
    targetKey: "targetSkillEnhanced",
    label: "강화 스킬",
    min: 1,
    max: 10,
    group: "skills",
  },
  {
    key: "skillSub",
    targetKey: "targetSkillSub",
    label: "서브 스킬",
    min: 1,
    max: 10,
    group: "skills",
  },
  { key: "equip1", targetKey: "targetEquip1", label: "장비1", min: 1, max: 10, group: "equipment" },
  { key: "equip2", targetKey: "targetEquip2", label: "장비2", min: 1, max: 10, group: "equipment" },
  { key: "equip3", targetKey: "targetEquip3", label: "장비3", min: 1, max: 10, group: "equipment" },
  {
    key: "equipSpecial",
    targetKey: "targetEquipSpecial",
    label: "애용품",
    min: 1,
    max: 2,
    group: "equipment",
  },
  {
    key: "abilityHp",
    targetKey: "targetAbilityHp",
    label: "HP 해방",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
    group: "ability",
  },
  {
    key: "abilityAtk",
    targetKey: "targetAbilityAtk",
    label: "공격력 해방",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
    group: "ability",
  },
  {
    key: "abilityHeal",
    targetKey: "targetAbilityHeal",
    label: "치유력 해방",
    min: 0,
    max: ABILITY_RELEASE_MAX_LEVEL,
    group: "ability",
  },
] as const;

const inputFieldGroups = [{ key: "skills" }, { key: "equipment" }, { key: "ability" }] as const;

const standaloneFieldDefinitions = fieldDefinitions.filter(({ group }) => group == null);
const tableColumnKeys = ["rowLabel", "tier", "relationship", "bulk", ...fieldDefinitions.map(({ key }) => key)];

type InputFieldGroupKey = (typeof inputFieldGroups)[number]["key"];

function getInputFieldGroupDefinitions(group: InputFieldGroupKey) {
  return fieldDefinitions.filter((field) => field.group === group);
}

type CurrentFieldKey = (typeof fieldDefinitions)[number]["key"];
type TargetFieldKey = (typeof fieldDefinitions)[number]["targetKey"];
type GrowthValues = Record<CurrentFieldKey | TargetFieldKey, number | null>;
type NumberInputGridNavigation = ReturnType<typeof useNumberInputGridNavigation>;
type RelationshipValues = {
  relationshipCurrentLevel: number | null;
  relationshipTargetLevel: number | null;
};
type GrowthWritePayload = Record<string, string | number | null>;

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
const dataCellClass = `${cellBase} px-1 py-2`;
const targetCellClass = `${cellBase} px-1 py-1.5`;
const bulkActionCellClass = `${cellBase} border-l border-border px-2 py-2 align-top`;
const targetBulkActionCellClass = `${cellBase} border-l border-border px-2 py-1.5 align-top`;
const stickyRowLabelClass = "sticky left-0 z-20 border-r border-border";
const headerSurfaceClass = "bg-[color-mix(in_oklab,var(--color-muted)_60%,var(--color-card))]";
const studentHeaderContentClass = `sticky left-3 z-10 flex w-max max-w-[calc(100vw-2rem)] items-center gap-2 pr-3 ${headerSurfaceClass}`;

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

type RowWriteKind = "growth" | "relationship" | "tier" | "enroll" | "remove";

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
  tierError: string | null;
  tierDraft: number;
  enrollError: string | null;
  removeError: string | null;
  retryAvailable: Record<RowWriteKind, boolean>;
  staleWriteBlocked: boolean;
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
  | { type: "setTierError"; error: string | null }
  | { type: "setRemoveError"; error: string | null }
  | { type: "setRetryAvailable"; kind: RowWriteKind; available: boolean }
  | { type: "setStaleWriteBlocked" }
  | { type: "clearEnrollError" }
  | { type: "growthSuccess"; submitted: GrowthSubmission }
  | { type: "growthFailure"; error: string; retryable: boolean; submitted: GrowthSubmission }
  | { type: "relationshipSuccess"; submitted: RelationshipSubmission }
  | { type: "relationshipFailure"; error: string; retryable: boolean }
  | { type: "tierFailure"; error: string; retryable: boolean; persistedTier: number }
  | { type: "enrollSuccess" }
  | { type: "enrollFailure"; error: string; retryable: boolean }
  | { type: "removeSuccess" }
  | { type: "removeFailure"; error: string; retryable: boolean };

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
    tierError: null,
    tierDraft: student.tier ?? student.initialTier,
    enrollError: null,
    removeError: null,
    retryAvailable: { growth: false, relationship: false, tier: false, enroll: false, remove: false },
    staleWriteBlocked: false,
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
    case "setTierError":
      return { ...state, tierError: action.error };
    case "setRemoveError":
      return { ...state, removeError: action.error };
    case "setRetryAvailable":
      return { ...state, retryAvailable: { ...state.retryAvailable, [action.kind]: action.available } };
    case "setStaleWriteBlocked":
      return { ...state, staleWriteBlocked: true, isPendingSave: false };
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
        retryAvailable: { ...state.retryAvailable, growth: false },
        isPendingSave: false,
      };
    case "growthFailure": {
      // A rejected input goes back to the saved values; a retryable failure keeps the draft for retry.
      const revert = !action.retryable && state.growthDraftRevision === action.submitted.draftRevision;
      return {
        ...state,
        growthError: action.error,
        draftValues: revert ? state.savedValues : state.draftValues,
        targetTierDraft: revert ? state.targetTierSaved : state.targetTierDraft,
        retryAvailable: { ...state.retryAvailable, growth: action.retryable },
        isPendingSave: false,
      };
    }
    case "relationshipSuccess":
      return {
        ...state,
        savedRelationshipValues: { ...action.submitted.values },
        draftRelationshipValues: { ...action.submitted.values },
        relationshipError: null,
        retryAvailable: { ...state.retryAvailable, relationship: false },
      };
    case "relationshipFailure":
      return {
        ...state,
        relationshipError: action.error,
        draftRelationshipValues: action.retryable ? state.draftRelationshipValues : state.savedRelationshipValues,
        retryAvailable: { ...state.retryAvailable, relationship: action.retryable },
      };
    case "tierFailure":
      return {
        ...state,
        tierError: action.error,
        tierDraft: action.retryable ? state.tierDraft : action.persistedTier,
        retryAvailable: { ...state.retryAvailable, tier: action.retryable },
        isPendingSave: false,
      };
    case "enrollSuccess":
      return { ...state, enrollError: null, retryAvailable: { ...state.retryAvailable, enroll: false } };
    case "enrollFailure":
      return {
        ...state,
        enrollError: action.error,
        retryAvailable: { ...state.retryAvailable, enroll: action.retryable },
      };
    case "removeSuccess":
      return { ...state, removeError: null, retryAvailable: { ...state.retryAvailable, remove: false } };
    case "removeFailure":
      return {
        ...state,
        removeError: action.error,
        retryAvailable: { ...state.retryAvailable, remove: action.retryable },
      };
  }

  return state;
}

function GrowthRow({
  student,
  rowIndexBase,
  numberInputGridNavigation,
  showNumberInputShortcuts,
  onStudentUpdate,
}: {
  student: GrowthStudent;
  rowIndexBase: number;
  numberInputGridNavigation: NumberInputGridNavigation;
  showNumberInputShortcuts: boolean;
  onStudentUpdate: (s: GrowthStudent) => void;
}) {
  const fetcher = useFetcher<GrowthActionResult>();
  const initialValues = useMemo(() => pickGrowthValues(student), [student]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef<GrowthSubmission | null>(null);
  const growthRetryRef = useRef<GrowthSubmission | null>(null);

  const relationshipFetcher = useFetcher<GrowthActionResult>();
  const initialRelationshipValues = useMemo(() => pickRelationshipValues(student), [student]);
  const relationshipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relationshipSubmittedRef = useRef<RelationshipSubmission | null>(null);
  const relationshipRetryRef = useRef<RelationshipSubmission | null>(null);

  const tierFetcher = useFetcher<GrowthActionResult>();
  const tierSubmittedRef = useRef<{ id: string; tier: number } | null>(null);
  const tierRetryRef = useRef<{ id: string; tier: number } | null>(null);
  const persistedTierRef = useRef(student.tier ?? student.initialTier);
  persistedTierRef.current = student.tier ?? student.initialTier;

  const removeFetcher = useFetcher<GrowthActionResult>();
  const removeSubmittedRef = useRef<{ id: string } | null>(null);
  const removeRetryRef = useRef(false);
  const enrollFetcher = useFetcher<GrowthActionResult>();
  const enrollSubmittedRef = useRef<{ id: string } | null>(null);
  const enrollRetryRef = useRef(false);
  const resourceRequirementsFetcher = useFetcher<GrowthActionResult>();
  const resourceRequirementsSubmittedRef = useRef<{ id: string } | null>(null);
  const submissionSequenceRef = useRef(0);
  const growthDraftRevisionRef = useRef(0);
  const staleWriteBlockedRef = useRef(false);
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
  const resourceRequirements = student.resourceRequirements;

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
  const blockRowWritesAsStale = useCallback(() => {
    if (staleWriteBlockedRef.current) return;
    staleWriteBlockedRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (relationshipSaveTimerRef.current) clearTimeout(relationshipSaveTimerRef.current);
    saveTimerRef.current = null;
    relationshipSaveTimerRef.current = null;
    submittedRef.current = null;
    relationshipSubmittedRef.current = null;
    tierSubmittedRef.current = null;
    enrollSubmittedRef.current = null;
    removeSubmittedRef.current = null;
    growthRetryRef.current = null;
    relationshipRetryRef.current = null;
    tierRetryRef.current = null;
    enrollRetryRef.current = false;
    removeRetryRef.current = false;
    dispatchRow({ type: "setStaleWriteBlocked" });
  }, []);

  const submitGrowth = (submitted: GrowthSubmission) => {
    if (staleWriteBlockedRef.current) return;
    const next = { ...submitted, id: nextSubmissionId() };
    submittedRef.current = next;
    const payload: GrowthWritePayload = { studentUid: student.uid, _submissionId: next.id };
    payload.stateFormat = "nullable";
    for (const { key, targetKey } of fieldDefinitions) {
      if (next.values[key] !== rowState.savedValues[key]) payload[key] = next.values[key];
      if (next.values[targetKey] !== rowState.savedValues[targetKey]) payload[targetKey] = next.values[targetKey];
    }
    if (next.targetTier !== rowState.targetTierSaved) payload.targetTier = next.targetTier;
    if (Object.keys(payload).length === 3) {
      submittedRef.current = null;
      dispatchRow({ type: "setPendingSave", pending: false });
      return;
    }
    fetcher.submit(payload, { method: "post", encType: "application/json" });
  };

  const submitRelationship = (submitted: RelationshipSubmission) => {
    if (staleWriteBlockedRef.current) return;
    const next = { ...submitted, id: nextSubmissionId() };
    relationshipSubmittedRef.current = next;
    const payload: GrowthWritePayload = {
      _intent: "relationship",
      _submissionId: next.id,
      studentUid: student.uid,
      ...{
        stateFormat: "nullable",
        ...(next.values.relationshipCurrentLevel !== rowState.savedRelationshipValues.relationshipCurrentLevel
          ? { currentLevel: next.values.relationshipCurrentLevel }
          : {}),
        ...(next.values.relationshipTargetLevel !== rowState.savedRelationshipValues.relationshipTargetLevel
          ? { targetLevel: next.values.relationshipTargetLevel }
          : {}),
      },
    };
    if (Object.keys(payload).length === 4) {
      relationshipSubmittedRef.current = null;
      return;
    }
    relationshipFetcher.submit(payload, { method: "post", encType: "application/json" });
  };

  const submitTier = (tier: number) => {
    if (staleWriteBlockedRef.current) return;
    const id = nextSubmissionId();
    tierSubmittedRef.current = { id, tier };
    tierFetcher.submit(
      { _intent: "tier", _submissionId: id, studentUid: student.uid, tier },
      { method: "post", encType: "application/json" },
    );
  };

  const submitEnroll = () => {
    if (staleWriteBlockedRef.current) return;
    const id = nextSubmissionId();
    enrollSubmittedRef.current = { id };
    enrollFetcher.submit(
      { _intent: "enroll", _submissionId: id, studentUid: student.uid },
      { method: "post", encType: "application/json" },
    );
  };

  const submitRemove = () => {
    if (staleWriteBlockedRef.current) return;
    const id = nextSubmissionId();
    removeSubmittedRef.current = { id };
    removeFetcher.submit(
      { _intent: "remove", _submissionId: id, studentUid: student.uid },
      { method: "post", encType: "application/json" },
    );
  };
  const requestResourceRequirements = useCallback(() => {
    submissionSequenceRef.current += 1;
    const submissionId = `${student.uid}:${submissionSequenceRef.current}`;
    resourceRequirementsSubmittedRef.current = { id: submissionId };
    resourceRequirementsFetcher.submit(
      { _intent: "resourceRequirements", _submissionId: submissionId, studentUid: student.uid },
      { method: "post", encType: "application/json" },
    );
  }, [resourceRequirementsFetcher, student.uid]);

  useEffect(() => {
    if (staleWriteBlockedRef.current) return;
    // Always sync tier display
    const nextTier = student.tier ?? student.initialTier;
    dispatchRow({ type: "setTierDraft", tier: nextTier });
    const shouldSync = shouldSyncRowDraft({
      isIdle: fetcher.state === "idle",
      hasScheduledSave: saveTimerRef.current != null,
      hasUnhandledSubmission: submittedRef.current != null,
      hasRetryableDraft: growthRetryRef.current != null,
    });
    if (!shouldSync) return;
    growthDraftRevisionRef.current = 0;
    dispatchRow({ type: "syncGrowth", values: initialValues, targetTier: student.targetTier, tier: nextTier });
    submittedRef.current = null;
    tierSubmittedRef.current = null;
  }, [initialValues, student.targetTier, student.tier, student.initialTier, fetcher.state]);

  useEffect(() => {
    if (!isResourceRequirementsOpen) {
      setResourceRequirementsHeight(0);
      return;
    }
    if (!resourceRequirements) return;

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
  }, [isResourceRequirementsOpen, resourceRequirements]);

  useEffect(() => {
    if (staleWriteBlockedRef.current) return;
    const shouldSync = shouldSyncRowDraft({
      isIdle: relationshipFetcher.state === "idle",
      hasScheduledSave: relationshipSaveTimerRef.current != null,
      hasUnhandledSubmission: relationshipSubmittedRef.current != null,
      hasRetryableDraft: relationshipRetryRef.current != null,
    });
    if (!shouldSync) return;
    dispatchRow({ type: "syncRelationship", values: initialRelationshipValues });
    relationshipSubmittedRef.current = null;
  }, [initialRelationshipValues, relationshipFetcher.state]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    if (isStaleStudentStateActionResult(fetcher.data)) {
      blockRowWritesAsStale();
      return;
    }
    if (staleWriteBlockedRef.current) {
      dispatchRow({ type: "setPendingSave", pending: false });
      return;
    }
    dispatchRow({ type: "setPendingSave", pending: false });
    if (!submittedRef.current) return;
    const submitted = submittedRef.current;
    const responseSubmissionId = getActionSubmissionId(fetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    submittedRef.current = null;
    if (isActionSuccess(fetcher.data)) {
      growthRetryRef.current = null;
      dispatchRow({ type: "growthSuccess", submitted });
      const next = extractStudentUpdate(fetcher.data);
      if (next) {
        onStudentUpdate(next);
        requestResourceRequirements();
      }
    } else {
      const err = getActionError(fetcher.data);
      if (err) {
        const retryable = isRetryableActionError(fetcher.data);
        growthRetryRef.current = retryable ? submitted : null;
        dispatchRow({ type: "growthFailure", error: err, retryable, submitted });
      }
    }
  }, [fetcher.state, fetcher.data, onStudentUpdate, requestResourceRequirements, blockRowWritesAsStale]);

  useEffect(() => {
    if (relationshipFetcher.state !== "idle" || !relationshipSubmittedRef.current) return;
    if (isStaleStudentStateActionResult(relationshipFetcher.data)) {
      blockRowWritesAsStale();
      return;
    }
    if (staleWriteBlockedRef.current) return;
    const submitted = relationshipSubmittedRef.current;
    const responseSubmissionId = getActionSubmissionId(relationshipFetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    relationshipSubmittedRef.current = null;
    if (isActionSuccess(relationshipFetcher.data)) {
      relationshipRetryRef.current = null;
      dispatchRow({ type: "relationshipSuccess", submitted });
      const next = extractStudentUpdate(relationshipFetcher.data);
      if (next) {
        onStudentUpdate(next);
        requestResourceRequirements();
      }
    } else {
      const err = getActionError(relationshipFetcher.data);
      if (err) {
        const retryable = isRetryableActionError(relationshipFetcher.data);
        relationshipRetryRef.current = retryable ? submitted : null;
        dispatchRow({ type: "relationshipFailure", error: err, retryable });
      }
    }
  }, [
    relationshipFetcher.state,
    relationshipFetcher.data,
    onStudentUpdate,
    requestResourceRequirements,
    blockRowWritesAsStale,
  ]);

  useEffect(() => {
    if (tierFetcher.state !== "idle") return;
    if (isStaleStudentStateActionResult(tierFetcher.data)) {
      blockRowWritesAsStale();
      return;
    }
    if (staleWriteBlockedRef.current) return;
    dispatchRow({ type: "setPendingSave", pending: false });
    if (tierSubmittedRef.current == null) return;
    const submitted = tierSubmittedRef.current;
    const responseSubmissionId = getActionSubmissionId(tierFetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    if (isActionSuccess(tierFetcher.data)) {
      tierSubmittedRef.current = null;
      tierRetryRef.current = null;
      dispatchRow({ type: "setTierError", error: null });
      dispatchRow({ type: "setRetryAvailable", kind: "tier", available: false });
      const next = extractStudentUpdate(tierFetcher.data);
      if (next) {
        onStudentUpdate(next);
        requestResourceRequirements();
      }
    } else {
      tierSubmittedRef.current = null;
      const err = getActionError(tierFetcher.data);
      if (err) {
        const retryable = isRetryableActionError(tierFetcher.data);
        tierRetryRef.current = retryable ? submitted : null;
        dispatchRow({ type: "tierFailure", error: err, retryable, persistedTier: persistedTierRef.current });
      }
    }
  }, [tierFetcher.state, tierFetcher.data, onStudentUpdate, requestResourceRequirements, blockRowWritesAsStale]);

  useEffect(() => {
    if (enrollFetcher.state !== "idle") return;
    if (!enrollFetcher.data) return;
    if (isStaleStudentStateActionResult(enrollFetcher.data)) {
      blockRowWritesAsStale();
      return;
    }
    if (staleWriteBlockedRef.current) return;
    if (!enrollSubmittedRef.current) return;
    const submitted = enrollSubmittedRef.current;
    const responseSubmissionId = getActionSubmissionId(enrollFetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    enrollSubmittedRef.current = null;

    if (isActionSuccess(enrollFetcher.data)) {
      dispatchRow({ type: "enrollSuccess" });
      const next = extractStudentUpdate(enrollFetcher.data);
      if (next) {
        onStudentUpdate(next);
        requestResourceRequirements();
      }
      return;
    }

    const err = getActionError(enrollFetcher.data);
    if (err) {
      const retryable = isRetryableActionError(enrollFetcher.data);
      enrollRetryRef.current = retryable;
      dispatchRow({ type: "enrollFailure", error: err, retryable });
    }
  }, [enrollFetcher.state, enrollFetcher.data, onStudentUpdate, requestResourceRequirements, blockRowWritesAsStale]);

  useEffect(() => {
    if (removeFetcher.state !== "idle" || !removeSubmittedRef.current) return;
    if (isStaleStudentStateActionResult(removeFetcher.data)) {
      blockRowWritesAsStale();
      return;
    }
    if (staleWriteBlockedRef.current) return;
    if (isActionSuccess(removeFetcher.data)) {
      removeSubmittedRef.current = null;
      removeRetryRef.current = false;
      dispatchRow({ type: "removeSuccess" });
      return;
    }
    removeSubmittedRef.current = null;
    const err = getActionError(removeFetcher.data);
    if (err) {
      const retryable = isRetryableActionError(removeFetcher.data);
      removeRetryRef.current = retryable;
      dispatchRow({ type: "removeFailure", error: err, retryable });
    }
  }, [removeFetcher.state, removeFetcher.data, blockRowWritesAsStale]);

  useEffect(() => {
    if (resourceRequirementsFetcher.state !== "idle" || !resourceRequirementsSubmittedRef.current) return;
    const submitted = resourceRequirementsSubmittedRef.current;
    const responseSubmissionId = getActionSubmissionId(resourceRequirementsFetcher.data);
    if (responseSubmissionId !== null && responseSubmissionId !== submitted.id) return;
    resourceRequirementsSubmittedRef.current = null;

    if (isActionSuccess(resourceRequirementsFetcher.data)) {
      const next = extractStudentUpdate(resourceRequirementsFetcher.data);
      if (next) onStudentUpdate(next);
    }
  }, [resourceRequirementsFetcher.state, resourceRequirementsFetcher.data, onStudentUpdate]);

  const scheduleAutoSave = (values: GrowthValues, targetTier: number | null, draftRevision: number) => {
    if (staleWriteBlockedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    dispatchRow({ type: "setPendingSave", pending: true });
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      if (staleWriteBlockedRef.current) return;
      const validationError = getClientValidationError(values, tierDraft, targetTier);
      if (validationError) {
        dispatchRow({ type: "setGrowthError", error: validationError });
        dispatchRow({ type: "setPendingSave", pending: false });
        return;
      }
      dispatchRow({ type: "setGrowthError", error: null });
      dispatchRow({ type: "setRetryAvailable", kind: "growth", available: false });
      submitGrowth({ id: "", values, targetTier, draftRevision });
    }, 500);
  };

  const scheduleRelationshipSave = (values: RelationshipValues) => {
    if (staleWriteBlockedRef.current) return;
    if (relationshipSaveTimerRef.current) clearTimeout(relationshipSaveTimerRef.current);
    relationshipSaveTimerRef.current = setTimeout(() => {
      relationshipSaveTimerRef.current = null;
      if (staleWriteBlockedRef.current) return;
      const validationError = getRelationshipLevelValidationError({
        currentLevel: values.relationshipCurrentLevel,
        targetLevel: values.relationshipTargetLevel,
      });
      if (validationError) {
        dispatchRow({ type: "setRelationshipError", error: validationError });
        return;
      }
      dispatchRow({ type: "setRelationshipError", error: null });
      dispatchRow({ type: "setRetryAvailable", kind: "relationship", available: false });
      submitRelationship({ id: "", values });
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
    if (staleWriteBlockedRef.current) return;
    dispatchRow({ type: "setTierDraft", tier: newTier });
    dispatchRow({ type: "setPendingSave", pending: true });
    dispatchRow({ type: "setTierError", error: null });
    dispatchRow({ type: "setRetryAvailable", kind: "tier", available: false });
    submitTier(newTier);
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
      dispatchRow({ type: "setRetryAvailable", kind: "growth", available: false });
      submitGrowth({ id: "", values: newValues, targetTier: targetTierDraft, draftRevision });
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

  const displayedErrors = [
    { kind: "enroll" as const, error: enrollError },
    { kind: "growth" as const, error: growthError },
    { kind: "relationship" as const, error: relationshipError },
    { kind: "tier" as const, error: rowState.tierError },
    { kind: "remove" as const, error: rowState.removeError },
  ].filter((failure): failure is { kind: RowWriteKind; error: string } => failure.error !== null);

  const handleRetry = (kind: RowWriteKind) => {
    if (staleWriteBlockedRef.current || !rowState.retryAvailable[kind]) return;
    dispatchRow({ type: "setRetryAvailable", kind, available: false });
    if (kind === "growth" && growthRetryRef.current) {
      dispatchRow({ type: "setGrowthError", error: null });
      submitGrowth(growthRetryRef.current);
    } else if (kind === "relationship" && relationshipRetryRef.current) {
      dispatchRow({ type: "setRelationshipError", error: null });
      submitRelationship(relationshipRetryRef.current);
    } else if (kind === "tier" && tierRetryRef.current) {
      dispatchRow({ type: "setTierError", error: null });
      dispatchRow({ type: "setPendingSave", pending: true });
      submitTier(tierRetryRef.current.tier);
    } else if (kind === "enroll" && enrollRetryRef.current) {
      dispatchRow({ type: "clearEnrollError" });
      enrollRetryRef.current = false;
      submitEnroll();
    } else if (kind === "remove" && removeRetryRef.current) {
      dispatchRow({ type: "setRemoveError", error: null });
      removeRetryRef.current = false;
      submitRemove();
    }
  };
  const isResourceRequirementsReady = resourceRequirements != null;
  const isCalculatingResources =
    !isResourceRequirementsReady ||
    isPendingSave ||
    fetcher.state !== "idle" ||
    tierFetcher.state !== "idle" ||
    resourceRequirementsFetcher.state !== "idle";
  const hasResourceRequirements =
    (resourceRequirements?.items.length ?? 0) > 0 ||
    (resourceRequirements?.characterExp ?? 0) > 0 ||
    (resourceRequirements?.credit ?? 0) > 0;
  const currentNavigationRowIndex = rowIndexBase;
  const targetNavigationRowIndex = rowIndexBase + 1;
  const numberInputShortcutProps = {
    showDecrease: showNumberInputShortcuts,
    showIncrease: showNumberInputShortcuts,
    showMax: showNumberInputShortcuts,
  };
  const groupedNumberInputClass =
    "max-w-none rounded-none border-0 bg-transparent focus-within:relative focus-within:z-10 focus-within:bg-background focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring/40";
  const compactNumberInputClass = "mx-auto w-12 max-w-none";

  const renderCurrentFieldInput = (field: (typeof fieldDefinitions)[number], fieldIndex: number, grouped = false) => {
    const disabled = isAbilityReleaseDisabled(field.key, tierDraft);
    if (!student.hasGear && isGearField(field.key)) return null;

    return (
      <div className={grouped ? "min-w-0" : "flex flex-col items-center gap-0.5"} title={equipLabels[field.key]}>
        <NumberInput
          nullable
          size="sm"
          {...numberInputShortcutProps}
          minValue={field.min}
          maxValue={getFieldMax(field.key, field.max, tierDraft)}
          value={draftValues[field.key]}
          disabled={disabled}
          controlClassName={
            grouped ? groupedNumberInputClass : !showNumberInputShortcuts ? compactNumberInputClass : undefined
          }
          inputProps={{
            ...numberInputGridNavigation.getInputProps({
              rowIndex: currentNavigationRowIndex,
              columnIndex: fieldIndex + 1,
              disabled,
            }),
            "aria-label": `${student.name} 현재 ${field.label}`,
          }}
          onChange={(value) => handleFieldChange(field.key, value)}
        />
        {!grouped && equipLabels[field.key] && (
          <span className="block truncate text-xs font-medium text-muted-foreground">{equipLabels[field.key]}</span>
        )}
      </div>
    );
  };

  const renderTargetFieldInput = (field: (typeof fieldDefinitions)[number], fieldIndex: number, grouped = false) => {
    const effectiveTargetTier = targetTierDraft ?? tierDraft;
    const disabled = isAbilityReleaseDisabled(field.targetKey, effectiveTargetTier);
    if (!student.hasGear && isGearField(field.targetKey)) return null;

    return (
      <div className={grouped ? "min-w-0" : "flex flex-col items-center gap-0.5"} title={equipLabels[field.targetKey]}>
        <NumberInput
          nullable
          size="sm"
          {...numberInputShortcutProps}
          minValue={field.min}
          maxValue={getFieldMax(field.targetKey, field.max, effectiveTargetTier)}
          value={draftValues[field.targetKey]}
          disabled={disabled}
          controlClassName={
            grouped ? groupedNumberInputClass : !showNumberInputShortcuts ? compactNumberInputClass : undefined
          }
          inputProps={{
            ...numberInputGridNavigation.getInputProps({
              rowIndex: targetNavigationRowIndex,
              columnIndex: fieldIndex + 1,
              disabled,
            }),
            "aria-label": `${student.name} 목표 ${field.label}`,
          }}
          onChange={(value) => handleFieldChange(field.targetKey, value)}
        />
        {!grouped && equipLabels[field.targetKey] && (
          <span className="block truncate text-xs font-medium text-muted-foreground">
            {equipLabels[field.targetKey]}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <tr className={`border-t-2 border-border first:border-t-0 ${headerSurfaceClass}`}>
        <td colSpan={TOTAL_COLS} className={`${cellBase} px-3 py-2`}>
          <div className={studentHeaderContentClass}>
            <div className="flex min-w-0 grow items-center gap-2">
              <ProfileImage studentUid={student.uid} />
              <span className="truncate text-sm font-semibold text-foreground">{student.name}</span>
              {rowState.staleWriteBlocked ? (
                <div className="flex flex-wrap items-center gap-2" role="alert">
                  <p className="text-xs text-red-500 dark:text-red-400">{STUDENT_STATE_STALE_MESSAGE}</p>
                  <Button text="새로고침" size="xs" onClick={() => window.location.reload()} />
                </div>
              ) : (
                displayedErrors.map(({ kind, error }) => (
                  <div key={kind} className="flex flex-wrap items-center gap-1.5" role="alert">
                    <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
                    {rowState.retryAvailable[kind] ? (
                      <Button text="다시 시도" size="xs" onClick={() => handleRetry(kind)} />
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <Button size="xs" className="bg-transparent" to={`/students/${encodeURIComponent(student.uid)}`}>
              학생부
            </Button>
            {(student.relationshipCurrentLevel != null || student.relationshipTargetLevel != null) && (
              <Button
                size="xs"
                className="bg-transparent"
                to={`/utils/relationship?studentUid=${encodeURIComponent(student.uid)}`}
              >
                인연 랭크 계산기
              </Button>
            )}
            <Button
              size="xs"
              variant="danger-subtle"
              onClick={() => {
                if (staleWriteBlockedRef.current) return;
                if (!confirm("정말로 성장 목표를 삭제할까요? 삭제된 기록은 복구할 수 없어요.")) return;
                dispatchRow({ type: "setRemoveError", error: null });
                dispatchRow({ type: "setRetryAvailable", kind: "remove", available: false });
                submitRemove();
              }}
            >
              삭제
            </Button>
          </div>
        </td>
      </tr>

      <tr className="bg-card align-top">
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
                iconSize="sm"
                onTierChange={handleCurrentTierChange}
              />
            </td>

            <td className={`${cellBase} px-1 py-2`}>
              <NumberInput
                nullable
                size="sm"
                {...numberInputShortcutProps}
                minValue={1}
                maxValue={100}
                value={draftRelationshipValues.relationshipCurrentLevel}
                controlClassName={!showNumberInputShortcuts ? compactNumberInputClass : undefined}
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

            {showNumberInputShortcuts ? (
              fieldDefinitions.map((field, fieldIndex) => (
                <td key={field.key} className={dataCellClass}>
                  {renderCurrentFieldInput(field, fieldIndex)}
                </td>
              ))
            ) : (
              <>
                {standaloneFieldDefinitions.map((field) => (
                  <td key={field.key} className={dataCellClass}>
                    {renderCurrentFieldInput(field, fieldDefinitions.indexOf(field))}
                  </td>
                ))}
                {inputFieldGroups.map(({ key }) => {
                  const fields = getInputFieldGroupDefinitions(key);
                  return (
                    <td key={key} colSpan={fields.length} className={`${cellBase} px-1 py-2`}>
                      <div className="mx-auto w-fit">
                        <div className="flex overflow-hidden rounded-md border border-input bg-background">
                          {fields.map((field, index) => (
                            <div
                              key={field.key}
                              className={`w-12 shrink-0 ${index === 0 ? "" : "border-l border-input"}`}
                            >
                              {renderCurrentFieldInput(field, fieldDefinitions.indexOf(field), true)}
                            </div>
                          ))}
                        </div>
                        {key === "equipment" && (
                          <div className="mt-0.5 flex text-center text-xs font-medium text-muted-foreground">
                            {fields.map((field) => (
                              <span key={field.key} className="w-12 shrink-0 truncate" title={equipLabels[field.key]}>
                                {equipLabels[field.key]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </>
            )}
          </>
        ) : (
          <>
            <td className={`${cellBase} min-w-28 px-3 py-2 text-center`}>
              <span className="text-xs font-medium text-muted-foreground">미모집</span>
            </td>

            <td className={`${cellBase} px-1 py-2`}>
              <NumberInput
                nullable
                size="sm"
                {...numberInputShortcutProps}
                minValue={1}
                maxValue={100}
                value={draftRelationshipValues.relationshipCurrentLevel}
                controlClassName={!showNumberInputShortcuts ? compactNumberInputClass : undefined}
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
                      if (staleWriteBlockedRef.current) return;
                      dispatchRow({ type: "clearEnrollError" });
                      dispatchRow({ type: "setRetryAvailable", kind: "enroll", available: false });
                      submitEnroll();
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

      <tr className="bg-card align-top">
        <td
          className={`${cellBase} ${stickyRowLabelClass} w-10 bg-card px-1 py-1.5 text-center text-xs font-medium text-foreground/70`}
        >
          목표
        </td>

        <td className={`${cellBase} min-w-28 px-2 py-1.5`}>
          <TierSelector
            initialTier={student.initialTier}
            currentTier={targetTierDraft ?? tierDraft}
            iconSize="sm"
            onTierChange={handleTargetTierChange}
          />
        </td>

        <td className={targetCellClass}>
          <NumberInput
            nullable
            size="sm"
            {...numberInputShortcutProps}
            minValue={1}
            maxValue={100}
            value={draftRelationshipValues.relationshipTargetLevel}
            controlClassName={!showNumberInputShortcuts ? compactNumberInputClass : undefined}
            inputProps={numberInputGridNavigation.getInputProps({
              rowIndex: targetNavigationRowIndex,
              columnIndex: 0,
            })}
            onChange={(v) => handleRelationshipFieldChange("relationshipTargetLevel", v)}
          />
        </td>

        <td className={targetBulkActionCellClass}>
          <Button size="xs" onClick={handleSetAllMaxTargets}>
            모두 최대
          </Button>
        </td>

        {showNumberInputShortcuts ? (
          fieldDefinitions.map((field, fieldIndex) => (
            <td key={field.targetKey} className={targetCellClass}>
              {renderTargetFieldInput(field, fieldIndex)}
            </td>
          ))
        ) : (
          <>
            {standaloneFieldDefinitions.map((field) => (
              <td key={field.targetKey} className={targetCellClass}>
                {renderTargetFieldInput(field, fieldDefinitions.indexOf(field))}
              </td>
            ))}
            {inputFieldGroups.map(({ key }) => {
              const fields = getInputFieldGroupDefinitions(key);
              return (
                <td key={key} colSpan={fields.length} className={`${cellBase} px-1 py-1.5`}>
                  <div className="mx-auto w-fit">
                    <div className="flex overflow-hidden rounded-md border border-input bg-background">
                      {fields.map((field, index) => (
                        <div
                          key={field.targetKey}
                          className={`w-12 shrink-0 ${index === 0 ? "" : "border-l border-input"}`}
                        >
                          {renderTargetFieldInput(field, fieldDefinitions.indexOf(field), true)}
                        </div>
                      ))}
                    </div>
                    {key === "equipment" && (
                      <div className="mt-0.5 flex text-center text-xs font-medium text-muted-foreground">
                        {fields.map((field) => (
                          <span
                            key={field.targetKey}
                            className="w-12 shrink-0 truncate"
                            title={equipLabels[field.targetKey]}
                          >
                            {equipLabels[field.targetKey]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
              );
            })}
          </>
        )}
      </tr>

      <tr className="bg-card align-top">
        <td
          className={`${cellBase} ${stickyRowLabelClass} w-10 bg-card px-1 py-2 text-center text-xs font-medium text-muted-foreground`}
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
        <td colSpan={fieldDefinitions.length + 3} className={`relative ${cellBase} w-0 max-w-0 bg-card px-3 py-2`}>
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
                maxHeight: isResourceRequirementsOpen && isResourceRequirementsReady ? resourceRequirementsHeight : 0,
                opacity: isResourceRequirementsOpen ? 1 : 0,
              }}
              aria-hidden={!isResourceRequirementsOpen}
            >
              {isResourceRequirementsOpen && isResourceRequirementsReady ? (
                <div ref={resourceRequirementsContentRef} className="pt-2">
                  {hasResourceRequirements ? (
                    <div className="flex min-w-0 max-w-full flex-wrap items-start gap-2">
                      {resourceRequirements.characterExp > 0 ? (
                        <CharacterExpRequirementCard characterExp={resourceRequirements.characterExp} />
                      ) : null}
                      {resourceRequirements.credit > 0 ? (
                        <CreditRequirementCard credit={resourceRequirements.credit} />
                      ) : null}
                      {resourceRequirements.items.map((item) => (
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
              ) : null}
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

function GrowthFieldHeaderRow({ compactInputs }: { compactInputs: boolean }) {
  const fieldHeaderCellClass = compactInputs ? "px-0.5 py-2 text-[10px] leading-tight" : "w-16 px-1 py-3";

  return (
    <tr className="text-left text-xs font-semibold tracking-wide text-muted-foreground">
      <th className={`${cellBase} ${stickyRowLabelClass} ${headerSurfaceClass} z-30 px-1 py-3`} />
      <th className={`${cellBase} ${headerSurfaceClass} px-2 py-3 text-center`}>성급</th>
      <th
        className={`${cellBase} ${headerSurfaceClass} ${compactInputs ? "px-0.5 py-2 text-[10px] leading-tight" : "min-w-20 px-2 py-3"} text-center`}
      >
        인연 랭크
      </th>
      <th className={`${cellBase} ${headerSurfaceClass} px-2 py-3 text-center`}>일괄 적용</th>
      {fieldDefinitions.map(({ key, label }) => (
        <th key={key} className={`${cellBase} ${headerSurfaceClass} ${fieldHeaderCellClass} text-center`}>
          {label}
        </th>
      ))}
    </tr>
  );
}

type GrowthTableLayout = {
  columnWidths: number[];
  width: number;
};

function createGrowthTableLayout(compactInputs: boolean): GrowthTableLayout {
  const inputColumnWidth = compactInputs ? 48 : 100;
  const compactColumnWidth = compactInputs ? 56 : inputColumnWidth;
  const columnWidths = [40, 160, compactColumnWidth, 80, ...fieldDefinitions.map(() => compactColumnWidth)];

  return {
    columnWidths,
    width: columnWidths.reduce((total, columnWidth) => total + columnWidth, 0),
  };
}

function GrowthTableColumnGroup({ layout }: { layout: GrowthTableLayout }) {
  return (
    <colgroup>
      {layout.columnWidths.map((width, index) => (
        <col key={tableColumnKeys[index]} style={{ width }} />
      ))}
    </colgroup>
  );
}

const TOTAL_COLS = 4 + fieldDefinitions.length;

function AddStudentControl({
  availableStudents,
  studentCount,
  sortOrder,
  showNumberInputShortcuts,
  onSortOrderChange,
  onShowNumberInputShortcutsChange,
}: {
  availableStudents: GrowthAvailableStudent[];
  studentCount: number;
  sortOrder: GrowthSortOrder;
  showNumberInputShortcuts: boolean;
  onSortOrderChange: (sortOrder: GrowthSortOrder) => void;
  onShowNumberInputShortcutsChange: (show: boolean) => void;
}) {
  const fetcher = useFetcher();
  const [selectKey, setSelectKey] = useState(0);

  return (
    <div className="relative z-50 flex flex-wrap items-center gap-x-3 gap-y-2">
      <StudentSelectForm
        key={selectKey}
        placeholder="+ 학생 추가"
        searchPlaceholder="학생 이름으로 검색"
        students={availableStudents}
        className="min-h-9 w-auto border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 [&_p]:text-primary-foreground [&>svg]:text-primary-foreground/70"
        containerClassName="w-fit"
        popoverClassName="w-[min(28rem,calc(100vw-2rem))]"
        onSelect={(value) => {
          const studentUid = Array.isArray(value) ? value[0] : value;
          if (!studentUid) return;

          fetcher.submit({ _intent: "add", studentUid }, { method: "post", encType: "application/json" });
          setSelectKey((key) => key + 1);
        }}
      />
      <GrowthViewSettingsPopover
        studentCount={studentCount}
        sortOrder={sortOrder}
        showNumberInputShortcuts={showNumberInputShortcuts}
        onSortOrderChange={onSortOrderChange}
        onShowNumberInputShortcutsChange={onShowNumberInputShortcutsChange}
      />
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
    <div className="flex items-center gap-2 pr-1">
      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-xs font-bold text-foreground/80">
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
  const numberInputGridNavigation = useNumberInputGridNavigation({ tabNavigation: true });
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const [viewSettings, setViewSettings] = useGrowthViewSettings();
  const compactInputs = !viewSettings.showNumberInputShortcuts;
  const tableLayout = useMemo(() => createGrowthTableLayout(compactInputs), [compactInputs]);
  const sortedStudents = useMemo(
    () => sortGrowthStudents(students, viewSettings.sortOrder),
    [students, viewSettings.sortOrder],
  );

  return (
    <div className="w-fit max-w-full">
      <div className="sticky top-[calc(var(--mobile-header-height)+0.5rem)] z-40 space-y-2 bg-background before:absolute before:-top-2 before:left-0 before:h-2 before:w-full before:bg-background before:content-[''] lg:top-2">
        <AddStudentControl
          availableStudents={availableStudents}
          studentCount={students.length}
          sortOrder={viewSettings.sortOrder}
          showNumberInputShortcuts={viewSettings.showNumberInputShortcuts}
          onSortOrderChange={(sortOrder) => setViewSettings((current) => ({ ...current, sortOrder }))}
          onShowNumberInputShortcutsChange={(showNumberInputShortcuts) =>
            setViewSettings((current) => ({ ...current, showNumberInputShortcuts }))
          }
        />
        <div
          ref={headerScrollRef}
          className="no-scrollbar max-w-full overflow-x-auto"
          onScroll={(event) => {
            if (bodyScrollRef.current) {
              bodyScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
        >
          <div className="inline-block overflow-clip rounded-t-lg border-x border-t border-border bg-card align-top">
            <table style={{ width: tableLayout.width }} className="table-fixed border-collapse">
              <GrowthTableColumnGroup layout={tableLayout} />
              <thead>
                <GrowthFieldHeaderRow compactInputs={compactInputs} />
              </thead>
            </table>
          </div>
        </div>
      </div>
      <div>
        <div
          ref={bodyScrollRef}
          className="max-w-full overflow-x-auto"
          onScroll={(event) => {
            if (headerScrollRef.current) {
              headerScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
        >
          <div className="inline-block overflow-clip rounded-b-lg border-x border-b border-border align-top">
            <table style={{ width: tableLayout.width }} className="table-fixed border-collapse">
              <GrowthTableColumnGroup layout={tableLayout} />
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
                {sortedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={TOTAL_COLS} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      상단의 학생 추가 버튼으로 성장 목표를 관리할 학생을 등록해주세요.
                    </td>
                  </tr>
                ) : (
                  sortedStudents.map((student, studentIndex) => (
                    <GrowthRow
                      key={student.uid}
                      student={student}
                      rowIndexBase={studentIndex * 2}
                      numberInputGridNavigation={numberInputGridNavigation}
                      showNumberInputShortcuts={viewSettings.showNumberInputShortcuts}
                      onStudentUpdate={onStudentUpdate}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
