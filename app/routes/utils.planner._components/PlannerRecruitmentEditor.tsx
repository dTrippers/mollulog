import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button, Callout, Checkbox, Input } from "~/components/primitives";
import { studentImageUrl } from "~/models/assets";

export type PlannerRecruitmentCandidate = {
  eventUid: string;
  eventName: string;
  startDate: string;
  students: { uid: string; name: string; imageUid: string | null }[];
};

export type PlannerRecruitmentSavedState = {
  eventUid: string;
  expectedTrials: number | null;
  favoriteStudentUids: string[];
};

export type PlannerRecruitmentSaveInput = {
  submissionId?: string;
  eventUid: string;
  expectedTrials: number | null;
  favoriteStudentUids: string[];
};

export type PlannerRecruitmentSaveResult = {
  submissionId: string;
  success: boolean;
  error?: string;
};

export type PlannerRecruitmentEditorProps = {
  selectedDate: string;
  candidates: readonly PlannerRecruitmentCandidate[];
  savedStates: readonly PlannerRecruitmentSavedState[];
  preferredEventUid?: string;
  isSignedIn: boolean;
  isSaving: boolean;
  saveResult: PlannerRecruitmentSaveResult | null;
  onSave: (input: PlannerRecruitmentSaveInput) => void;
  onSaved?: () => void;
  onCancel?: () => void;
};

type RecruitmentDraft = {
  expectedTrials: string;
  favoriteStudentUids: string[];
};

type PendingSubmission = {
  submissionId: string;
  input: PlannerRecruitmentSaveInput;
};

type SaveFeedback = {
  tone: "success" | "warning";
  message: string;
};

function getSavedState(
  savedStates: readonly PlannerRecruitmentSavedState[],
  eventUid: string,
): PlannerRecruitmentSavedState | undefined {
  return savedStates.find((state) => state.eventUid === eventUid);
}

function draftFromSavedState(savedState?: PlannerRecruitmentSavedState): RecruitmentDraft {
  return {
    expectedTrials: savedState?.expectedTrials == null ? "" : String(savedState.expectedTrials),
    favoriteStudentUids: [...(savedState?.favoriteStudentUids ?? [])],
  };
}

function draftFromSaveInput(input: PlannerRecruitmentSaveInput): RecruitmentDraft {
  return {
    expectedTrials: input.expectedTrials == null ? "" : String(input.expectedTrials),
    favoriteStudentUids: [...input.favoriteStudentUids],
  };
}

function createInitialDrafts(
  candidates: readonly PlannerRecruitmentCandidate[],
  savedStates: readonly PlannerRecruitmentSavedState[],
): Record<string, RecruitmentDraft> {
  return Object.fromEntries(
    candidates.map((candidate) => [
      candidate.eventUid,
      draftFromSavedState(getSavedState(savedStates, candidate.eventUid)),
    ]),
  );
}

function parseExpectedTrials(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function sameUidSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((uid) => rightSet.has(uid));
}

function draftsEqual(left: RecruitmentDraft | undefined, right: RecruitmentDraft): boolean {
  return Boolean(
    left &&
      left.expectedTrials === right.expectedTrials &&
      left.favoriteStudentUids.length === right.favoriteStudentUids.length &&
      left.favoriteStudentUids.every((uid, index) => uid === right.favoriteStudentUids[index]),
  );
}

function draftMatchesInput(draft: RecruitmentDraft | undefined, input: PlannerRecruitmentSaveInput): boolean {
  if (!draft) return false;
  const expectedTrials = parseExpectedTrials(draft.expectedTrials);
  return expectedTrials === input.expectedTrials && sameUidSet(draft.favoriteStudentUids, input.favoriteStudentUids);
}

function hasDraftChanges(draft: RecruitmentDraft, savedState?: PlannerRecruitmentSavedState): boolean {
  const expectedTrials = parseExpectedTrials(draft.expectedTrials);
  return (
    expectedTrials === undefined ||
    expectedTrials !== (savedState?.expectedTrials ?? null) ||
    !sameUidSet(draft.favoriteStudentUids, savedState?.favoriteStudentUids ?? [])
  );
}

function savedStatesEqual(left?: PlannerRecruitmentSavedState, right?: PlannerRecruitmentSavedState): boolean {
  return (
    (left?.expectedTrials ?? null) === (right?.expectedTrials ?? null) &&
    sameUidSet(left?.favoriteStudentUids ?? [], right?.favoriteStudentUids ?? [])
  );
}

