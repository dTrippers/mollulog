import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { useFetcher } from "react-router";
import { getRelationshipLevelValidationError } from "~/domain/relationship-level";
import { isStaleStudentStateActionResult } from "~/domain/student-state-errors";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import {
  fieldDefinitions,
  type GrowthValues,
  getClientValidationError,
  getFieldMax,
  isFieldDisabledByTier,
  isGearField,
  normalizeTargetValuesForTier,
  pickGrowthValues,
  pickRelationshipValues,
  type RelationshipValues,
} from "./growth-fields";
import { shouldSyncRowDraft } from "./growth-row-sync";
import type { GrowthActionResult, GrowthStudent } from "./types";

// The autosave state of one planner row: draft values, the debounced saves of growth and relationship values, tier,
// enrollment and removal requests, their failures and retries, and the stale-page block. The table renders it.
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

// A save scheduled before the Sensei leaves the page still runs after navigation. Without an explicit
// action, React Router would post it to whichever page is current by then.
export const GROWTH_ACTION_SUBMIT_OPTIONS = {
  action: "/utils/growth/students",
  method: "post",
  encType: "application/json",
} as const;

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

type GrowthWritePayload = Record<string, string | number | null>;

export type RowWriteKind = "growth" | "relationship" | "tier" | "enroll" | "remove";

