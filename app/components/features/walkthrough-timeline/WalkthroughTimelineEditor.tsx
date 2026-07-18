import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { nanoid } from "nanoid/non-secure";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Form, useBlocker, useNavigation } from "react-router";
import { StudentCard } from "~/components/features/students";
import Button from "~/components/primitives/Button";
import Dropdown from "~/components/primitives/Dropdown";
import Field from "~/components/primitives/Field";
import Input from "~/components/primitives/Input";
import ProfileImage from "~/components/primitives/ProfileImage";
import SubTitle from "~/components/primitives/SubTitle";
import Textarea from "~/components/primitives/Textarea";
import {
  isWalkthroughTimelineVisibility,
  parseWalkthroughTimelineDocument,
  type TimelineAction,
  type TimelineStep,
  WALKTHROUGH_TIMELINE_DIFFICULTIES,
  WALKTHROUGH_TIMELINE_LIMITS,
  type WalkthroughParty,
  type WalkthroughTimelineDefenseType,
  type WalkthroughTimelineDocument,
  type WalkthroughTimelineTerrain,
  type WalkthroughTimelineVisibility,
  type WalkthroughUnit,
} from "~/domain/walkthrough-timeline";
import { extractCertainTimelineImport, type ImportStudent } from "~/domain/walkthrough-timeline-import";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import WalkthroughBossSelect from "./WalkthroughBossSelect";
import WalkthroughPartyFormationEditor, {
  resizeWalkthroughParty,
  WalkthroughPartyGrowthEditor,
} from "./WalkthroughPartyFormationEditor";

type BossOption = {
  uid: string;
  name: string;
  defenseTypes: WalkthroughTimelineDefenseType[];
  terrains: WalkthroughTimelineTerrain[];
  partySize: 6 | 10;
};