function saveInputAsState(input: PlannerRecruitmentSaveInput): PlannerRecruitmentSavedState {
  return {
    eventUid: input.eventUid,
    expectedTrials: input.expectedTrials,
    favoriteStudentUids: [...input.favoriteStudentUids],
  };
}

function formatRecruitmentFirstDay(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function getInitialEventUid(candidates: readonly PlannerRecruitmentCandidate[], preferredEventUid?: string): string {
  return (
    candidates.find((candidate) => candidate.eventUid === preferredEventUid)?.eventUid ??
    (candidates.length === 1 ? (candidates[0]?.eventUid ?? "") : "")
  );
}

export function PlannerRecruitmentEditor({
  selectedDate,
  candidates,
  savedStates,
  preferredEventUid,
  isSignedIn,
  isSaving,
  saveResult,
  onSave,
  onSaved,
  onCancel,
}: PlannerRecruitmentEditorProps) {
  const controlId = useId();
  const [selectedEventUid, setSelectedEventUid] = useState(() => getInitialEventUid(candidates, preferredEventUid));
  const [draftsByEventUid, setDraftsByEventUid] = useState(() => createInitialDrafts(candidates, savedStates));
  const [confirmedStatesByEventUid, setConfirmedStatesByEventUid] = useState<
    Record<string, PlannerRecruitmentSavedState>
  >({});
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
  const [expectedTrialsError, setExpectedTrialsError] = useState<string | null>(null);
  const lastSeenSubmissionIdRef = useRef<string | null>(saveResult?.submissionId ?? null);
  const selectionContextRef = useRef({ selectedDate, preferredEventUid });

  useEffect(() => {
    const contextChanged =
      selectionContextRef.current.selectedDate !== selectedDate ||
      selectionContextRef.current.preferredEventUid !== preferredEventUid;
    selectionContextRef.current = { selectedDate, preferredEventUid };

    const preferredCandidate = candidates.find((candidate) => candidate.eventUid === preferredEventUid);
    setSelectedEventUid((current) => {
      if (contextChanged && preferredCandidate) return preferredCandidate.eventUid;
      if (candidates.length === 1) return candidates[0].eventUid;
      if (contextChanged) return "";
      if (candidates.some((candidate) => candidate.eventUid === current)) return current;
      return preferredCandidate?.eventUid ?? "";
    });
  }, [candidates, preferredEventUid, selectedDate]);

  useEffect(() => {
    setConfirmedStatesByEventUid((current) => {
      let next = current;
      for (const [eventUid, confirmedState] of Object.entries(current)) {
        const persistedState = getSavedState(savedStates, eventUid) ?? {
          eventUid,
          expectedTrials: null,
          favoriteStudentUids: [],
        };
        if (!savedStatesEqual(persistedState, confirmedState)) continue;
        if (next === current) next = { ...current };
        delete next[eventUid];
      }
      return next;
    });
  }, [savedStates]);

  useEffect(() => {
    setDraftsByEventUid((current) => {
      let next = current;
      for (const candidate of candidates) {
        const savedState =
          confirmedStatesByEventUid[candidate.eventUid] ?? getSavedState(savedStates, candidate.eventUid);
        const savedDraft = draftFromSavedState(savedState);
        const currentDraft = current[candidate.eventUid];

        if (currentDraft && hasDraftChanges(currentDraft, savedState)) continue;
        if (draftsEqual(currentDraft, savedDraft)) continue;

        if (next === current) next = { ...current };
        next[candidate.eventUid] = savedDraft;
      }
      return next;
    });
  }, [candidates, confirmedStatesByEventUid, savedStates]);

  useEffect(() => {
    if (!saveResult || lastSeenSubmissionIdRef.current === saveResult.submissionId) return;
    lastSeenSubmissionIdRef.current = saveResult.submissionId;

    const pending = pendingSubmission;
    if (!pending || pending.submissionId !== saveResult.submissionId) return;

    setPendingSubmission(null);
    if (!saveResult.success) {
      setFeedback({
        tone: "warning",
        message: saveResult.error || "모집 계획을 저장하지 못했어요. 입력은 유지했으니 다시 시도해주세요.",
      });
      return;
    }

    const { input } = pending;
    const submittedDraft = draftFromSaveInput(input);
    setConfirmedStatesByEventUid((current) => {
      const nextState = saveInputAsState(input);
      return savedStatesEqual(current[input.eventUid], nextState)
        ? current
        : { ...current, [input.eventUid]: nextState };
    });
    setDraftsByEventUid((current) => {
      if (!draftMatchesInput(current[input.eventUid], input)) return current;
      return draftsEqual(current[input.eventUid], submittedDraft)
        ? current
        : { ...current, [input.eventUid]: submittedDraft };
    });
    setFeedback({ tone: "success", message: "모집 계획을 저장했어요." });
    onSaved?.();
  }, [onSaved, pendingSubmission, saveResult]);

  const selectedCandidate =
    candidates.find((candidate) => candidate.eventUid === selectedEventUid) ??
    (candidates.length === 1 ? candidates[0] : null);
  const isChoosingCandidate = candidates.length > 1 && selectedCandidate === null;
  const selectedUid = selectedCandidate?.eventUid ?? "";
  const savedState = selectedCandidate
    ? (confirmedStatesByEventUid[selectedCandidate.eventUid] ?? getSavedState(savedStates, selectedCandidate.eventUid))
    : undefined;
  const draft = selectedCandidate
    ? (draftsByEventUid[selectedCandidate.eventUid] ?? draftFromSavedState(savedState))
    : null;
  const parsedExpectedTrials = draft ? parseExpectedTrials(draft.expectedTrials) : undefined;
  const isPending = isSaving || pendingSubmission !== null;

  function updateDraft(eventUid: string, nextDraft: RecruitmentDraft) {
    setDraftsByEventUid((current) => {
      if (draftsEqual(current[eventUid], nextDraft)) return current;
      return { ...current, [eventUid]: nextDraft };
    });
    setExpectedTrialsError(null);
    setFeedback(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCandidate || !draft) return;

    const expectedTrials = parseExpectedTrials(draft.expectedTrials);
    if (expectedTrials === undefined) {
      setExpectedTrialsError("예상 모집 횟수는 0 이상의 정수로 입력하거나 비워 두세요.");
      return;
    }

    const submissionId = crypto.randomUUID();
    const input: PlannerRecruitmentSaveInput = {
      submissionId,
      eventUid: selectedCandidate.eventUid,
      expectedTrials,
      favoriteStudentUids: [...draft.favoriteStudentUids],
    };
    if (!hasDraftChanges(draft, savedState) || isPending) return;

    setExpectedTrialsError(null);
    setFeedback(null);
    setPendingSubmission({ input, submissionId });
    try {
      onSave(input);
    } catch {
      setPendingSubmission(null);
      setFeedback({ tone: "warning", message: "저장 요청을 시작하지 못했어요. 다시 시도해주세요." });
    }
  }

  function handleCancel() {
    if (isPending) return;
    if (onCancel) {
      onCancel();
      return;
    }
    if (selectedCandidate) updateDraft(selectedUid, draftFromSavedState(savedState));
    setExpectedTrialsError(null);
    setFeedback(null);
  }

  return (
    <section className="space-y-4" aria-labelledby={`${controlId}-title`}>
      <div>
        <h3 id={`${controlId}-title`} className="text-base font-semibold text-foreground">
          모집 계획
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignedIn ? "저장하면 계정 계획에 반영돼요." : "저장하면 이 브라우저에 계획이 보관돼요."}
        </p>
      </div>

      {candidates.length === 0 ? (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            선택한 날짜에 진행 중인 모집이 없어요.
          </p>
          <div className="sticky bottom-0 z-layer-navigation flex justify-end border-t border-border bg-background/95 py-3 backdrop-blur-sm">
            <Button type="button" text="취소" variant="secondary" size="sm" onClick={handleCancel} />
          </div>
        </>
      ) : isChoosingCandidate ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">모집 일정을 선택해주세요.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {candidates.map((candidate) => (
              <button
                key={candidate.eventUid}
                type="button"
                onClick={() => {
                  setSelectedEventUid(candidate.eventUid);
                  setExpectedTrialsError(null);
                  setFeedback(null);
                }}
                className="min-w-0 rounded-md bg-card p-3 text-left shadow-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              >
                <span className="block break-words text-sm font-semibold text-foreground">{candidate.eventName}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  첫 모집일 {formatRecruitmentFirstDay(candidate.startDate)}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  픽업 학생 {candidate.students.length}명
                </span>
              </button>
            ))}
          </div>
          <div className="sticky bottom-0 z-layer-navigation flex justify-end border-t border-border bg-background/95 py-3 backdrop-blur-sm">
            <Button type="button" text="취소" variant="secondary" size="sm" onClick={handleCancel} />
          </div>
        </div>
      ) : selectedCandidate && draft ? (
        <form className="space-y-4 pb-28" onSubmit={handleSubmit}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="break-words text-sm font-semibold text-foreground">{selectedCandidate.eventName}</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                첫 모집일 {formatRecruitmentFirstDay(selectedCandidate.startDate)}
              </p>
            </div>
            {candidates.length > 1 ? (
              <Button
                type="button"
                text="모집 변경"
                size="xs"
                variant="secondary"
                onClick={() => {
                  setSelectedEventUid("");
                  setExpectedTrialsError(null);
                  setFeedback(null);
                }}
                disabled={isPending}
              />
            ) : null}
          </div>

          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            선택한 날짜가 모집 기간 중간이어도 이 계획은 첫 모집일{" "}
            <span className="font-medium text-foreground">
              {formatRecruitmentFirstDay(selectedCandidate.startDate)}
            </span>
            에 반영돼요.
          </p>

          <fieldset className="space-y-2" disabled={isPending}>
            <legend className="w-full text-sm font-medium text-foreground">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span>목표 학생</span>
                <span className="text-sm font-normal text-muted-foreground" aria-live="polite">
                  {draft.favoriteStudentUids.length}명 선택
                </span>
              </span>
            </legend>
            {selectedCandidate.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">선택할 학생 정보가 없어요.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {selectedCandidate.students.map((student, index) => {
                  const selected = draft.favoriteStudentUids.includes(student.uid);
                  return (
                    <Checkbox
                      key={student.uid}
                      id={`${controlId}-student-${index}`}
                      checked={selected}
                      className={`w-full min-w-0 items-center gap-3 rounded-md p-3 text-left transition-colors focus-within:ring-2 focus-within:ring-ring/30 ${
                        selected ? "bg-primary/10 ring-2 ring-primary" : "bg-card shadow-xs hover:bg-muted"
                      }`}
                      onChange={(checked) => {
                        const selectedUids = new Set(draft.favoriteStudentUids);
                        if (checked) selectedUids.add(student.uid);
                        else selectedUids.delete(student.uid);
                        updateDraft(selectedUid, { ...draft, favoriteStudentUids: [...selectedUids] });
                      }}
                      label={
                        <span className="flex w-full min-w-0 items-center gap-3">
                          <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-muted">
                            <img
                              src={studentImageUrl(student.imageUid ?? student.uid)}
                              alt=""
                              className="size-12 rounded-full object-cover"
                              loading="lazy"
                            />
                            {selected ? (
                              <span
                                aria-hidden="true"
                                className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                              >
                                ✓
                              </span>
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1 break-words text-sm text-foreground">{student.name}</span>
                        </span>
                      }
                      disabled={isPending}
                    />
                  );
                })}
              </div>
            )}
          </fieldset>

          <Input
            id={`${controlId}-expected-trials`}
            label="예상 모집 횟수"
            description="비워 두면 이 모집에 대한 별도 예상 횟수를 설정하지 않아요."
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={draft.expectedTrials}
            onChange={(value) => {
              updateDraft(selectedUid, { ...draft, expectedTrials: value });
              setExpectedTrialsError(
                parseExpectedTrials(value) === undefined
                  ? "예상 모집 횟수는 0 이상의 정수로 입력하거나 비워 두세요."
                  : null,
              );
            }}
            error={expectedTrialsError ?? undefined}
            disabled={isPending}
          />

          {feedback ? <Callout tone={feedback.tone} description={feedback.message} /> : null}

          <div className="sticky bottom-0 z-layer-navigation flex flex-col-reverse gap-2 border-t border-border bg-background/95 py-3 backdrop-blur-sm sm:flex-row sm:justify-end">
            <Button
              type="button"
              text="취소"
              size="sm"
              variant="secondary"
              onClick={handleCancel}
              disabled={isPending}
              fullWidth
              className="sm:w-fit"
            />
            <Button
              type="submit"
              text={isPending ? "저장 중…" : "저장"}
              size="sm"
              variant="primary"
              disabled={isPending || !hasDraftChanges(draft, savedState) || parsedExpectedTrials === undefined}
              fullWidth
              className="sm:w-fit"
            />
          </div>
        </form>
      ) : null}
    </section>
  );
}

export default PlannerRecruitmentEditor;
