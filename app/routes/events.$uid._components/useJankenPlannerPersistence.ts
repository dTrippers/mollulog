import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { createDefaultJankenPlannerEntry } from "~/domain/event-shop/janken";
import type { JankenDefaultProgress } from "~/domain/event-shop/janken";
import type { JankenPlannerEntry } from "~/domain/planner-state";
import { normalizeJankenPlannerProgress } from "~/domain/planner-state";
import type { JankenPlannerPersistenceState } from "~/lib/event-shop/plan-context";
import { updateGuestPlanner } from "~/lib/guest-planner.client";
import { jankenLocale as t } from "~/locales/ko";

type JankenSaveResponse = {
  success?: boolean;
  conflict?: boolean;
  error?: string;
  entry?: JankenPlannerEntry;
  latest?: JankenPlannerEntry | null;
};

type UseJankenPlannerPersistenceInput = {
  shopStateUid: string;
  signedIn: boolean;
  defaultProgress: JankenDefaultProgress;
  savedEntry: JankenPlannerEntry | null;
};

function normalizeEntry(shopStateUid: string, entry: JankenPlannerEntry | null): JankenPlannerEntry | null {
  if (!entry) return null;
  return normalizeJankenPlannerProgress({ [shopStateUid]: entry })?.[shopStateUid] ?? entry;
}