type EditorProps = {
  initialTitle: string;
  initialDescription: string;
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
  deleteParty: (partyIndex: number) => void;
  save: () => void;
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

function actionHasPartyValidationError(action: TimelineAction, party: WalkthroughParty) {
  const partyStudentUids = new Set(party.units.flatMap((unit) => (unit.studentUid ? [unit.studentUid] : [])));
  const studentUid = action.studentUid;
  const targetStudentUid = action.targetStudentUid;
  return (
    (studentUid ? !partyStudentUids.has(studentUid) : false) ||
    (targetStudentUid ? !partyStudentUids.has(targetStudentUid) : false)
  );
}

const WALKTHROUGH_TIMELINE_DRAFT_VERSION = 1;

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
  canMoveUp,
  canMoveDown,
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
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [targetEnabled, setTargetEnabled] = useState(Boolean(action.targetStudentUid));
  const selectedStudentIsOutsideParty =
    Boolean(action.studentUid) && !students.some((student) => student.uid === action.studentUid);
  const targetStudentIsOutsideParty =
    Boolean(action.targetStudentUid) && !students.some((student) => student.uid === action.targetStudentUid);
  const visibleStudents = selectedStudentIsOutsideParty && selectedStudent ? [selectedStudent, ...students] : students;
  const visibleTargetStudents = targetStudentIsOutsideParty && targetStudent ? [targetStudent, ...students] : students;

  useEffect(() => {
    setTargetEnabled(Boolean(action.targetStudentUid));
  }, [action.targetStudentUid]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center text-sm font-semibold text-muted-foreground">
          {order}
        </span>
        <fieldset className="shrink-0">
          <legend className="sr-only">사용할 학생</legend>
          <div className="flex flex-wrap gap-1">
            {visibleStudents.map((student) => {
              const selected = action.studentUid === student.uid;
              const outsideParty = selectedStudentIsOutsideParty && student.uid === selectedStudent?.uid;
              return (
                <button
                  key={student.uid}
                  type="button"
                  aria-label={`${student.name} EX 스킬 사용`}
                  aria-pressed={selected}
                  className={`size-9 shrink-0 overflow-hidden rounded-md p-0.5 outline-none transition ${
                    selected
                      ? outsideParty
                        ? "bg-amber-500/10 ring-2 ring-amber-500"
                        : "bg-primary/10 ring-2 ring-primary"
                      : "opacity-40 grayscale transition-[filter,opacity] hover:bg-muted hover:opacity-80 hover:grayscale-0"
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
        <input
          aria-label="세부 내용"
          className="h-9 min-w-36 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          value={action.text ?? ""}
          onChange={(event) => onChange({ ...action, text: event.target.value })}
          placeholder="세부 내용"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
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
            대상 학생 설정
          </label>
          {targetEnabled && (
            <fieldset className="flex min-w-0 flex-wrap items-center gap-1 border-l border-border pl-2">
              <legend className="sr-only">대상 학생</legend>
              <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">대상</span>
              {visibleTargetStudents.map((student) => {
                const selected = action.targetStudentUid === student.uid;
                const outsideParty = targetStudentIsOutsideParty && student.uid === targetStudent?.uid;
                return (
                  <button
                    key={student.uid}
                    type="button"
                    aria-label={`${student.name} 대상 지정`}
                    aria-pressed={selected}
                    className={`size-8 shrink-0 overflow-hidden rounded-full p-0.5 outline-none transition ${
                      selected
                        ? outsideParty
                          ? "bg-amber-500/10 ring-2 ring-amber-500"
                          : "bg-primary/10 ring-2 ring-primary"
                        : "opacity-40 grayscale transition-[filter,opacity] hover:bg-muted hover:opacity-80 hover:grayscale-0"
                    }`}
                    onClick={() => onChange({ ...action, targetStudentUid: student.uid })}
                  >
                    <StudentCard uid={student.uid} name={student.name} role={student.role} hideName circular flush />
                  </button>
                );
              })}
            </fieldset>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="스킬 위로 이동"
          >
            <ArrowUpIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
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
      {selectedStudentIsOutsideParty && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="size-4 shrink-0" />
          {selectedStudent?.name ?? "선택한 학생"}은(는) 현재 편성에 없어요.
        </p>
      )}
      {targetStudentIsOutsideParty && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <ExclamationTriangleIcon className="size-4 shrink-0" />
          대상 {targetStudent?.name ?? "학생"}은(는) 현재 편성에 없어요.
        </p>
      )}
    </div>
  );
}

function ActionSummaryTag({
  action,
  studentsByUid,
  invalid = false,
}: {
  action: TimelineAction;
  studentsByUid: Map<string, ImportStudent>;
  invalid?: boolean;
}) {
  if (!action.studentUid) {
    return (
      <span
        className={`inline-flex min-h-7 max-w-full items-center rounded-md border px-2 py-1 text-xs ${
          invalid ? "border-amber-500/70 bg-amber-500/10" : "border-border bg-background/70"
        }`}
      >
        <span className="truncate">{action.text || "내용 확인 필요"}</span>
        {invalid ? <ExclamationTriangleIcon className="ml-1 size-3.5 shrink-0 text-amber-500" /> : null}
      </span>
    );
  }
  const student = studentsByUid.get(action.studentUid);
  const target = action.targetStudentUid ? studentsByUid.get(action.targetStudentUid) : undefined;
  return (
    <span
      className={`inline-flex min-h-7 max-w-full items-center gap-1 rounded-md border px-1.5 py-1 text-xs ${
        invalid ? "border-amber-500/70 bg-amber-500/10" : "border-border bg-background/70"
      }`}
    >
      {student ? <ProfileImage studentUid={student.uid} imageSize={6} /> : null}
      <span className="max-w-28 truncate font-medium">
        {action.copied ? "C" : ""}
        {student?.name ?? "학생 확인 필요"}
      </span>
      {target ? (
        <span className="inline-flex min-w-0 items-center gap-1 border-l border-border pl-1 text-muted-foreground">
          <span>대상</span>
          <ProfileImage studentUid={target.uid} imageSize={6} />
          <span className="max-w-24 truncate">{target.name}</span>
        </span>
      ) : null}
      {action.text ? <span className="max-w-36 truncate text-muted-foreground">· {action.text}</span> : null}
      {invalid ? <ExclamationTriangleIcon className="size-3.5 shrink-0 text-amber-500" /> : null}
    </span>
  );
}

export const WalkthroughTimelineEditor = forwardRef<WalkthroughTimelineEditorHandle, EditorProps>(
  function WalkthroughTimelineEditor(
    {
      initialTitle,
      initialDescription,
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
    const [description, setDescription] = useState(initialDescription);
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
    const formRef = useRef<HTMLFormElement>(null);
    const isSavingRef = useRef(false);
    const initialStateRef = useRef(
      JSON.stringify({
        title: initialTitle,
        description: initialDescription,
        visibility: initialVisibility,
        document: initialDocument,
        importText: "",
      }),
    );
    const studentsByUid = useMemo(() => new Map(students.map((student) => [student.uid, student])), [students]);
    const importDraft = useMemo(() => extractCertainTimelineImport(importText, students), [importText, students]);
    const currentState = useMemo(
      () => ({ title, description, visibility, document, importText }),
      [description, document, importText, title, visibility],
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
            description?: unknown;
            visibility?: unknown;
            document?: unknown;
            importText?: unknown;
          };
          if (draft.version === WALKTHROUGH_TIMELINE_DRAFT_VERSION) {
            const restoredDocument = parseWalkthroughTimelineDocument(draft.document);
            if (typeof draft.title !== "string" || !isWalkthroughTimelineVisibility(draft.visibility)) {
              throw new Error("invalid timeline draft");
            }
            setTitle(draft.title.slice(0, 100));
            setDescription(typeof draft.description === "string" ? draft.description : initialDescription);
            setVisibility(draft.visibility);
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
    }, [draftStorageKey, initialDescription]);

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

    const insertActionStepAfter = (partyIndex: number, stepIndex: number) => {
      const party = document.parties[partyIndex];
      if (!party || party.steps.length >= WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty) return;
      const nextStep = emptyStep(stepIndex + 1);
      updateParty(partyIndex, (currentParty) => ({
        ...currentParty,
        steps: [
          ...currentParty.steps.slice(0, stepIndex + 1),
          nextStep,
          ...currentParty.steps.slice(stepIndex + 1),
        ].map((step, index) => ({ ...step, order: index })),
      }));
      setExpandedStepUid(nextStep.uid);
    };

    const addParty = () => {
      if (document.parties.length >= WALKTHROUGH_TIMELINE_LIMITS.parties) return;
      const nextPartyIndex = document.parties.length;
      commit((current) => ({ ...current, parties: [...current.parties, emptyParty(current.parties.length)] }));
      onActivePartyIndexChange(nextPartyIndex);
    };

    const deleteParty = (partyIndex: number) => {
      if (!document.parties[partyIndex]) return;
      const nextPartyIndex =
        partyIndex < activePartyIndex
          ? activePartyIndex - 1
          : partyIndex === activePartyIndex
            ? Math.min(activePartyIndex, Math.max(document.parties.length - 2, 0))
            : activePartyIndex;
      commit((current) => ({
        ...current,
        parties: current.parties
          .filter((_, index) => index !== partyIndex)
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
      deleteParty,
      save: () => formRef.current?.requestSubmit(),
      undo,
      redo,
    }));

    const selectedBoss = bosses.find((boss) => boss.uid === document.context.bossUid);
    return (
      <Form
        ref={formRef}
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
        <section className="space-y-3">
          <h2 className="text-lg font-bold">공략 정보</h2>
          <div className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(12rem,1fr)]">
                <Input
                  name="title"
                  label="제목"
                  value={title}
                  onChange={setTitle}
                  required
                  maxLength={100}
                  className="max-w-none"
                />
                <Field label="공개 범위" htmlFor="visibility">
                  <select
                    id="visibility"
                    name="visibility"
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value as WalkthroughTimelineVisibility)}
                    className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="private">나만 보기</option>
                    <option value="unlisted">목록 미노출</option>
                    <option value="public">전체 공개</option>
                  </select>
                </Field>
              </div>

              <Textarea
                name="description"
                label="공략 설명"
                value={description}
                onChange={setDescription}
                rows={5}
                placeholder="공략의 특징이나 주의사항을 입력해주세요."
              />

              <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
                <Field label="보스">
                  <WalkthroughBossSelect
                    value={document.context.bossUid}
                    options={bosses}
                    onChange={(bossUid) => {
                      const boss = bosses.find((candidate) => candidate.uid === bossUid);
                      if (!boss) return;
                      const defenseType = boss.defenseTypes.includes(document.context.defenseType)
                        ? document.context.defenseType
                        : boss.defenseTypes[0];
                      const terrain = boss.terrains.includes(document.context.terrain)
                        ? document.context.terrain
                        : boss.terrains[0];
                      if (!defenseType || !terrain) return;
                      commit((current) => ({
                        ...current,
                        partySize: boss.partySize,
                        context: {
                          ...current.context,
                          bossUid: boss.uid,
                          terrain,
                          defenseType,
                        },
                        parties: current.parties.map((party) =>
                          resizeWalkthroughParty(party, current.partySize, boss.partySize),
                        ),
                      }));
                    }}
                  />
                </Field>
                <Field label="지형" htmlFor="terrain">
                  <select
                    id="terrain"
                    value={document.context.terrain}
                    className="min-h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    onChange={(event) =>
                      commit((current) => ({
                        ...current,
                        context: {
                          ...current.context,
                          terrain: event.target.value as WalkthroughTimelineTerrain,
                        },
                      }))
                    }
                  >
                    {selectedBoss?.terrains.map((terrain) => (
                      <option key={terrain} value={terrain}>
                        {terrainLocale[terrain]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="방어 타입">
                  <Dropdown
                    value={document.context.defenseType}
                    options={(selectedBoss?.defenseTypes ?? []).map((defenseType) => ({
                      value: defenseType,
                      label: defenseTypeLocale[defenseType],
                      color: defenseTypeColor[defenseType],
                    }))}
                    size="md"
                    fullWidth
                    onChange={(defenseType) =>
                      commit((current) => ({
                        ...current,
                        context: { ...current.context, defenseType },
                      }))
                    }
                  />
                </Field>
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
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-5 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">편성 정보</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {activePartyIndex + 1}번째 파티에 편성할 학생을 선택해주세요.
              </p>
            </div>
          </div>

          {document.parties.map((party, partyIndex) =>
            partyIndex === activePartyIndex ? (
              <article key={party.uid} className="space-y-5">
                <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
                  <WalkthroughPartyFormationEditor
                    party={party}
                    partySize={document.partySize}
                    students={students}
                    recruitedSnapshots={recruitedSnapshots}
                    onChange={(next) => updateParty(partyIndex, () => next)}
                  />
                </section>
                <section className="space-y-3 pt-5">
                  <div>
                    <h3 className="text-lg font-bold">학생 성장도</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      이 공략에 사용된 학생 성장도를 입력해주세요. 성급 외의 능력치는 입력하지 않아도 저장할 수 있어요.
                    </p>
                  </div>
                  <div className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
                    <WalkthroughPartyGrowthEditor
                      party={party}
                      students={students}
                      onChange={(next) => updateParty(partyIndex, () => next)}
                    />
                  </div>
                </section>
                <section className="pt-5">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <SubTitle text="타임라인 정보" />
                    <div className="pb-3">
                      {party.steps.length === 0 ? (
                        <Button
                          text="텍스트에서 가져오기"
                          icon={DocumentArrowDownIcon}
                          variant="secondary"
                          size="sm"
                          pressed={showImporter}
                          onClick={() => setShowImporter((current) => !current)}
                        />
                      ) : (
                        <Button
                          text="전체 초기화"
                          icon={TrashIcon}
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            updateParty(partyIndex, (currentParty) => ({ ...currentParty, steps: [] }));
                            setExpandedStepUid(null);
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
                    {party.steps.length === 0 && showImporter && (
                      <div className="rounded-lg border border-border p-4">
                        <Textarea
                          aria-label="커뮤니티 공략 글"
                          value={importText}
                          onChange={setImportText}
                          rows={7}
                          className="font-mono"
                          placeholder="커뮤니티의 공략 글을 붙여넣어주세요."
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <Button text="취소" size="sm" onClick={() => setShowImporter(false)} />
                          <Button
                            text={`${importDraft.steps.length}개 단계 추가`}
                            variant="primary"
                            size="sm"
                            disabled={importDraft.steps.length === 0}
                            onClick={() => {
                              updateParty(activePartyIndex, (currentParty) => ({
                                ...currentParty,
                                steps: importDraft.steps
                                  .slice(0, WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty)
                                  .map((step, index) => ({ ...step.parsed, order: index })),
                              }));
                              setExpandedStepUid(null);
                              setImportText("");
                              setShowImporter(false);
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <ol className="mt-4 list-none space-y-1.5" aria-label={`파티 ${partyIndex + 1} 단계`}>
                      {party.steps.map((step, stepIndex) => {
                        const expanded = expandedStepUid === step.uid;
                        const stepLabel = step.kind === "divider" ? `설명글 ${stepIndex + 1}` : `단계 ${stepIndex + 1}`;
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
                            <div className="flex items-center gap-0.5 px-2 py-2">
                              <button
                                type="button"
                                draggable
                                aria-expanded={expanded}
                                aria-label={`${stepLabel} ${expanded ? "접기" : "편집"}`}
                                className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-muted/70 active:cursor-grabbing"
                                onClick={() => setExpandedStepUid(expanded ? null : step.uid)}
                                onKeyDown={(event) => {
                                  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                                  event.preventDefault();
                                  const nextIndex = event.key === "ArrowUp" ? stepIndex - 1 : stepIndex + 1;
                                  updateParty(partyIndex, (item) => ({
                                    ...item,
                                    steps: reorder(item.steps, stepIndex, nextIndex).map((value, index) => ({
                                      ...value,
                                      order: index,
                                    })),
                                  }));
                                }}
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
                                      {step.note || "설명글"}
                                    </span>
                                    <span className="h-px flex-1 bg-border" />
                                  </span>
                                ) : (
                                  <>
                                    <span
                                      className={`w-24 shrink-0 truncate text-sm font-semibold tabular-nums sm:w-28 ${
                                        step.marker?.value ? "text-primary" : "text-muted-foreground/60"
                                      }`}
                                    >
                                      {step.marker?.value || "시점 입력"}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="flex min-w-0 flex-wrap items-center gap-1">
                                        {step.actions.map((action, actionIndex) => (
                                          <span
                                            // Actions have no identity beyond their persisted order within the step.
                                            // biome-ignore lint/suspicious/noArrayIndexKey: duplicate actions must remain visible in source order.
                                            key={`${step.uid}-summary-action-${actionIndex}`}
                                            className="inline-flex min-w-0 items-center gap-1"
                                          >
                                            {actionIndex > 0 ? (
                                              <span className="text-xs text-muted-foreground">→</span>
                                            ) : null}
                                            <ActionSummaryTag
                                              action={action}
                                              studentsByUid={studentsByUid}
                                              invalid={actionHasPartyValidationError(action, party)}
                                            />
                                          </span>
                                        ))}
                                      </span>
                                      {step.sourceText?.trim() ? (
                                        <span
                                          className="mt-1 block truncate text-[11px] leading-tight text-muted-foreground/70"
                                          title={step.sourceText}
                                        >
                                          {step.sourceText}
                                        </span>
                                      ) : null}
                                    </span>
                                    {step.note?.trim() && (
                                      <span className="hidden max-w-40 truncate text-xs text-muted-foreground xl:block">
                                        {step.note}
                                      </span>
                                    )}
                                  </>
                                )}
                              </button>
                              {stepIndex > 0 && (
                                <button
                                  type="button"
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
                                  className={`rounded-md p-1.5 transition-opacity hover:bg-muted ${
                                    expanded
                                      ? "opacity-100"
                                      : "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                                  }`}
                                >
                                  <ArrowUpIcon className="size-4" />
                                </button>
                              )}
                              {stepIndex < party.steps.length - 1 && (
                                <button
                                  type="button"
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
                                  className={`rounded-md p-1.5 transition-opacity hover:bg-muted ${
                                    expanded
                                      ? "opacity-100"
                                      : "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                                  }`}
                                >
                                  <ArrowDownIcon className="size-4" />
                                </button>
                              )}
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
                                className={`rounded-md p-1.5 text-destructive transition-opacity hover:bg-destructive/10 ${
                                  expanded
                                    ? "opacity-100"
                                    : "md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
                                }`}
                              >
                                <TrashIcon className="size-4" />
                              </button>
                            </div>

                            {expanded && (
                              <div className="border-t border-border/70 p-3 md:p-4">
                                {step.kind === "divider" ? (
                                  <label className="block text-sm font-semibold">
                                    설명글
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
                                    <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
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
                                          onKeyDown={(event) => {
                                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                              event.preventDefault();
                                              insertActionStepAfter(partyIndex, stepIndex);
                                            }
                                          }}
                                          className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                                          placeholder="3:07.0 · 9코 · 즉시"
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
                                          onKeyDown={(event) => {
                                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                              event.preventDefault();
                                              insertActionStepAfter(partyIndex, stepIndex);
                                            }
                                          }}
                                          className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-normal"
                                          placeholder="메모"
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        disabled={party.steps.length >= WALKTHROUGH_TIMELINE_LIMITS.stepsPerParty}
                                        onClick={() => insertActionStepAfter(partyIndex, stepIndex)}
                                        className="flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                                      >
                                        <PlusIcon className="size-4" />
                                        다음 단계
                                      </button>
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-sm font-semibold">사용 스킬</p>
                                        {step.actions.length === 1 && step.actions[0]?.kind === "free_text" ? (
                                          <Button
                                            text="설명글로 변경"
                                            variant="secondary"
                                            size="xs"
                                            onClick={() =>
                                              updateParty(partyIndex, (item) => ({
                                                ...item,
                                                steps: item.steps.map((value, index) =>
                                                  index === stepIndex
                                                    ? {
                                                        ...value,
                                                        kind: "divider",
                                                        marker: undefined,
                                                        actions: [],
                                                        note:
                                                          value.actions[0]?.text?.trim() ||
                                                          value.sourceText?.trim() ||
                                                          value.note ||
                                                          "설명글",
                                                      }
                                                    : value,
                                                ),
                                              }))
                                            }
                                          />
                                        ) : null}
                                      </div>
                                      {step.actions.length > 0 ? (
                                        <div className="divide-y divide-border/70">
                                          {step.actions.map((action, actionIndex) => {
                                            const invalid = actionHasPartyValidationError(action, party);
                                            return (
                                              <div
                                                // Actions have no identity beyond their persisted order within the step.
                                                // biome-ignore lint/suspicious/noArrayIndexKey: duplicate actions must remain independently editable.
                                                key={`${step.uid}-action-editor-${actionIndex}`}
                                                aria-invalid={invalid || undefined}
                                                className={`py-2 first:pt-0 last:pb-0 ${
                                                  invalid ? "rounded-md bg-amber-500/5 px-2" : ""
                                                }`}
                                              >
                                                <ActionEditor
                                                  action={action}
                                                  order={actionIndex + 1}
                                                  canMoveUp={actionIndex > 0}
                                                  canMoveDown={actionIndex < step.actions.length - 1}
                                                  selectedStudent={students.find(
                                                    (student) => student.uid === action.studentUid,
                                                  )}
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
                                                              actions: value.actions.filter(
                                                                (_, index) => index !== actionIndex,
                                                              ),
                                                            }
                                                          : value,
                                                      ),
                                                    }))
                                                  }
                                                  onMoveUp={() => {
                                                    if (actionIndex <= 0) return;
                                                    updateParty(partyIndex, (item) => ({
                                                      ...item,
                                                      steps: item.steps.map((value, index) =>
                                                        index === stepIndex
                                                          ? {
                                                              ...value,
                                                              actions: reorder(
                                                                value.actions,
                                                                actionIndex,
                                                                actionIndex - 1,
                                                              ),
                                                            }
                                                          : value,
                                                      ),
                                                    }));
                                                  }}
                                                  onMoveDown={() => {
                                                    if (actionIndex >= step.actions.length - 1) return;
                                                    updateParty(partyIndex, (item) => ({
                                                      ...item,
                                                      steps: item.steps.map((value, index) =>
                                                        index === stepIndex
                                                          ? {
                                                              ...value,
                                                              actions: reorder(
                                                                value.actions,
                                                                actionIndex,
                                                                actionIndex + 1,
                                                              ),
                                                            }
                                                          : value,
                                                      ),
                                                    }));
                                                  }}
                                                />
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                                          스킬을 추가해주세요.
                                        </div>
                                      )}
                                      <Button
                                        icon={PlusIcon}
                                        text="스킬 추가"
                                        size="sm"
                                        disabled={
                                          step.actions.length >= WALKTHROUGH_TIMELINE_LIMITS.actionsPerStep ||
                                          party.units.every((unit) => !unit.studentUid)
                                        }
                                        onClick={() => {
                                          const onlyAction = step.actions[0];
                                          const reuseEmptyAction =
                                            step.actions.length === 1 &&
                                            !onlyAction?.studentUid &&
                                            !onlyAction?.text?.trim();
                                          if (reuseEmptyAction) return;
                                          updateParty(partyIndex, (item) => ({
                                            ...item,
                                            steps: item.steps.map((value, index) =>
                                              index === stepIndex
                                                ? {
                                                    ...value,
                                                    kind: "actions",
                                                    actions: [
                                                      ...value.actions,
                                                      { kind: "student_ex" as const, studentUid: "" },
                                                    ],
                                                  }
                                                : value,
                                            ),
                                          }));
                                        }}
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
                        onClick={() => insertActionStepAfter(partyIndex, party.steps.length - 1)}
                      />
                      <Button
                        icon={PlusIcon}
                        text="설명글 추가"
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
