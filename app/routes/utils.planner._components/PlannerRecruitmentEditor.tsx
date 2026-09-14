import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Button, Callout, Checkbox, Dropdown, Input } from "~/components/primitives";
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
};

type RecruitmentDraft = {
  expectedTrials: string;
  favoriteStudentUids: string[];
};

type PendingSubmission = {
  input: PlannerRecruitmentSaveInput;
  previousSubmissionId: string | null;
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
    candidates.find((candidate) => candidate.eventUid === preferredEventUid)?.eventUid ?? candidates[0]?.eventUid ?? ""
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
      if (candidates.some((candidate) => candidate.eventUid === current)) return current;
      return preferredCandidate?.eventUid ?? candidates[0]?.eventUid ?? "";
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
    if (!pending || pending.previousSubmissionId === saveResult.submissionId) return;

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
  }, [pendingSubmission, saveResult]);

  const selectedCandidate =
    candidates.find((candidate) => candidate.eventUid === selectedEventUid) ?? candidates[0] ?? null;
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

    const input: PlannerRecruitmentSaveInput = {
      eventUid: selectedCandidate.eventUid,
      expectedTrials,
      favoriteStudentUids: [...draft.favoriteStudentUids],
    };
    if (!hasDraftChanges(draft, savedState) || isPending) return;

    setExpectedTrialsError(null);
    setFeedback(null);
    setPendingSubmission({
      input,
      previousSubmissionId: saveResult?.submissionId ?? null,
    });
    try {
      onSave(input);
    } catch {
      setPendingSubmission(null);
      setFeedback({ tone: "warning", message: "저장 요청을 시작하지 못했어요. 다시 시도해주세요." });
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-labelledby={`${controlId}-title`}>
      <div>
        <h3 id={`${controlId}-title`} className="text-sm font-semibold text-foreground">
          모집 계획
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isSignedIn ? "저장하면 계정 계획에 반영돼요." : "저장하면 이 브라우저에 계획이 보관돼요."}
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          선택한 날짜에 진행 중인 모집이 없어요.
        </p>
      ) : selectedCandidate && draft ? (
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Dropdown
            id={`${controlId}-event`}
            label="모집 선택"
            value={selectedCandidate.eventUid}
            options={candidates.map((candidate) => ({ value: candidate.eventUid, label: candidate.eventName }))}
            onChange={(eventUid) => {
              setSelectedEventUid(eventUid);
              setExpectedTrialsError(null);
              setFeedback(null);
            }}
            fullWidth
            disabled={isPending}
          />

          <p className="text-sm text-muted-foreground">
            첫 모집일:{" "}
            <span className="font-medium text-foreground">
              {formatRecruitmentFirstDay(selectedCandidate.startDate)}
            </span>
          </p>

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

          <fieldset className="space-y-2" disabled={isPending}>
            <legend className="text-sm font-medium text-foreground">목표 학생</legend>
            {selectedCandidate.students.length === 0 ? (
              <p className="text-sm text-muted-foreground">선택할 학생 정보가 없어요.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {selectedCandidate.students.map((student) => (
                  <Checkbox
                    key={student.uid}
                    checked={draft.favoriteStudentUids.includes(student.uid)}
                    className="min-w-0 rounded-md p-2 hover:bg-muted/50"
                    onChange={(checked) => {
                      const selected = new Set(draft.favoriteStudentUids);
                      if (checked) selected.add(student.uid);
                      else selected.delete(student.uid);
                      updateDraft(selectedUid, { ...draft, favoriteStudentUids: [...selected] });
                    }}
                    label={
                      <span className="flex min-w-0 items-center gap-2">
                        <img
                          src={studentImageUrl(student.imageUid ?? student.uid)}
                          alt=""
                          className="size-9 shrink-0 rounded-full object-cover"
                          loading="lazy"
                        />
                        <span className="truncate">{student.name}</span>
                      </span>
                    }
                    disabled={isPending}
                  />
                ))}
              </div>
            )}
          </fieldset>

          {feedback ? <Callout tone={feedback.tone} description={feedback.message} /> : null}

          <div className="flex justify-end">
            <Button
              type="submit"
              text={isPending ? "저장 중…" : "모집 계획 저장"}
              size="sm"
              variant="primary"
              disabled={isPending || !hasDraftChanges(draft, savedState) || parsedExpectedTrials === undefined}
            />
          </div>
        </form>
      ) : null}
    </section>
  );
}

export default PlannerRecruitmentEditor;
