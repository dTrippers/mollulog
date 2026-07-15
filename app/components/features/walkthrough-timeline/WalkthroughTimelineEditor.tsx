import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  DocumentArrowDownIcon,
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { nanoid } from "nanoid/non-secure";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Form, useBlocker, useNavigation } from "react-router";
import { StudentCard } from "~/components/features/students";
import Button from "~/components/primitives/Button";
import Field from "~/components/primitives/Field";
import Input from "~/components/primitives/Input";
import ProfileImage from "~/components/primitives/ProfileImage";
import Textarea from "~/components/primitives/Textarea";
import Toggle from "~/components/primitives/Toggle";
import {
  parseWalkthroughTimelineDocument,
  type TimelineAction,
  type TimelineStep,
  WALKTHROUGH_TIMELINE_DIFFICULTIES,
  WALKTHROUGH_TIMELINE_LIMITS,
  type WalkthroughParty,
  type WalkthroughTimelineDefenseType,
  type WalkthroughTimelineDocument,
  type WalkthroughTimelineVisibility,
  type WalkthroughUnit,
} from "~/domain/walkthrough-timeline";
import { type ImportDraft, type ImportStudent, parseTimelineImport } from "~/domain/walkthrough-timeline-import";
import { filterStudentByName } from "~/filters/student";
import { defenseTypeLocale, difficultyLocale } from "~/locales/ko";
import WalkthroughPartyFormationEditor, { resizeWalkthroughParty } from "./WalkthroughPartyFormationEditor";

type BossOption = {
  uid: string;
  name: string;
  defenseTypes: WalkthroughTimelineDefenseType[];
};

type EditorProps = {
  initialTitle: string;
  initialVisibility: WalkthroughTimelineVisibility;
  initialDocument: WalkthroughTimelineDocument;
  students: ImportStudent[];
  bosses: BossOption[];
  recruitedSnapshots: Record<string, NonNullable<WalkthroughUnit["snapshot"]>>;
  activePartyIndex: number;
  onActivePartyIndexChange: (index: number) => void;
  onPartiesChange: (parties: WalkthroughParty[]) => void;
  onActionStateChange: (state: WalkthroughTimelineEditorActionState) => void;
  draftStorageKey: string;
  error?: string;
};

export type WalkthroughTimelineEditorActionState = {
  canUndo: boolean;
  canRedo: boolean;
};

export type WalkthroughTimelineEditorHandle = {
  addParty: () => void;
  deleteActiveParty: () => void;
  undo: () => void;
  redo: () => void;
};

function emptyParty(order: number): WalkthroughParty {
  return { uid: nanoid(8), order, startingSkillStudentUids: [], units: [], steps: [] };
}

function emptyStep(order: number, studentUid = ""): TimelineStep {
  return {
    uid: nanoid(8),
    order,
    kind: "actions",
    marker: { kind: "manual", value: "" },
    actions: [{ kind: "student_ex", studentUid }],
  };
}

function emptyDivider(order: number): TimelineStep {
  return {
    uid: nanoid(8),
    order,
    kind: "divider",
    actions: [],
    note: "",
  };
}

function reorder<T>(values: T[], from: number, to: number) {
  if (to < 0 || to >= values.length) return values;
  const next = [...values];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const WALKTHROUGH_TIMELINE_DRAFT_VERSION = 1;

function ImportStudentLabel({ student }: { student: ImportStudent }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ProfileImage studentUid={student.uid} imageSize={6} />
      <span className="truncate">{student.name}</span>
    </span>
  );
}

