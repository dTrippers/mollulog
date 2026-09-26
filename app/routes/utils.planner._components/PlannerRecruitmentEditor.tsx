import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { StudentCards } from "~/components/features/students";
import { Button } from "~/components/primitives";
import { formatInstant } from "~/lib/date-time";
import { studentImageUrl } from "~/models/assets";
import type { RunType } from "~/models/timeline-content";

export type PlannerRecruitmentCandidate = {
  eventUid: string;
  eventName: string;
  startDate: string;
  endDate: string;
  startAt: string | null;
  endAt: string | null;
  imageUrl: string | null;
  runType?: RunType;
  students: { uid: string; name: string; imageUid: string | null }[];
};

type PlannerRecruitmentStudent = PlannerRecruitmentCandidate["students"][number];

export type PlannerRecruitmentSavedState = {
  eventUid: string;
  expectedTrials: number | null;
  favoriteStudentUids: string[];
};

export type PlannerRecruitmentSaveInput = {
  submissionId?: string;
  eventUid: string;
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
  timeZone: string;
  savedStates: readonly PlannerRecruitmentSavedState[];
  preferredEventUid?: string;
  isSaving: boolean;
  saveResult: PlannerRecruitmentSaveResult | null;
  onSave: (input: PlannerRecruitmentSaveInput) => void;
  onSaved?: () => void;
  onCancel?: () => void;
};

type RecruitmentDraft = {
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
    favoriteStudentUids: [...(savedState?.favoriteStudentUids ?? [])],
  };
}

function draftFromSaveInput(input: PlannerRecruitmentSaveInput): RecruitmentDraft {
  return {
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

function sameUidSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((uid) => rightSet.has(uid));
}

function draftsEqual(left: RecruitmentDraft | undefined, right: RecruitmentDraft): boolean {
  return Boolean(
    left &&
      left.favoriteStudentUids.length === right.favoriteStudentUids.length &&
      left.favoriteStudentUids.every((uid, index) => uid === right.favoriteStudentUids[index]),
  );
}

function draftMatchesInput(draft: RecruitmentDraft | undefined, input: PlannerRecruitmentSaveInput): boolean {
  if (!draft) return false;
  return sameUidSet(draft.favoriteStudentUids, input.favoriteStudentUids);
}

function hasDraftChanges(draft: RecruitmentDraft, savedState?: PlannerRecruitmentSavedState): boolean {
  return !sameUidSet(draft.favoriteStudentUids, savedState?.favoriteStudentUids ?? []);
}

function savedStatesEqual(left?: PlannerRecruitmentSavedState, right?: PlannerRecruitmentSavedState): boolean {
  return (
    (left?.expectedTrials ?? null) === (right?.expectedTrials ?? null) &&
    sameUidSet(left?.favoriteStudentUids ?? [], right?.favoriteStudentUids ?? [])
  );
}

function saveInputAsState(
  input: PlannerRecruitmentSaveInput,
  previousState?: PlannerRecruitmentSavedState,
): PlannerRecruitmentSavedState {
  return {
    eventUid: input.eventUid,
    expectedTrials: previousState?.expectedTrials ?? null,
    favoriteStudentUids: [...input.favoriteStudentUids],
  };
}

function recruitmentRunTypeLabel(runType?: RunType): string | null {
  if (runType === "first") return "최초";
  if (runType === "rerun") return "복각";
  if (runType === "permanent") return "상설";
  return null;
}

function formatRecruitmentEndpoint(
  dateKey: string,
  instant: string | null,
  referenceDateKey: string,
  timeZone: string,
): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const fallback = `${month}/${day}`;
  const endpointYear = instant ? Number(formatInstant(instant, { timeZone, format: "YYYY" })) : year;
  const referenceYear = Number(referenceDateKey.slice(0, 4));
  const includeYear = Number.isFinite(endpointYear) && Number.isFinite(referenceYear) && endpointYear !== referenceYear;
  return instant
    ? formatInstant(instant, { timeZone, format: includeYear ? "YYYY/M/D HH:mm" : "M/D HH:mm" })
    : includeYear
      ? `${year}/${month}/${day}`
      : fallback;
}

function formatRecruitmentRange(candidate: PlannerRecruitmentCandidate, referenceDateKey: string, timeZone: string) {
  const start = formatRecruitmentEndpoint(candidate.startDate, candidate.startAt, referenceDateKey, timeZone);
  const end = candidate.endAt
    ? formatRecruitmentEndpoint(candidate.endDate, candidate.endAt, referenceDateKey, timeZone)
    : "종료 시각을 확인할 수 없어요";
  return `${start} ~ ${end}`;
}