export function useGrowthRow({
  student,
  writeMode,
  onStudentUpdate,
}: {
  student: GrowthStudent;
  writeMode: "legacy" | "nullable";
  onStudentUpdate: (s: GrowthStudent) => void;
}) {
  const fetcher = useFetcher<GrowthActionResult>();
  // Keyed by content, not by the student object: a move or a resource update hands the row a new object with the same
  // values, and that must not resync the drafts or drop a pending tier save.
  const growthValuesKey = JSON.stringify(pickGrowthValues(student));
  const initialValues = useMemo(() => JSON.parse(growthValuesKey) as GrowthValues, [growthValuesKey]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef<GrowthSubmission | null>(null);
  const growthRetryRef = useRef<GrowthSubmission | null>(null);

  const relationshipFetcher = useFetcher<GrowthActionResult>();
  const relationshipValuesKey = JSON.stringify(pickRelationshipValues(student));
  const initialRelationshipValues = useMemo(
    () => JSON.parse(relationshipValuesKey) as RelationshipValues,
    [relationshipValuesKey],
  );
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
    if (writeMode === "nullable") {
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
    } else {
      Object.assign(payload, next.values, { targetTier: next.targetTier });
    }
    fetcher.submit(payload, GROWTH_ACTION_SUBMIT_OPTIONS);
  };

  const submitRelationship = (submitted: RelationshipSubmission) => {
    if (staleWriteBlockedRef.current) return;
    const next = { ...submitted, id: nextSubmissionId() };
    relationshipSubmittedRef.current = next;
    const payload: GrowthWritePayload = {
      _intent: "relationship",
      _submissionId: next.id,
      studentUid: student.uid,
      ...(writeMode === "nullable"
        ? {
            stateFormat: "nullable",
            ...(next.values.relationshipCurrentLevel !== rowState.savedRelationshipValues.relationshipCurrentLevel
              ? { currentLevel: next.values.relationshipCurrentLevel }
              : {}),
            ...(next.values.relationshipTargetLevel !== rowState.savedRelationshipValues.relationshipTargetLevel
              ? { targetLevel: next.values.relationshipTargetLevel }
              : {}),
          }
        : {
            currentLevel: next.values.relationshipCurrentLevel,
            targetLevel: next.values.relationshipTargetLevel,
          }),
    };
    if (writeMode === "nullable" && Object.keys(payload).length === 4) {
      relationshipSubmittedRef.current = null;
      return;
    }
    relationshipFetcher.submit(payload, GROWTH_ACTION_SUBMIT_OPTIONS);
  };

  const submitTier = (tier: number) => {
    if (staleWriteBlockedRef.current) return;
    const id = nextSubmissionId();
    tierSubmittedRef.current = { id, tier };
    tierFetcher.submit(
      { _intent: "tier", _submissionId: id, studentUid: student.uid, tier },
      GROWTH_ACTION_SUBMIT_OPTIONS,
    );
  };

  const submitEnroll = () => {
    if (staleWriteBlockedRef.current) return;
    const id = nextSubmissionId();
    enrollSubmittedRef.current = { id };
    enrollFetcher.submit(
      { _intent: "enroll", _submissionId: id, studentUid: student.uid },
      GROWTH_ACTION_SUBMIT_OPTIONS,
    );
  };

  const submitRemove = () => {
    if (staleWriteBlockedRef.current) return;
    const id = nextSubmissionId();
    removeSubmittedRef.current = { id };
    removeFetcher.submit(
      { _intent: "remove", _submissionId: id, studentUid: student.uid },
      GROWTH_ACTION_SUBMIT_OPTIONS,
    );
  };
  const requestResourceRequirements = useCallback(() => {
    submissionSequenceRef.current += 1;
    const submissionId = `${student.uid}:${submissionSequenceRef.current}`;
    resourceRequirementsSubmittedRef.current = { id: submissionId };
    resourceRequirementsFetcher.submit(
      { _intent: "resourceRequirements", _submissionId: submissionId, studentUid: student.uid },
      GROWTH_ACTION_SUBMIT_OPTIONS,
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
      trackGoogleAnalyticsEvent("growth_plan_changed", { action: "growth" });
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
      trackGoogleAnalyticsEvent("growth_plan_changed", { action: "relationship" });
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
      trackGoogleAnalyticsEvent("growth_plan_changed", { action: "tier" });
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
      trackGoogleAnalyticsEvent("growth_plan_changed", { action: "enroll" });
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
      trackGoogleAnalyticsEvent("growth_plan_changed", { action: "remove" });
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
      const validationError = getRelationshipLevelValidationError(
        {
          currentLevel: values.relationshipCurrentLevel,
          targetLevel: values.relationshipTargetLevel,
        },
        writeMode === "nullable",
      );
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
      if (isFieldDisabledByTier(key, tierDraft)) {
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
      if (isFieldDisabledByTier(targetKey, effectiveTargetTier)) {
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

  const remove = () => {
    if (staleWriteBlockedRef.current) return;
    dispatchRow({ type: "setRemoveError", error: null });
    dispatchRow({ type: "setRetryAvailable", kind: "remove", available: false });
    submitRemove();
  };

  const enroll = () => {
    if (staleWriteBlockedRef.current) return;
    dispatchRow({ type: "clearEnrollError" });
    dispatchRow({ type: "setRetryAvailable", kind: "enroll", available: false });
    submitEnroll();
  };

  // A save the Sensei started is in flight or scheduled. The resource recalculation that follows is not a save.
  const isSaving =
    isPendingSave ||
    fetcher.state !== "idle" ||
    relationshipFetcher.state !== "idle" ||
    tierFetcher.state !== "idle" ||
    enrollFetcher.state !== "idle" ||
    removeFetcher.state !== "idle";

  return {
    draftValues,
    draftRelationshipValues,
    tierDraft,
    targetTierDraft,
    effectiveTier,
    staleWriteBlocked: rowState.staleWriteBlocked,
    retryAvailable: rowState.retryAvailable,
    displayedErrors,
    resourceRequirements,
    isCalculatingResources,
    hasResourceRequirements,
    isSaving,
    isRemoving: removeFetcher.state !== "idle",
    handleFieldChange,
    handleRelationshipFieldChange,
    handleCurrentTierChange,
    handleTargetTierChange,
    handleSetAllMaxCurrent,
    handleSetAllMaxTargets,
    handleRetry,
    remove,
    enroll,
  };
}

export type GrowthRowState = ReturnType<typeof useGrowthRow>;