export function useJankenPlannerPersistence({
  shopStateUid,
  signedIn,
  defaultProgress,
  savedEntry: externalSavedEntry,
}: UseJankenPlannerPersistenceInput) {
  const fetcher = useFetcher<JankenSaveResponse>();
  const [entry, setEntryState] = useState(
    externalSavedEntry ?? createDefaultJankenPlannerEntry(defaultProgress),
  );
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const [savedEntry, setSavedEntry] = useState(externalSavedEntry);
  const baseRef = useRef<JankenPlannerEntry | null>(externalSavedEntry);
  const baselineEntryRef = useRef(externalSavedEntry ?? createDefaultJankenPlannerEntry(defaultProgress));
  const lastExternalSavedRef = useRef(externalSavedEntry);
  const lastDefaultProgressRef = useRef(defaultProgress);
  const loadedShopStateUidRef = useRef(shopStateUid);
  const submittedEntryRef = useRef<JankenPlannerEntry | null>(null);
  const handledResponseRef = useRef<unknown>(null);
  const guestSaveInFlightRef = useRef(false);
  const guestOverwritePendingRef = useRef(false);
  const latestConflictRef = useRef<JankenPlannerEntry | null>(null);
  const [isSavingGuestEntry, setIsSavingGuestEntry] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [, setLatestConflict] = useState<JankenPlannerEntry | null>(null);

  const entriesEqual = useCallback(
    (left: JankenPlannerEntry | null, right: JankenPlannerEntry | null) =>
      JSON.stringify(normalizeEntry(shopStateUid, left)) === JSON.stringify(normalizeEntry(shopStateUid, right)),
    [shopStateUid],
  );
  const setEntry = useCallback((next: JankenPlannerEntry) => {
    entryRef.current = next;
    setEntryState(next);
  }, []);
  const setConflict = useCallback((latest: JankenPlannerEntry | null, message: string) => {
    latestConflictRef.current = latest;
    setLatestConflict(latest);
    setConflictError(message);
    setIsConflict(true);
  }, []);

  const submitAccountEntry = useCallback(
    (submitted: JankenPlannerEntry, base: JankenPlannerEntry | null) => {
      submittedEntryRef.current = submitted;
      setSaveError(null);
      setIsSavingGuestEntry(true);
      try {
        fetcher.submit(
          { shopStateUid, entry: submitted, base },
          { method: "post", action: "/api/planner/janken", encType: "application/json" },
        );
      } catch {
        submittedEntryRef.current = null;
        setIsSavingGuestEntry(false);
        setSaveError(t.saveFailed);
      }
    },
    [fetcher.submit, shopStateUid],
  );

  const isDirty = !entriesEqual(entry, baselineEntryRef.current);

  useEffect(() => {
    const shopChanged = loadedShopStateUidRef.current !== shopStateUid;
    const savedChanged = !entriesEqual(lastExternalSavedRef.current, externalSavedEntry);
    const defaultsChanged = JSON.stringify(lastDefaultProgressRef.current) !== JSON.stringify(defaultProgress);
    if (!shopChanged && !savedChanged && !defaultsChanged) return;

    loadedShopStateUidRef.current = shopStateUid;
    lastExternalSavedRef.current = externalSavedEntry;
    lastDefaultProgressRef.current = defaultProgress;

    if (shopChanged) {
      baseRef.current = externalSavedEntry;
      baselineEntryRef.current = externalSavedEntry ?? createDefaultJankenPlannerEntry(defaultProgress);
      setSavedEntry(externalSavedEntry);
      setEntry(externalSavedEntry ?? createDefaultJankenPlannerEntry(defaultProgress));
      setSaveError(null);
      setConflictError(null);
      setLatestConflict(null);
      latestConflictRef.current = null;
      setIsConflict(false);
      guestOverwritePendingRef.current = false;
      return;
    }

    if (isConflict) {
      setConflict(externalSavedEntry, conflictError ?? t.conflict);
      return;
    }

    const currentEntry = entryRef.current;
    const currentIsDirty = !entriesEqual(currentEntry, baselineEntryRef.current);
    const refreshedEntry = externalSavedEntry ?? createDefaultJankenPlannerEntry(defaultProgress);

    if (!currentIsDirty || entriesEqual(currentEntry, refreshedEntry)) {
      baseRef.current = externalSavedEntry;
      baselineEntryRef.current = refreshedEntry;
      setSavedEntry(externalSavedEntry);
      setEntry(refreshedEntry);
      return;
    }

    const submitted = submittedEntryRef.current;
    if (submitted && externalSavedEntry && entriesEqual(externalSavedEntry, submitted)) {
      baseRef.current = externalSavedEntry;
      baselineEntryRef.current = externalSavedEntry;
      setSavedEntry(externalSavedEntry);
      if (entriesEqual(currentEntry, submitted)) setEntry(externalSavedEntry);
      submittedEntryRef.current = null;
      return;
    }

    if (!entriesEqual(externalSavedEntry, baseRef.current)) setConflict(externalSavedEntry, t.conflict);
  }, [
    conflictError,
    defaultProgress,
    entriesEqual,
    externalSavedEntry,
    isConflict,
    setConflict,
    setEntry,
    shopStateUid,
  ]);

  useEffect(() => {
    const response = fetcher.data;
    if (!response || handledResponseRef.current === response) return;
    handledResponseRef.current = response;
    setIsSavingGuestEntry(false);

    if (response.success && response.entry) {
      const submitted = submittedEntryRef.current ?? response.entry;
      baseRef.current = response.entry;
      baselineEntryRef.current = response.entry;
      setSavedEntry(response.entry);
      setIsConflict(false);
      setLatestConflict(null);
      latestConflictRef.current = null;
      setConflictError(null);
      setSaveError(null);
      if (entriesEqual(entryRef.current, submitted)) setEntry(response.entry);
      submittedEntryRef.current = null;
    } else if (response.conflict) {
      submittedEntryRef.current = null;
      setIsSavingGuestEntry(false);
      setConflict(response.latest ?? null, response.error ?? t.conflict);
    } else {
      submittedEntryRef.current = null;
      setSaveError(response.error ?? t.saveFailed);
    }
  }, [entriesEqual, fetcher.data, setConflict, setEntry]);

  const saveGuestEntry = useCallback(
    async (submitted: JankenPlannerEntry, base = baseRef.current, overwrite = false) => {
      if (guestSaveInFlightRef.current) return;
      guestSaveInFlightRef.current = true;
      setIsSavingGuestEntry(true);
      setSaveError(null);
      submittedEntryRef.current = submitted;
      try {
        let latestMismatch: JankenPlannerEntry | null | undefined;
        const snapshot = await updateGuestPlanner((envelope) => {
          const latest = envelope.document.jankenProgress[shopStateUid] ?? null;
          if (!entriesEqual(latest, base)) {
            latestMismatch = latest;
            return envelope;
          }
          return {
            ...envelope,
            document: {
              ...envelope.document,
              jankenProgress: { ...envelope.document.jankenProgress, [shopStateUid]: submitted },
            },
          };
        });
        if (latestMismatch !== undefined) {
          submittedEntryRef.current = null;
          setConflict(latestMismatch, t.conflict);
          return;
        }
        if (snapshot.status === "conflict" && "envelope" in snapshot) {
          submittedEntryRef.current = null;
          setConflict(snapshot.envelope.document.jankenProgress[shopStateUid] ?? null, t.conflict);
          return;
        }
        if (snapshot.status !== "ready") {
          submittedEntryRef.current = null;
          setSaveError(t.guestSaveFailed);
          return;
        }
        baseRef.current = submitted;
        baselineEntryRef.current = submitted;
        setSavedEntry(submitted);
        lastExternalSavedRef.current = submitted;
        if (entriesEqual(entryRef.current, submitted)) setEntry(submitted);
        submittedEntryRef.current = null;
        if (overwrite) {
          guestOverwritePendingRef.current = false;
          setIsConflict(false);
          setConflictError(null);
          setLatestConflict(null);
          latestConflictRef.current = null;
        }
        setSaveError(null);
      } catch {
        submittedEntryRef.current = null;
        setSaveError(t.guestSaveFailed);
      } finally {
        guestSaveInFlightRef.current = false;
        setIsSavingGuestEntry(false);
      }
    },
    [entriesEqual, setConflict, setEntry, shopStateUid],
  );

  useEffect(() => {
    if (
      !isDirty ||
      isConflict ||
      saveError ||
      isSavingGuestEntry ||
      guestSaveInFlightRef.current ||
      fetcher.state !== "idle"
    )
      return;
    const timeout = setTimeout(() => {
      if (signedIn) submitAccountEntry(entry, baseRef.current);
      else void saveGuestEntry(entry);
    }, 800);
    return () => clearTimeout(timeout);
  }, [
    entry,
    fetcher.state,
    isConflict,
    isDirty,
    isSavingGuestEntry,
    saveError,
    saveGuestEntry,
    signedIn,
    submitAccountEntry,
  ]);

  const reloadLatest = useCallback(() => {
    const latest = latestConflictRef.current;
    baseRef.current = latest;
    baselineEntryRef.current = latest ?? createDefaultJankenPlannerEntry(defaultProgress);
    setSavedEntry(latest);
    setEntry(latest ?? createDefaultJankenPlannerEntry(defaultProgress));
    submittedEntryRef.current = null;
    setSaveError(null);
    setIsConflict(false);
    guestOverwritePendingRef.current = false;
    setConflictError(null);
    setLatestConflict(null);
    latestConflictRef.current = null;
  }, [defaultProgress, setEntry]);

  const overwrite = useCallback(() => {
    if (!isConflict) return;
    const latest = latestConflictRef.current;
    if (!signedIn) {
      guestOverwritePendingRef.current = true;
      void saveGuestEntry(entryRef.current, latest, true);
      return;
    }
    baseRef.current = latest;
    baselineEntryRef.current = latest ?? createDefaultJankenPlannerEntry(defaultProgress);
    setSavedEntry(latest);
    setIsConflict(false);
    setConflictError(null);
    setLatestConflict(null);
    latestConflictRef.current = null;
    submitAccountEntry(entryRef.current, latest);
  }, [defaultProgress, isConflict, saveGuestEntry, signedIn, submitAccountEntry]);

  const retrySave = useCallback(() => {
    if (!signedIn && guestOverwritePendingRef.current) {
      void saveGuestEntry(entryRef.current, latestConflictRef.current, true);
      return;
    }
    setSaveError(null);
  }, [saveGuestEntry, signedIn]);

  return {
    entry,
    savedEntry,
    setEntry,
    persistence: {
      hasSavedEntry: savedEntry !== null,
      isSaving: isSavingGuestEntry || fetcher.state !== "idle",
      saveError,
      isConflict,
      conflictError,
      reloadLatest,
      overwrite,
      retrySave,
    } satisfies JankenPlannerPersistenceState,
  };
}