function formatRecruitmentMetadata(
  candidate: PlannerRecruitmentCandidate,
  referenceDateKey: string,
  timeZone: string,
): string {
  const runType = recruitmentRunTypeLabel(candidate.runType);
  return `${runType ? `${runType} · ` : ""}모집 ${formatRecruitmentRange(candidate, referenceDateKey, timeZone)}`;
}

function RecruitmentEventImage({ imageUrl, className }: { imageUrl: string | null; className: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  return imageUrl && !imageFailed ? (
    <img
      src={imageUrl}
      alt=""
      aria-hidden="true"
      className={`${className} object-cover`}
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  ) : (
    <span aria-hidden="true" className={`${className} bg-muted`} />
  );
}

function RecruitmentStudentPortraits({ students }: { students: readonly PlannerRecruitmentStudent[] }) {
  const visibleStudents = students.slice(0, 3);
  const remainingCount = Math.max(0, students.length - visibleStudents.length);

  return (
    <span aria-hidden="true" className="flex shrink-0 items-center">
      {visibleStudents.map((student, index) => (
        <span
          key={student.uid}
          className={`relative size-7 overflow-hidden rounded-full bg-muted ring-2 ring-popover ${index > 0 ? "-ml-2" : ""}`}
        >
          <img
            src={studentImageUrl(student.imageUid ?? student.uid)}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        </span>
      ))}
      {remainingCount > 0 ? (
        <span className="-ml-2 grid size-7 place-items-center rounded-full bg-muted text-[10px] text-muted-foreground ring-2 ring-popover">
          +{remainingCount}
        </span>
      ) : null}
    </span>
  );
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
  timeZone,
  savedStates,
  preferredEventUid,
  isSaving,
  saveResult,
  onSave,
  onSaved,
  onCancel,
}: PlannerRecruitmentEditorProps) {
  const [selectedEventUid, setSelectedEventUid] = useState(() => getInitialEventUid(candidates, preferredEventUid));
  const [draftsByEventUid, setDraftsByEventUid] = useState(() => createInitialDrafts(candidates, savedStates));
  const [confirmedStatesByEventUid, setConfirmedStatesByEventUid] = useState<
    Record<string, PlannerRecruitmentSavedState>
  >({});
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const [feedback, setFeedback] = useState<SaveFeedback | null>(null);
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
      const nextState = saveInputAsState(input, getSavedState(savedStates, input.eventUid));
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
  }, [onSaved, pendingSubmission, saveResult, savedStates]);

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
  const hasUnsavedRecruitmentChanges = candidates.some((candidate) => {
    const eventState = confirmedStatesByEventUid[candidate.eventUid] ?? getSavedState(savedStates, candidate.eventUid);
    const eventDraft = draftsByEventUid[candidate.eventUid] ?? draftFromSavedState(eventState);
    return hasDraftChanges(eventDraft, eventState);
  });
  const isPending = isSaving || pendingSubmission !== null;

  function updateDraft(eventUid: string, nextDraft: RecruitmentDraft) {
    setDraftsByEventUid((current) => {
      if (draftsEqual(current[eventUid], nextDraft)) return current;
      return { ...current, [eventUid]: nextDraft };
    });
    setFeedback(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCandidate || !draft) return;

    const submissionId = crypto.randomUUID();
    const input: PlannerRecruitmentSaveInput = {
      submissionId,
      eventUid: selectedCandidate.eventUid,
      favoriteStudentUids: [...draft.favoriteStudentUids],
    };
    if (!hasDraftChanges(draft, savedState) || isPending) return;

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
    setFeedback(null);
  }

  return (
    <section className="space-y-4">
      {candidates.length === 0 ? (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            선택한 날짜에 진행 중인 모집이 없어요.
          </p>
          <div className="sticky bottom-0 z-layer-navigation flex justify-end border-t border-border bg-background/95 py-3 backdrop-blur-sm">
            <Button
              type="button"
              text="취소"
              variant="secondary"
              size="sm"
              onClick={handleCancel}
              className="bg-muted hover:bg-muted/70"
            />
          </div>
        </>
      ) : isChoosingCandidate ? (
        <div className="space-y-0">
          <p className="mb-1 text-sm text-muted-foreground">모집을 선택해주세요.</p>
          <div className="border-t border-border">
            {candidates.map((candidate) => {
              const targetCount = getSavedState(savedStates, candidate.eventUid)?.favoriteStudentUids.length ?? 0;
              return (
                <button
                  key={candidate.eventUid}
                  type="button"
                  onClick={() => {
                    setSelectedEventUid(candidate.eventUid);
                    setFeedback(null);
                  }}
                  className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_1rem] items-start gap-3 border-b border-border py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <RecruitmentEventImage imageUrl={candidate.imageUrl} className="size-10 rounded-md" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 block break-keep text-sm font-semibold text-foreground">
                      {candidate.eventName}
                    </span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                      {formatRecruitmentMetadata(candidate, selectedDate, timeZone)}
                    </span>
                    <span className="mt-1.5 flex min-w-0 items-center gap-2">
                      <RecruitmentStudentPortraits students={candidate.students} />
                      <span className="text-xs text-muted-foreground">
                        {targetCount > 0 ? `관심 ${targetCount}명` : "계획 없음"}
                      </span>
                    </span>
                  </span>
                  <ChevronRightIcon aria-hidden="true" className="size-4 self-center text-muted-foreground" />
                </button>
              );
            })}
          </div>
          <div className="-mx-4 mt-3 border-t border-border bg-popover px-4 py-3 sm:mx-0 sm:flex sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 lg:-mx-6 lg:px-6">
            <Button
              type="button"
              text="취소"
              variant="secondary"
              size="sm"
              onClick={handleCancel}
              fullWidth
              className="bg-muted hover:bg-muted/70 sm:w-fit"
            />
          </div>
        </div>
      ) : selectedCandidate && draft ? (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <header className="flex min-w-0 items-start gap-3">
            <RecruitmentEventImage imageUrl={selectedCandidate.imageUrl} className="size-12 rounded-md" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 break-keep text-sm font-semibold text-foreground">
                {selectedCandidate.eventName}
              </p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                {formatRecruitmentMetadata(selectedCandidate, selectedDate, timeZone)}
              </p>
            </div>
            {candidates.length > 1 ? (
              <Button
                type="button"
                text="모집 변경"
                size="xs"
                variant="secondary"
                className="shrink-0"
                onClick={() => {
                  setSelectedEventUid("");
                  setFeedback(null);
                }}
                disabled={isPending}
              />
            ) : null}
          </header>

          <div className="space-y-3">
            <fieldset className="space-y-2" disabled={isPending}>
              <legend className="text-sm font-medium text-foreground">관심 학생</legend>
              {selectedCandidate.students.length === 0 ? (
                <p className="text-sm text-muted-foreground">선택할 학생 정보가 없어요.</p>
              ) : (
                <StudentCards
                  layout="responsive-wrap"
                  mobileGrid={5}
                  cardSize="md"
                  gap="normal"
                  namePlacement="below"
                  students={selectedCandidate.students.map((student) => ({
                    uid: student.imageUid ?? student.uid,
                    selectionKey: student.uid,
                    name: student.name,
                    checked: draft.favoriteStudentUids.includes(student.uid),
                    selectionStyle: "check" as const,
                  }))}
                  onSelect={(studentUid) => {
                    const selectedStudentUids = new Set(draft.favoriteStudentUids);
                    if (selectedStudentUids.has(studentUid)) selectedStudentUids.delete(studentUid);
                    else selectedStudentUids.add(studentUid);
                    updateDraft(selectedUid, { ...draft, favoriteStudentUids: [...selectedStudentUids] });
                  }}
                />
              )}
            </fieldset>
            <Button
              to={`/utils/pyroxene?eventUid=${encodeURIComponent(selectedCandidate.eventUid)}`}
              text="청휘석 플래너에서 보기"
              size="xs"
              variant="secondary"
              className="bg-muted hover:bg-muted/70"
              onClick={(event) => {
                if (
                  hasUnsavedRecruitmentChanges &&
                  !window.confirm("저장하지 않은 관심 학생 선택을 버리고 이동할까요?")
                ) {
                  event.preventDefault();
                }
              }}
            />
          </div>

          {feedback ? (
            <p role={feedback.tone === "warning" ? "alert" : "status"} className="text-sm text-muted-foreground">
              {feedback.message}
            </p>
          ) : null}

          <div className="sticky bottom-0 z-layer-navigation -mx-4 grid grid-cols-2 gap-2 border-t border-border bg-popover px-4 py-3 sm:flex sm:justify-end lg:-mx-6 lg:px-6">
            <Button
              type="button"
              text="취소"
              size="sm"
              variant="secondary"
              onClick={handleCancel}
              disabled={isPending}
              fullWidth
              className="bg-muted hover:bg-muted/70 sm:w-fit"
            />
            <Button
              type="submit"
              text={isPending ? "저장 중…" : "저장"}
              size="sm"
              variant="primary"
              disabled={isPending || !hasDraftChanges(draft, savedState)}
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