function ImportMappingField({
  rawName,
  students,
  studentUid,
  onChange,
}: {
  rawName: string;
  students: ImportStudent[];
  studentUid?: string;
  onChange: (studentUid: string | undefined) => void;
}) {
  const [query, setQuery] = useState(rawName);
  const selectedStudent = students.find((student) => student.uid === studentUid);
  const results = query.trim() && !selectedStudent ? filterStudentByName(query, students, 5) : [];

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(8rem,0.6fr)_minmax(0,1fr)] sm:items-start">
      <div className="pt-2 text-sm font-semibold">{rawName}</div>
      {selectedStudent ? (
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3">
          <span className="min-w-0 text-sm font-medium">
            <ImportStudentLabel student={selectedStudent} />
          </span>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`${rawName} 매핑 해제`}
            onClick={() => onChange(undefined)}
          >
            <XMarkIcon className="size-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:border-ring">
            <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              aria-label={`${rawName}에 대응하는 학생 검색`}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="학생 이름 또는 별명으로 찾기"
            />
          </label>
          {query.trim() && (
            <div className="flex flex-wrap gap-1.5">
              {results.length > 0 ? (
                results.map((student) => (
                  <button
                    key={student.uid}
                    type="button"
                    className="rounded-md bg-muted px-2.5 py-1.5 text-xs font-medium hover:bg-primary/10 hover:text-primary"
                    onClick={() => onChange(student.uid)}
                  >
                    <ImportStudentLabel student={student} />
                  </button>
                ))
              ) : (
                <span className="px-1 py-1 text-xs text-muted-foreground">검색 결과가 없어요.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImportReview({
  raw,
  students,
  partyStudentUids,
  onImport,
}: {
  raw: string;
  students: ImportStudent[];
  partyStudentUids: string[];
  onImport: (draft: ImportDraft) => void;
}) {
  const [mappings, setMappings] = useState<Array<{ rawName: string; studentUid: string }>>([]);
  const draft = useMemo(() => parseTimelineImport(raw, students, mappings), [raw, students, mappings]);
  const unresolved = [...new Set(draft.issues.map((issue) => issue.raw))];
  const studentByUid = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
  const missingPartyStudents = useMemo(() => {
    const partyStudentUidSet = new Set(partyStudentUids);
    const missingUids = new Set(
      draft.steps.flatMap((step) =>
        step.parsed.actions.flatMap((action) =>
          action.studentUid && !partyStudentUidSet.has(action.studentUid) ? [action.studentUid] : [],
        ),
      ),
    );
    return [...missingUids].flatMap((uid) => {
      const student = studentByUid.get(uid);
      return student ? [student] : [];
    });
  }, [draft.steps, partyStudentUids, studentByUid]);

  const actionLabel = (action: TimelineAction) => {
    if (action.kind === "free_text" || action.kind === "boss_gimmick")
      return <span>{action.text || "해석되지 않은 내용"}</span>;
    const student = action.studentUid ? studentByUid.get(action.studentUid) : undefined;
    if (!student) return <span>학생 확인 필요</span>;
    const target = action.targetStudentUid ? studentByUid.get(action.targetStudentUid) : undefined;
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <ImportStudentLabel student={student} />
        {action.copied && <span className="text-xs text-muted-foreground">복제</span>}
        {target && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            대상
            <ImportStudentLabel student={target} />
          </span>
        )}
        {action.text && <span className="text-xs text-muted-foreground">· {action.text}</span>}
      </span>
    );
  };

  if (!raw.trim()) return null;
  return (
    <div className="mt-4 space-y-4">
      {unresolved.length > 0 && (
        <section className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <div>
            <h5 className="text-sm font-bold">학생 확인이 필요한 표현 {unresolved.length}개</h5>
            <p className="mt-1 text-xs text-muted-foreground">
              대응하는 학생을 찾지 못했습니다. 그대로 두면 원문 텍스트로 가져옵니다.
            </p>
          </div>
          {unresolved.map((rawName) => (
            <ImportMappingField
              key={rawName}
              rawName={rawName}
              students={students}
              studentUid={mappings.find((mapping) => mapping.rawName === rawName)?.studentUid}
              onChange={(studentUid) =>
                setMappings((current) => [
                  ...current.filter((mapping) => mapping.rawName !== rawName),
                  ...(studentUid ? [{ rawName, studentUid }] : []),
                ])
              }
            />
          ))}
        </section>
      )}

      {missingPartyStudents.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <h5 className="text-sm font-bold">현재 편성에 없는 학생 {missingPartyStudents.length}명</h5>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missingPartyStudents.map((student) => (
              <span
                key={student.uid}
                className="inline-flex items-center rounded-md bg-background px-2 py-1 text-xs font-medium"
              >
                <ImportStudentLabel student={student} />
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            단계는 그대로 가져옵니다. 이후 해당 학생을 편성에 추가하거나, 편성된 학생으로 바꿀 수 있습니다.
          </p>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center justify-between gap-3 bg-muted/60 px-4 py-3">
          <h5 className="text-sm font-bold">가져올 단계</h5>
          <span className="text-xs text-muted-foreground">{draft.steps.length}개</span>
        </div>
        <ol className="divide-y divide-border">
          {draft.steps.map((step) => (
            <li
              key={`${step.sourceLine}-${step.raw}`}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[7rem_minmax(0,1fr)]"
            >
              {step.parsed.kind === "divider" ? (
                <div className="sm:col-span-2 flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs font-bold text-muted-foreground">{step.parsed.note || "구분선"}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : (
                <>
                  <div className="text-sm font-semibold text-primary">{step.parsed.marker?.value || "조건 없음"}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {step.parsed.actions.map((action, index) => (
                        // Imported actions intentionally have no stable identity before they enter the editor.
                        // biome-ignore lint/suspicious/noArrayIndexKey: duplicate actions must remain visible in source order.
                        <span key={`${step.parsed.uid}-action-${index}`} className="inline-flex items-center gap-1.5">
                          {index > 0 && <span className="text-muted-foreground">→</span>}
                          <span
                            className={`inline-flex min-h-8 items-center rounded-md border border-border bg-background/70 px-2 py-1 ${
                              action.kind === "free_text" ? "text-amber-700 dark:text-amber-300" : ""
                            }`}
                          >
                            {actionLabel(action)}
                          </span>
                        </span>
                      ))}
                    </div>
                    {step.parsed.note && <p className="mt-1 text-xs text-muted-foreground">{step.parsed.note}</p>}
                    <p className="mt-1 truncate text-xs text-muted-foreground/70" title={step.raw}>
                      {step.raw}
                    </p>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">매핑은 이번 가져오기에만 적용됩니다.</p>
        <Button text={`${draft.steps.length}개 단계 가져오기`} variant="primary" onClick={() => onImport(draft)} />
      </div>
    </div>
  );
}

function ActionEditor({
  action,
  students,
  selectedStudent,
  targetStudent,
  order,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  action: TimelineAction;
  students: ImportStudent[];
  selectedStudent?: ImportStudent;
  targetStudent?: ImportStudent;
  order: number;
  onChange: (action: TimelineAction) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [targetEnabled, setTargetEnabled] = useState(Boolean(action.targetStudentUid));
  const selectedStudentIsOutsideParty =
    Boolean(selectedStudent) && !students.some((student) => student.uid === selectedStudent?.uid);
  const targetStudentIsOutsideParty =
    Boolean(targetStudent) && !students.some((student) => student.uid === targetStudent?.uid);
  const visibleStudents = selectedStudentIsOutsideParty && selectedStudent ? [selectedStudent, ...students] : students;
  const visibleTargetStudents = targetStudentIsOutsideParty && targetStudent ? [targetStudent, ...students] : students;

  useEffect(() => {
    setTargetEnabled(Boolean(action.targetStudentUid));
  }, [action.targetStudentUid]);

  return (
    <div className="space-y-2.5 rounded-md border border-border bg-background p-3">
      {selectedStudentIsOutsideParty && selectedStudent && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          {selectedStudent.name}은(는) 현재 편성에 없어요.
        </p>
      )}
      {targetStudentIsOutsideParty && targetStudent && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          대상 {targetStudent.name}은(는) 현재 편성에 없어요.
        </p>
      )}
      <div className="flex items-start gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center text-sm font-semibold text-muted-foreground">
          {order}
        </span>
        <fieldset className="min-w-0 flex-1">
          <legend className="sr-only">사용할 학생</legend>
          <div className="flex flex-wrap gap-1.5">
            {visibleStudents.map((student) => {
              const selected = action.studentUid === student.uid;
              const outsideParty = selectedStudentIsOutsideParty && student.uid === selectedStudent?.uid;
              return (
                <button
                  key={student.uid}
                  type="button"
                  aria-label={`${student.name} EX 스킬 사용`}
                  aria-pressed={selected}
                  className={`size-11 shrink-0 overflow-hidden rounded-md p-0.5 outline-none transition ${
                    selected
                      ? outsideParty
                        ? "bg-amber-500/10 ring-2 ring-amber-500"
                        : "bg-primary/10 ring-2 ring-primary"
                      : "hover:bg-muted"
                  }`}
                  onClick={() =>
                    onChange({
                      ...action,
                      kind: "student_ex",
                      studentUid: student.uid,
                    })
                  }
                >
                  <StudentCard uid={student.uid} name={student.name} role={student.role} hideName flush />
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="스킬 위로 이동"
          >
            <ArrowUpIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="스킬 아래로 이동"
          >
            <ArrowDownIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
            aria-label="스킬 삭제"
          >
            <TrashIcon className="size-5" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:pl-8">
        <input
          aria-label="대상 또는 세부 내용"
          className="h-9 min-w-40 flex-1 rounded-md border border-input bg-background px-3 text-sm sm:max-w-xs"
          value={action.text ?? ""}
          onChange={(event) => onChange({ ...action, text: event.target.value })}
          placeholder="세부 내용"
        />
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={targetEnabled}
              onChange={(event) => {
                const enabled = event.target.checked;
                setTargetEnabled(enabled);
                if (!enabled) {
                  onChange({ ...action, targetStudentUid: undefined });
                }
              }}
            />
            대상
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={action.copied ?? false}
              onChange={(event) => onChange({ ...action, copied: event.target.checked })}
            />
            복제
          </label>
        </div>
      </div>
      {targetEnabled && (
        <fieldset className="sm:pl-8">
          <legend className="sr-only">대상 학생</legend>
          <div className="flex flex-wrap gap-1.5">
            {visibleTargetStudents.map((student) => {
              const selected = action.targetStudentUid === student.uid;
              const outsideParty = targetStudentIsOutsideParty && student.uid === targetStudent?.uid;
              return (
                <button
                  key={student.uid}
                  type="button"
                  aria-label={`${student.name} 대상 지정`}
                  aria-pressed={selected}
                  className={`size-9 shrink-0 overflow-hidden rounded-full p-0.5 outline-none transition ${
                    selected
                      ? outsideParty
                        ? "bg-amber-500/10 ring-2 ring-amber-500"
                        : "bg-primary/10 ring-2 ring-primary"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => onChange({ ...action, targetStudentUid: student.uid })}
                >
                  <StudentCard uid={student.uid} name={student.name} role={student.role} hideName circular flush />
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}

function actionSummaryLabel(action: TimelineAction, studentsByUid: Map<string, ImportStudent>) {
  if (!action.studentUid) return action.text || "내용 확인 필요";
  const student = studentsByUid.get(action.studentUid);
  const target = action.targetStudentUid ? studentsByUid.get(action.targetStudentUid) : undefined;
  const name = student?.name ?? "학생 확인 필요";
  return `${action.copied ? "C" : ""}${name}${target ? ` [대상: ${target.name}]` : ""}`;
}

export const WalkthroughTimelineEditor = forwardRef<WalkthroughTimelineEditorHandle, EditorProps>(
  function WalkthroughTimelineEditor(
    {
      initialTitle,
      initialVisibility,
      initialDocument,
      students,
      bosses,
      recruitedSnapshots,
      activePartyIndex,
      onActivePartyIndexChange,
      onPartiesChange,
      onActionStateChange,
      draftStorageKey,
      error,
    },
    ref,
  ) {
    const [title, setTitle] = useState(initialTitle);
    const [visibility, setVisibility] = useState(initialVisibility);
    const [document, setDocument] = useState(initialDocument);
    const [past, setPast] = useState<WalkthroughTimelineDocument[]>([]);
    const [future, setFuture] = useState<WalkthroughTimelineDocument[]>([]);
    const [showImporter, setShowImporter] = useState(false);
    const [importText, setImportText] = useState("");
    const [expandedStepUid, setExpandedStepUid] = useState<string | null>(null);
    const [draggedStep, setDraggedStep] = useState<{ partyUid: string; index: number } | null>(null);
    const [draftReady, setDraftReady] = useState(false);
    const navigation = useNavigation();
    const isSavingRef = useRef(false);
    const initialStateRef = useRef(
      JSON.stringify({ title: initialTitle, visibility: initialVisibility, document: initialDocument, importText: "" }),
    );
    const studentsByUid = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
    const currentState = useMemo(
      () => ({ title, visibility, document, importText }),
      [document, importText, title, visibility],
    );
    const currentStateJson = useMemo(() => JSON.stringify(currentState), [currentState]);
    const hasChanges = currentStateJson !== initialStateRef.current;

    useEffect(() => {
      try {
        const stored = localStorage.getItem(draftStorageKey);
        if (stored) {
          const draft = JSON.parse(stored) as {
            version?: number;
            title?: unknown;
            visibility?: unknown;
            document?: unknown;
            importText?: unknown;
          };
          if (draft.version === WALKTHROUGH_TIMELINE_DRAFT_VERSION) {
            const restoredDocument = parseWalkthroughTimelineDocument(draft.document);
            if (typeof draft.title !== "string" || !["private", "public"].includes(String(draft.visibility))) {
              throw new Error("invalid timeline draft");
            }
            setTitle(draft.title.slice(0, 100));
            setVisibility(draft.visibility as WalkthroughTimelineVisibility);
            setDocument(restoredDocument);
            if (typeof draft.importText === "string" && draft.importText) {
              setImportText(draft.importText);
              setShowImporter(true);
            }
          }
        }
      } catch {
        localStorage.removeItem(draftStorageKey);
      } finally {
        setDraftReady(true);
      }
    }, [draftStorageKey]);

    useEffect(() => {
      if (navigation.state === "idle" && isSavingRef.current) {
        isSavingRef.current = false;
      }
    }, [navigation.state]);

    useEffect(() => {
      if (!draftReady || navigation.state !== "idle" || isSavingRef.current) return;
      const timeout = window.setTimeout(() => {
        try {
          if (!hasChanges) {
            localStorage.removeItem(draftStorageKey);
            return;
          }
          localStorage.setItem(
            draftStorageKey,
            JSON.stringify({
              version: WALKTHROUGH_TIMELINE_DRAFT_VERSION,
              savedAt: Date.now(),
              ...currentState,
            }),
          );
        } catch {
          // Ignore localStorage errors and keep the editor usable.
        }
      }, 300);
      return () => window.clearTimeout(timeout);
    }, [currentState, draftReady, draftStorageKey, hasChanges, navigation.state]);

    const blocker = useBlocker(({ currentLocation, nextLocation }) => {
      return draftReady && hasChanges && !isSavingRef.current && currentLocation.pathname !== nextLocation.pathname;
    });

    useEffect(() => {
      if (blocker.state !== "blocked") return;
      if (window.confirm("편집 중인 공략이 있어요. 페이지를 벗어나시겠어요?")) blocker.proceed();
      else blocker.reset();
    }, [blocker]);

    useEffect(() => {
      if (!draftReady || !hasChanges) return;
      const handleBeforeUnload = (event: BeforeUnloadEvent) => {
        if (isSavingRef.current) return;
        event.preventDefault();
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [draftReady, hasChanges]);

    useEffect(() => {
      onPartiesChange(document.parties);
      if (document.parties.length > 0 && activePartyIndex >= document.parties.length) {
        onActivePartyIndexChange(document.parties.length - 1);
      }
    }, [activePartyIndex, document.parties, onActivePartyIndexChange, onPartiesChange]);

    useEffect(() => {
      onActionStateChange({ canUndo: past.length > 0, canRedo: future.length > 0 });
    }, [future.length, onActionStateChange, past.length]);

    const commit = (update: (current: WalkthroughTimelineDocument) => WalkthroughTimelineDocument) => {
      setDocument((current) => {
        const next = update(current);
        setPast((history) => [...history.slice(-49), current]);
        setFuture([]);
        return next;
      });
    };
    const updateParty = (partyIndex: number, update: (party: WalkthroughParty) => WalkthroughParty) =>
      commit((current) => ({
        ...current,
        parties: current.parties.map((party, index) => (index === partyIndex ? update(party) : party)),
      }));

    const addParty = () => {
      if (document.parties.length >= WALKTHROUGH_TIMELINE_LIMITS.parties) return;
      const nextPartyIndex = document.parties.length;
      commit((current) => ({ ...current, parties: [...current.parties, emptyParty(current.parties.length)] }));
      onActivePartyIndexChange(nextPartyIndex);
    };

    const deleteActiveParty = () => {
      if (!document.parties[activePartyIndex]) return;
      const nextPartyIndex = Math.min(activePartyIndex, Math.max(document.parties.length - 2, 0));
      commit((current) => ({
        ...current,
        parties: current.parties
          .filter((_, index) => index !== activePartyIndex)
          .map((party, index) => ({ ...party, order: index })),
      }));
      onActivePartyIndexChange(nextPartyIndex);
    };

    const undo = () => {
      const previous = past.at(-1);
      if (!previous) return;
      setPast((history) => history.slice(0, -1));
      setFuture((history) => [document, ...history].slice(0, 50));
      setDocument(previous);
    };

    const redo = () => {
      const next = future[0];
      if (!next) return;
      setFuture((history) => history.slice(1));
      setPast((history) => [...history, document].slice(-50));
      setDocument(next);
    };

    useImperativeHandle(ref, () => ({
      addParty,
      deleteActiveParty,
      undo,
      redo,
    }));

    const selectedBoss = bosses.find((boss) => boss.uid === document.context.bossUid);
    return (
      <Form
        id="walkthrough-timeline-editor"
        method="post"
        className="space-y-5"
        onSubmit={() => {
          isSavingRef.current = true;
          try {
            localStorage.removeItem(draftStorageKey);
          } catch {
            // Ignore localStorage errors and continue saving to the server.
          }
        }}
      >
        <input type="hidden" name="document" value={JSON.stringify(document)} />
        <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <h2 className="text-lg font-bold">공략 설정</h2>
          <div className="mt-4 space-y-4">
            <Input
              name="title"
              label="제목"
              value={title}
              onChange={setTitle}
              required
              maxLength={100}
              className="max-w-none"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="보스" htmlFor="boss">
                <select
                  id="boss"
                  value={document.context.bossUid}
                  className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(event) => {
                    const boss = bosses.find((candidate) => candidate.uid === event.target.value);
                    if (!boss) return;
                    const defenseType = boss.defenseTypes.includes(document.context.defenseType)
                      ? document.context.defenseType
                      : boss.defenseTypes[0];
                    if (!defenseType) return;
                    commit((current) => ({
                      ...current,
                      context: {
                        ...current.context,
                        bossUid: boss.uid,
                        defenseType,
                      },
                    }));
                  }}
                >
                  {bosses.map((boss) => (
                    <option key={boss.uid} value={boss.uid}>
                      {boss.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="방어 타입" htmlFor="defense-type">
                <select
                  id="defense-type"
                  value={document.context.defenseType}
                  className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(event) =>
                    commit((current) => ({
                      ...current,
                      context: {
                        ...current.context,
                        defenseType: event.target.value as WalkthroughTimelineDefenseType,
                      },
                    }))
                  }
                >
                  {selectedBoss?.defenseTypes.map((defenseType) => (
                    <option key={defenseType} value={defenseType}>
                      {defenseTypeLocale[defenseType as keyof typeof defenseTypeLocale] ?? defenseType}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="난이도" htmlFor="max-difficulty">
                <select
                  id="max-difficulty"
                  value={document.context.maxDifficulty}
                  className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(event) =>
                    commit((current) => ({
                      ...current,
                      context: {
                        ...current.context,
                        maxDifficulty: event.target.value as WalkthroughTimelineDocument["context"]["maxDifficulty"],
                      },
                    }))
                  }
                >
                  {WALKTHROUGH_TIMELINE_DIFFICULTIES.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {difficultyLocale[difficulty]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="공개 범위" htmlFor="visibility">
                <select
                  id="visibility"
                  name="visibility"
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as WalkthroughTimelineVisibility)}
                  className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="private">나만 보기</option>
                  <option value="public">전체 공개</option>
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">파티 인원</legend>
              <Toggle
                label={`${document.partySize}명`}
                initialState={document.partySize === 10}
                className="mt-2"
                trackClassName="bg-blue-500 data-checked:bg-purple-500"
                onChange={(usesTenStudents) => {
                  const partySize = usesTenStudents ? 10 : 6;
                  commit((current) => ({
                    ...current,
                    partySize,
                    parties: current.parties.map((party) =>
                      resizeWalkthroughParty(party, current.partySize, partySize),
                    ),
                  }));
                }}
              />
            </fieldset>
          </div>
        </section>

        <section className="space-y-5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">편성 정보 편집</h2>
            </div>
          </div>

          {document.parties.map((party, partyIndex) =>
            partyIndex === activePartyIndex ? (
              <article key={party.uid} className="space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold">파티 {partyIndex + 1}</h3>
                  <Button
                    icon={TrashIcon}
                    text="파티 삭제"
                    variant="danger-subtle"
                    size="sm"
                    onClick={deleteActiveParty}
                  />
                </div>
                <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
                  <h4 className="font-bold">편성 정보</h4>
                  <div className="mt-4">
                    <WalkthroughPartyFormationEditor
                      party={party}
                      partySize={document.partySize}
                      students={students}
                      recruitedSnapshots={recruitedSnapshots}
                      onChange={(next) => updateParty(partyIndex, () => next)}
                    />
                  </div>
                </section>
                <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h4 className="font-bold">타임라인 정보</h4>
                    <Button
                      text={showImporter ? "가져오기 닫기" : "기존 공략 가져오기"}
                      icon={DocumentArrowDownIcon}
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowImporter((current) => !current)}
                    />
                  </div>
                  {showImporter && (
                    <div className="mt-4 rounded-lg border border-border p-4">
                      <Textarea
                        label="텍스트에서 가져오기"
                        value={importText}
                        onChange={setImportText}
                        rows={7}
                        className="font-mono"
                        placeholder="03:49.000 c돌마리\n즉시 드아루 → 수시노"
                      />
                      <ImportReview
                        raw={importText}
                        students={students}
                        partyStudentUids={party.units.flatMap((unit) => unit.studentUid ?? [])}
                        onImport={(draft) => {
                          updateParty(activePartyIndex, (currentParty) => ({
                            ...currentParty,
                            steps: draft.steps
                              .slice(0, WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty)
                              .map((step, index) => ({ ...step.parsed, order: index })),
                          }));
                          setExpandedStepUid(null);
                          setImportText("");
                          setShowImporter(false);
                        }}
                      />
                    </div>
                  )}
                  <ol className="mt-4 list-none space-y-3" aria-label={`파티 ${partyIndex + 1} 단계`}>
                    {party.steps.map((step, stepIndex) => {
                      const expanded = expandedStepUid === step.uid;
                      const stepLabel = step.kind === "divider" ? `구분선 ${stepIndex + 1}` : `단계 ${stepIndex + 1}`;
                      return (
                        <li
                          key={step.uid}
                          className={`group overflow-hidden rounded-md border transition-colors ${
                            expanded ? "border-primary/40 bg-primary/3" : "border-border bg-background"
                          }`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (!draggedStep || draggedStep.partyUid !== party.uid || draggedStep.index === stepIndex)
                              return;
                            updateParty(partyIndex, (item) => ({
                              ...item,
                              steps: reorder(item.steps, draggedStep.index, stepIndex).map((value, index) => ({
                                ...value,
                                order: index,
                              })),
                            }));
                            setDraggedStep(null);
                          }}
                        >
                          <div className="flex items-center gap-1 px-2 py-2">
                            <button
                              type="button"
                              draggable
                              aria-expanded={expanded}
                              aria-label={`${stepLabel} ${expanded ? "접기" : "편집"}`}
                              className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/70 active:cursor-grabbing"
                              onClick={() => setExpandedStepUid(expanded ? null : step.uid)}
                              onDragStart={() => setDraggedStep({ partyUid: party.uid, index: stepIndex })}
                              onDragEnd={() => setDraggedStep(null)}
                            >
                              <ChevronDownIcon
                                className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                              />
                              <span className="w-6 shrink-0 text-xs font-bold text-muted-foreground">
                                {stepIndex + 1}
                              </span>
                              {step.kind === "divider" ? (
                                <span className="flex min-w-0 flex-1 items-center gap-2">
                                  <span className="h-px flex-1 bg-border" />
                                  <span className="truncate text-xs font-semibold text-muted-foreground">
                                    {step.note || "구분선"}
                                  </span>
                                  <span className="h-px flex-1 bg-border" />
                                </span>
                              ) : (
                                <>
                                  <span className="w-24 shrink-0 truncate text-sm font-semibold text-primary tabular-nums sm:w-28">
                                    {step.marker?.value || "시점 없음"}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                    {step.actions
                                      .map((action) => actionSummaryLabel(action, studentsByUid))
                                      .join(" → ")}
                                  </span>
                                  {step.note?.trim() && (
                                    <span className="hidden max-w-40 truncate text-xs text-muted-foreground xl:block">
                                      {step.note}
                                    </span>
                                  )}
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={stepIndex === 0}
                              onClick={() =>
                                updateParty(partyIndex, (item) => ({
                                  ...item,
                                  steps: reorder(item.steps, stepIndex, stepIndex - 1).map((value, index) => ({
                                    ...value,
                                    order: index,
                                  })),
                                }))
                              }
                              aria-label={`${stepLabel} 위로 이동`}
                              className="rounded-md p-1.5 transition-opacity hover:bg-muted disabled:cursor-not-allowed disabled:opacity-20 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                            >
                              <ArrowUpIcon className="size-4" />
                            </button>
                            <button
                              type="button"
                              disabled={stepIndex === party.steps.length - 1}
                              onClick={() =>
                                updateParty(partyIndex, (item) => ({
                                  ...item,
                                  steps: reorder(item.steps, stepIndex, stepIndex + 1).map((value, index) => ({
                                    ...value,
                                    order: index,
                                  })),
                                }))
                              }
                              aria-label={`${stepLabel} 아래로 이동`}
                              className="rounded-md p-1.5 transition-opacity hover:bg-muted disabled:cursor-not-allowed disabled:opacity-20 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                            >
                              <ArrowDownIcon className="size-4" />
                            </button>
                            <button
                              type="button"
                              disabled={party.steps.length >= WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty}
                              onClick={() => {
                                const duplicatedStep = { ...structuredClone(step), uid: nanoid(8) };
                                updateParty(partyIndex, (item) => ({
                                  ...item,
                                  steps: [
                                    ...item.steps.slice(0, stepIndex + 1),
                                    duplicatedStep,
                                    ...item.steps.slice(stepIndex + 1),
                                  ]
                                    .slice(0, WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty)
                                    .map((value, index) => ({ ...value, order: index })),
                                }));
                                setExpandedStepUid(duplicatedStep.uid);
                              }}
                              aria-label={`${stepLabel} 복제`}
                              className="rounded-md p-1.5 transition-opacity hover:bg-muted disabled:cursor-not-allowed disabled:opacity-20 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                            >
                              <DocumentDuplicateIcon className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (expanded) setExpandedStepUid(null);
                                updateParty(partyIndex, (item) => ({
                                  ...item,
                                  steps: item.steps
                                    .filter((_, index) => index !== stepIndex)
                                    .map((value, index) => ({ ...value, order: index })),
                                }));
                              }}
                              aria-label={`${stepLabel} 삭제`}
                              className="rounded-md p-1.5 text-destructive transition-opacity hover:bg-destructive/10 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                            >
                              <TrashIcon className="size-4" />
                            </button>
                          </div>

                          {expanded && (
                            <div className="border-t border-border/70 p-3 md:p-4">
                              {step.kind === "divider" ? (
                                <label className="block text-sm font-semibold">
                                  구분선 제목
                                  <input
                                    value={step.note ?? ""}
                                    onChange={(event) =>
                                      updateParty(partyIndex, (item) => ({
                                        ...item,
                                        steps: item.steps.map((value, index) =>
                                          index === stepIndex ? { ...value, note: event.target.value } : value,
                                        ),
                                      }))
                                    }
                                    className="mt-2 min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    placeholder="2페이즈 진입"
                                  />
                                </label>
                              ) : (
                                <div className="space-y-3">
                                  <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                                    <label className="block text-sm font-semibold">
                                      시점
                                      <input
                                        value={step.marker?.value ?? ""}
                                        onChange={(event) =>
                                          updateParty(partyIndex, (item) => ({
                                            ...item,
                                            steps: item.steps.map((value, index) =>
                                              index === stepIndex
                                                ? {
                                                    ...value,
                                                    marker: {
                                                      kind: value.marker?.kind ?? "manual",
                                                      value: event.target.value,
                                                    },
                                                  }
                                                : value,
                                            ),
                                          }))
                                        }
                                        className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                                        placeholder="03:07.000"
                                      />
                                    </label>
                                    <label className="block text-sm font-semibold">
                                      메모
                                      <input
                                        value={step.note ?? ""}
                                        onChange={(event) =>
                                          updateParty(partyIndex, (item) => ({
                                            ...item,
                                            steps: item.steps.map((value, index) =>
                                              index === stepIndex ? { ...value, note: event.target.value } : value,
                                            ),
                                          }))
                                        }
                                        className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                                        placeholder="메모"
                                      />
                                    </label>
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-sm font-semibold">사용 스킬</p>
                                    {step.actions.map((action, actionIndex) => (
                                      <ActionEditor
                                        // Actions are ordered values in the document model and do not have individual UIDs.
                                        // biome-ignore lint/suspicious/noArrayIndexKey: duplicate actions must remain independently editable.
                                        key={`${step.uid}-${actionIndex}`}
                                        action={action}
                                        order={actionIndex + 1}
                                        selectedStudent={students.find((student) => student.uid === action.studentUid)}
                                        targetStudent={students.find(
                                          (student) => student.uid === action.targetStudentUid,
                                        )}
                                        students={party.units.flatMap((unit) => {
                                          const student = students.find(
                                            (candidate) => candidate.uid === unit.studentUid,
                                          );
                                          return student ? [student] : [];
                                        })}
                                        onChange={(next) =>
                                          updateParty(partyIndex, (item) => ({
                                            ...item,
                                            steps: item.steps.map((value, index) =>
                                              index === stepIndex
                                                ? {
                                                    ...value,
                                                    actions: value.actions.map((current, index) =>
                                                      index === actionIndex ? next : current,
                                                    ),
                                                  }
                                                : value,
                                            ),
                                          }))
                                        }
                                        onDelete={() =>
                                          updateParty(partyIndex, (item) => ({
                                            ...item,
                                            steps: item.steps.map((value, index) =>
                                              index === stepIndex
                                                ? {
                                                    ...value,
                                                    actions: value.actions.filter((_, index) => index !== actionIndex),
                                                  }
                                                : value,
                                            ),
                                          }))
                                        }
                                        onMoveUp={() =>
                                          updateParty(partyIndex, (item) => ({
                                            ...item,
                                            steps: item.steps.map((value, index) =>
                                              index === stepIndex
                                                ? {
                                                    ...value,
                                                    actions: reorder(value.actions, actionIndex, actionIndex - 1),
                                                  }
                                                : value,
                                            ),
                                          }))
                                        }
                                        onMoveDown={() =>
                                          updateParty(partyIndex, (item) => ({
                                            ...item,
                                            steps: item.steps.map((value, index) =>
                                              index === stepIndex
                                                ? {
                                                    ...value,
                                                    actions: reorder(value.actions, actionIndex, actionIndex + 1),
                                                  }
                                                : value,
                                            ),
                                          }))
                                        }
                                      />
                                    ))}
                                    <Button
                                      icon={PlusIcon}
                                      text="스킬 추가"
                                      size="sm"
                                      disabled={step.actions.length >= WALKTHROUGH_TIMELINE_LIMITS.actionsPerStep}
                                      onClick={() =>
                                        updateParty(partyIndex, (item) => ({
                                          ...item,
                                          steps: item.steps.map((value, index) =>
                                            index === stepIndex
                                              ? {
                                                  ...value,
                                                  kind: "actions",
                                                  actions: [
                                                    ...value.actions,
                                                    {
                                                      kind: "student_ex",
                                                      studentUid:
                                                        item.units.find((unit) => unit.studentUid)?.studentUid ?? "",
                                                    },
                                                  ],
                                                }
                                              : value,
                                          ),
                                        }))
                                      }
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      icon={PlusIcon}
                      text="단계 추가"
                      variant="primary"
                      disabled={party.steps.length >= WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty}
                      onClick={() => {
                        const nextStep = emptyStep(
                          party.steps.length,
                          party.units.find((unit) => unit.studentUid)?.studentUid ?? "",
                        );
                        updateParty(partyIndex, (item) => ({
                          ...item,
                          steps: [...item.steps, nextStep],
                        }));
                        setExpandedStepUid(nextStep.uid);
                      }}
                    />
                    <Button
                      icon={PlusIcon}
                      text="구분선 추가"
                      disabled={party.steps.length >= WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty}
                      onClick={() => {
                        const nextDivider = emptyDivider(party.steps.length);
                        updateParty(partyIndex, (item) => ({
                          ...item,
                          steps: [...item.steps, nextDivider],
                        }));
                        setExpandedStepUid(nextDivider.uid);
                      }}
                    />
                  </div>
                </section>
              </article>
            ) : null,
          )}
        </section>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}
      </Form>
    );
  },
);
