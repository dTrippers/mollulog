import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ChatBubbleOvalLeftIcon,
  ExclamationCircleIcon,
  PlusIcon,
} from "@heroicons/react/16/solid";
import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBlocker, useLocation, useNavigation, useSubmit } from "react-router";
import { type GuideBody, InvalidGuideBodyError, isGuideBodyEmpty, parseGuideBody } from "~/domain/guide-body";
import type { RaidRecordSnapshot } from "~/domain/raid-record";
import {
  isWalkthroughTimelineVisibility,
  parseWalkthroughTimelineDocument,
  resizeWalkthroughParty,
  type TimelineStep,
  WALKTHROUGH_TIMELINE_DIFFICULTIES,
  WALKTHROUGH_TIMELINE_LIMITS,
  type WalkthroughParty,
  type WalkthroughSaveProblem,
  walkthroughSaveProblemMessage,
  walkthroughSaveProblems,
  type WalkthroughTimelineDefenseType,
  type WalkthroughTimelineDocument,
  type WalkthroughTimelineTerrain,
  type WalkthroughTimelineVisibility,
} from "~/domain/walkthrough-timeline";
import type { ImportStudent } from "~/domain/walkthrough-timeline-import";
import { cn } from "~/lib/utils";
import { defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import { PageHeader } from "../../layout/PageHeader";
import { PageMain } from "../../layout/PageMain";
import { V2Page } from "../../layout/V2Page";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { Checkbox } from "../../primitives/Checkbox";
import { IconButton } from "../../primitives/IconButton";
import { Select } from "../../primitives/Select";
import { Skeleton } from "../../primitives/Skeleton";
import { StatusNotice } from "../../primitives/StatusNotice";
import { FeedbackSheet } from "../feedback/FeedbackSheet";
import type { RaidPartyEditorContext } from "../raid-records/RaidPartyEditor";
import type { GuideMentionContext } from "./GuideMentionChip";
import { WalkthroughBossSelect } from "./WalkthroughBossSelect";
import { WalkthroughPartyEditorCard } from "./WalkthroughPartyEditorCard";
import { WalkthroughTimelineSheet } from "./WalkthroughTimelineSheet";
import { emptyWalkthroughParty, renumberParties, type WalkthroughPartyBaselines } from "./walkthrough-editor-state";
import type { WalkthroughStudent } from "./walkthrough-parts";

const GuideBodyEditor = lazy(() => import("./GuideBodyEditor"));

// v1 drafts came from the 1.x editor and kept a plain-text description; v2 keeps the rich-text body.
const DRAFT_VERSION = 2;
const HISTORY_LIMIT = 50;
const TITLE_MAX_LENGTH = 100;

export type WalkthroughEditorStudent = WalkthroughStudent & ImportStudent;

export type WalkthroughEditorBoss = {
  uid: string;
  name: string;
  defenseTypes: WalkthroughTimelineDefenseType[];
  terrains: WalkthroughTimelineTerrain[];
  partySize: 6 | 10;
};

export type WalkthroughEditorValue = {
  title: string;
  body: GuideBody | null;
  visibility: WalkthroughTimelineVisibility;
  isAuto: boolean;
  document: WalkthroughTimelineDocument;
};

const VISIBILITY_OPTIONS: { value: WalkthroughTimelineVisibility; label: string }[] = [
  { value: "private", label: "나만 보기" },
  { value: "unlisted", label: "목록 미노출" },
  { value: "public", label: "전체 공개" },
];

function plainTextBody(text: string): GuideBody | null {
  const body: GuideBody = {
    type: "doc",
    content: text
      .split("\n")
      .map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
  };
  return isGuideBodyEmpty(body) ? null : body;
}

// Reads a saved draft back. A draft keeps what the save would still refuse, such as a step with no skill yet or a body
// over the limits, so the Sensei can finish it. A draft that no longer parses at all is dropped.
function readDraft(key: string, fallback: WalkthroughEditorValue): WalkthroughEditorValue | null {
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  const draft = JSON.parse(stored) as Record<string, unknown>;
  if (draft.version !== 1 && draft.version !== DRAFT_VERSION) return null;
  if (typeof draft.title !== "string" || !isWalkthroughTimelineVisibility(draft.visibility)) {
    throw new Error("invalid timeline draft");
  }
  const document = parseWalkthroughTimelineDocument(draft.document, { draft: true });
  const body =
    draft.version === 1
      ? typeof draft.description === "string"
        ? plainTextBody(draft.description)
        : fallback.body
      : parseGuideBody(draft.body, { limits: false });
  return {
    title: draft.title.slice(0, TITLE_MAX_LENGTH),
    body,
    visibility: draft.visibility,
    isAuto: typeof draft.isAuto === "boolean" ? draft.isAuto : fallback.isAuto,
    document,
  };
}

// The body editor loads as its own chunk. When it cannot load, only the body says so; the rest of the form still works,
// and the body already written stays in the draft.
class BodyEditorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <StatusNotice
        tone="danger"
        boxed
        action={
          <Button size="sm" onClick={() => window.location.reload()}>
            새로고침
          </Button>
        }
      >
        본문 편집기를 불러오지 못했어요.
      </StatusNotice>
    );
  }
}

function FieldMessage({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 flex items-start gap-1.5 text-xs text-v2-danger">
      <ExclamationCircleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span className="text-v2-fg">{message}</span>
    </p>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-xs font-medium text-v2-fg-secondary">
          {label}
        </label>
      ) : (
        <span className="text-xs font-medium text-v2-fg-secondary">{label}</span>
      )}
      {children}
    </div>
  );
}

// The write and edit page of a guide: 공략 정보, the parties with their timelines, and the body. Changes are kept as a
// draft in this browser until saved, and leaving with unsaved changes asks first. The save checks the same rules the
// server does and names the first problem.
export function WalkthroughEditorForm({
  pageTitle,
  initialValue,
  students,
  bosses,
  recruitedSnapshots,
  draftStorageKey,
  actionError,
}: {
  pageTitle: string;
  initialValue: WalkthroughEditorValue;
  students: readonly WalkthroughEditorStudent[];
  bosses: readonly WalkthroughEditorBoss[];
  recruitedSnapshots: Readonly<Record<string, RaidRecordSnapshot>>;
  draftStorageKey: string;
  actionError: string | null;
}) {
  const id = useId();
  const submit = useSubmit();
  const navigation = useNavigation();
  const editorPathname = useLocation().pathname;
  const [title, setTitle] = useState(initialValue.title);
  const [body, setBody] = useState<GuideBody | null>(initialValue.body);
  // The editor takes its content once; a restored draft remounts it with the draft's body.
  const [bodyRevision, setBodyRevision] = useState(0);
  const [visibility, setVisibility] = useState(initialValue.visibility);
  const [isAuto, setIsAuto] = useState(initialValue.isAuto);
  const [document, setDocument] = useState(initialValue.document);
  const [past, setPast] = useState<WalkthroughTimelineDocument[]>([]);
  const [future, setFuture] = useState<WalkthroughTimelineDocument[]>([]);
  const [baselines, setBaselines] = useState<Record<string, WalkthroughPartyBaselines>>({});
  const [timelinePartyUid, setTimelinePartyUid] = useState<string | null>(null);
  const [focusPartyUid, setFocusPartyUid] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [problems, setProblems] = useState<WalkthroughSaveProblem[]>([]);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const savingRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bossRef = useRef<HTMLDivElement>(null);
  const problemsRef = useRef<HTMLDivElement>(null);
  const bodyHeadingId = `${id}-body`;

  const studentsByUid = useMemo(
    () => new Map<string, WalkthroughStudent>(students.map((student) => [student.uid, student])),
    [students],
  );
  const partyContext: RaidPartyEditorContext = useMemo(
    () => ({ studentsByUid, pickableStudents: students, recruited: recruitedSnapshots }),
    [recruitedSnapshots, students, studentsByUid],
  );
  const mentionContext: GuideMentionContext = useMemo(
    () => ({ parties: document.parties, partySize: document.partySize, studentsByUid, partyHref: null }),
    [document.parties, document.partySize, studentsByUid],
  );
  const selectedBoss = bosses.find((boss) => boss.uid === document.context.bossUid) ?? null;

  // ---- Draft and leave guard ----------------------------------------------------------------------------------------
  const initialJson = useRef(JSON.stringify(initialValue));
  const current = useMemo(
    () => ({ title, body, visibility, isAuto, document }),
    [body, document, isAuto, title, visibility],
  );
  const hasChanges = JSON.stringify(current) !== initialJson.current;

  // The draft is read once, when the page opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initialValue is the loader value of this visit
  useEffect(() => {
    try {
      const draft = readDraft(draftStorageKey, initialValue);
      if (draft) {
        setTitle(draft.title);
        setBody(draft.body);
        setBodyRevision((revision) => revision + 1);
        setVisibility(draft.visibility);
        setIsAuto(draft.isAuto);
        setDocument(draft.document);
      }
    } catch {
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        // Storage can be unavailable; the editor still works without a draft.
      }
    } finally {
      setDraftReady(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (navigation.state === "idle") savingRef.current = false;
  }, [navigation.state]);

  // The draft stays while a save is in flight and goes only once the save has left this page for the guide. A save
  // that fails keeps the page, or shows the error screen on the same path, and the draft with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the cleanup runs once, when the editor unmounts
  useEffect(
    () => () => {
      if (!savingRef.current || window.location.pathname === editorPathname) return;
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        // Storage can be unavailable; there is no draft to clear then.
      }
    },
    [],
  );

  // A save that comes back to this page failed, so the draft it cleared is written again: the effect also runs when the
  // navigation turns idle.
  useEffect(() => {
    if (!draftReady || savingRef.current || navigation.state !== "idle") return;
    const timeout = window.setTimeout(() => {
      try {
        if (!hasChanges) localStorage.removeItem(draftStorageKey);
        else
          localStorage.setItem(
            draftStorageKey,
            JSON.stringify({ version: DRAFT_VERSION, savedAt: Date.now(), ...current }),
          );
      } catch {
        // Storage can be full or unavailable; the editor still works without a draft.
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [current, draftReady, draftStorageKey, hasChanges, navigation.state]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      draftReady && hasChanges && !savingRef.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("편집 중인 공략이 있어요. 페이지를 벗어나시겠어요?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!draftReady || !hasChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (savingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [draftReady, hasChanges]);

  // ---- Document history ---------------------------------------------------------------------------------------------
  const commit = useCallback((update: (value: WalkthroughTimelineDocument) => WalkthroughTimelineDocument) => {
    setDocument((value) => {
      const next = update(value);
      if (next === value) return value;
      setPast((history) => [...history.slice(-(HISTORY_LIMIT - 1)), value]);
      setFuture([]);
      return next;
    });
    setProblems([]);
  }, []);
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((history) => history.slice(0, -1));
    setFuture((history) => [document, ...history].slice(0, HISTORY_LIMIT));
    setDocument(previous);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((history) => history.slice(1));
    setPast((history) => [...history, document].slice(-HISTORY_LIMIT));
    setDocument(next);
  };

  const updateParty = (partyUid: string, update: (party: WalkthroughParty) => WalkthroughParty) =>
    commit((value) => ({
      ...value,
      parties: value.parties.map((party) => (party.uid === partyUid ? update(party) : party)),
    }));

  const addParty = () => {
    if (document.parties.length >= WALKTHROUGH_TIMELINE_LIMITS.parties) return;
    const party = emptyWalkthroughParty(document.parties.length);
    commit((value) => ({ ...value, parties: [...value.parties, party] }));
    setFocusPartyUid(party.uid);
  };

  const changeBoss = (bossUid: string) => {
    const boss = bosses.find((candidate) => candidate.uid === bossUid);
    if (!boss) return;
    commit((value) => {
      const defenseType = boss.defenseTypes.includes(value.context.defenseType)
        ? value.context.defenseType
        : boss.defenseTypes[0];
      const terrain = boss.terrains.includes(value.context.terrain) ? value.context.terrain : boss.terrains[0];
      if (!defenseType || !terrain) return value;
      return {
        ...value,
        partySize: boss.partySize,
        context: { ...value.context, bossUid: boss.uid, terrain, defenseType },
        parties: value.parties.map((party) => resizeWalkthroughParty(party, value.partySize, boss.partySize)),
      };
    });
  };

  // ---- Save ---------------------------------------------------------------------------------------------------------
  const titleProblem = problems.some((problem) => problem.field === "title");
  const bossProblem = problems.some((problem) => problem.field === "boss");
  const listedProblems = problems.filter((problem) => problem.field !== "title" && problem.field !== "boss");

  const save = () => {
    const found = walkthroughSaveProblems({ title, document });
    let normalizedBody: GuideBody | null;
    try {
      normalizedBody = parseGuideBody(body);
      setBodyError(null);
    } catch (error) {
      setBodyError(error instanceof InvalidGuideBodyError ? error.message : "본문에 지원하지 않는 형식이 있어요.");
      setProblems(found);
      return;
    }
    setProblems(found);
    const [first] = found;
    if (first) {
      if (first.field === "title") titleRef.current?.focus();
      else if (first.field === "boss") bossRef.current?.querySelector("button")?.focus();
      else problemsRef.current?.scrollIntoView({ block: "center" });
      return;
    }
    savingRef.current = true;
    try {
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({ version: DRAFT_VERSION, savedAt: Date.now(), ...current }),
      );
    } catch {
      // The save goes on without the draft storage.
    }
    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("visibility", visibility);
    formData.set("isAuto", String(isAuto));
    formData.set("document", JSON.stringify(document));
    formData.set("body", normalizedBody ? JSON.stringify(normalizedBody) : "");
    submit(formData, { method: "post" });
  };
  const saving = navigation.state !== "idle" && navigation.formMethod?.toLowerCase() === "post";

  const timelineParty = document.parties.find((party) => party.uid === timelinePartyUid) ?? null;
  const timelinePartyIndex = timelineParty ? document.parties.indexOf(timelineParty) : 0;

  const headerActions = (
    <div className="flex items-center gap-2">
      <IconButton icon={ArrowUturnLeftIcon} label="되돌리기" disabled={past.length === 0} onClick={undo} />
      <IconButton icon={ArrowUturnRightIcon} label="다시 실행" disabled={future.length === 0} onClick={redo} />
      <span className="flex-1 sm:hidden" />
      <Select label="공개 범위" value={visibility} options={VISIBILITY_OPTIONS} onChange={setVisibility} />
      <Button variant="primary" disabled={saving || !draftReady} onClick={save}>
        {saving ? "저장 중…" : "저장"}
      </Button>
    </div>
  );

  return (
    <V2Page width="wide">
      <PageHeader back={{ title: "공략/타임라인", to: "/timelines" }} title={pageTitle} trailing={headerActions} />
      <PageMain>
        <div className="flex flex-col gap-v2-section-gap">
          {actionError ? (
            <StatusNotice tone="danger" boxed>
              {actionError}
            </StatusNotice>
          ) : null}

          <section aria-labelledby={`${id}-info`} className="flex flex-col gap-3">
            <h2 id={`${id}-info`} className="text-base font-semibold text-v2-fg">
              공략 정보
            </h2>
            <div className="flex flex-col gap-4 rounded-lg bg-v2-surface p-v2-block-p">
              <Field label="제목" htmlFor={`${id}-title`}>
                <input
                  ref={titleRef}
                  id={`${id}-title`}
                  value={title}
                  maxLength={TITLE_MAX_LENGTH}
                  aria-invalid={titleProblem || undefined}
                  aria-describedby={titleProblem ? `${id}-title-error` : undefined}
                  onChange={(event) => {
                    setTitle(event.currentTarget.value);
                    setProblems((current) => current.filter((problem) => problem.field !== "title"));
                  }}
                  className={cn(
                    "h-7 w-full min-w-0 rounded-md border border-v2-control-border bg-v2-surface px-2.5 text-base text-v2-fg placeholder:text-v2-fg-tertiary sm:text-sm",
                    titleProblem && "border-v2-danger",
                    v2FocusRing,
                  )}
                />
                <FieldMessage
                  id={`${id}-title-error`}
                  message={titleProblem ? walkthroughSaveProblemMessage({ field: "title" }) : null}
                />
              </Field>
              <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
                <div ref={bossRef} className="col-span-2 min-w-0 sm:col-span-1">
                  <Field label="보스">
                    <WalkthroughBossSelect
                      value={document.context.bossUid}
                      options={bosses}
                      onChange={changeBoss}
                      invalid={bossProblem}
                      describedBy={bossProblem ? `${id}-boss-error` : undefined}
                    />
                    <FieldMessage
                      id={`${id}-boss-error`}
                      message={bossProblem ? walkthroughSaveProblemMessage({ field: "boss" }) : null}
                    />
                  </Field>
                </div>
                <Field label="지형">
                  <Select
                    label="지형"
                    value={document.context.terrain}
                    options={(selectedBoss?.terrains ?? [document.context.terrain]).map((terrain) => ({
                      value: terrain,
                      label: terrainLocale[terrain],
                    }))}
                    onChange={(terrain) => commit((value) => ({ ...value, context: { ...value.context, terrain } }))}
                    className="w-full [&_select]:w-full"
                  />
                </Field>
                <Field label="방어 타입">
                  <Select
                    label="방어 타입"
                    value={document.context.defenseType}
                    options={(selectedBoss?.defenseTypes ?? [document.context.defenseType]).map((defenseType) => ({
                      value: defenseType,
                      label: defenseTypeLocale[defenseType],
                    }))}
                    onChange={(defenseType) =>
                      commit((value) => ({ ...value, context: { ...value.context, defenseType } }))
                    }
                    className="w-full [&_select]:w-full"
                  />
                </Field>
                <Field label="난이도">
                  <Select
                    label="난이도"
                    value={document.context.maxDifficulty}
                    options={WALKTHROUGH_TIMELINE_DIFFICULTIES.map((difficulty) => ({
                      value: difficulty,
                      label: difficultyLocale[difficulty] ?? difficulty,
                    }))}
                    onChange={(maxDifficulty) =>
                      commit((value) => ({ ...value, context: { ...value.context, maxDifficulty } }))
                    }
                    className="w-full [&_select]:w-full"
                  />
                </Field>
              </div>
              <Checkbox id={`${id}-auto`} checked={isAuto} onCheckedChange={setIsAuto}>
                오토로 클리어하는 공략이에요
              </Checkbox>
            </div>
          </section>

          <section aria-labelledby={`${id}-parties`} className="flex flex-col gap-3">
            <h2 id={`${id}-parties`} className="text-base font-semibold text-v2-fg">
              편성
            </h2>
            {listedProblems.length > 0 ? (
              <div ref={problemsRef}>
                <StatusNotice tone="danger" boxed>
                  <ul className="flex flex-col gap-0.5">
                    {listedProblems.map((problem) => (
                      <li key={JSON.stringify(problem)}>{walkthroughSaveProblemMessage(problem)}</li>
                    ))}
                  </ul>
                </StatusNotice>
              </div>
            ) : null}
            {document.parties.map((party, partyIndex) => (
              <WalkthroughPartyEditorCard
                key={party.uid}
                party={party}
                partyIndex={partyIndex}
                partySize={document.partySize}
                context={partyContext}
                baselines={baselines[party.uid] ?? {}}
                focusSearch={focusPartyUid === party.uid}
                missingTier={problems.some(
                  (problem) =>
                    problem.field === "party" && problem.partyIndex === partyIndex && problem.reason === "no_tier",
                )}
                onSearchFocused={() => setFocusPartyUid(null)}
                onChange={(next, nextBaselines) => {
                  updateParty(party.uid, () => next);
                  if (nextBaselines) setBaselines((current) => ({ ...current, [party.uid]: nextBaselines }));
                }}
                onRemove={() =>
                  commit((value) => ({
                    ...value,
                    parties: renumberParties(value.parties.filter((current) => current.uid !== party.uid)),
                  }))
                }
                onEditTimeline={() => setTimelinePartyUid(party.uid)}
              />
            ))}
            <div>
              <Button disabled={document.parties.length >= WALKTHROUGH_TIMELINE_LIMITS.parties} onClick={addParty}>
                <PlusIcon className="size-4" aria-hidden="true" />
                파티 추가
              </Button>
            </div>
          </section>

          <section aria-labelledby={bodyHeadingId} className="flex flex-col gap-3">
            <h2 id={bodyHeadingId} className="text-base font-semibold text-v2-fg">
              본문
            </h2>
            {draftReady ? (
              <BodyEditorBoundary>
                <Suspense fallback={<Skeleton className="h-60 w-full rounded-lg" />}>
                  <GuideBodyEditor
                    key={bodyRevision}
                    initialValue={body}
                    context={mentionContext}
                    students={students}
                    labelledBy={bodyHeadingId}
                    onChange={(value) => {
                      setBody(isGuideBodyEmpty(value) ? null : value);
                      setBodyError(null);
                    }}
                  />
                </Suspense>
              </BodyEditorBoundary>
            ) : (
              <Skeleton className="h-60 w-full rounded-lg" />
            )}
            {bodyError ? <StatusNotice tone="danger">{bodyError}</StatusNotice> : null}
          </section>

          <div className="flex justify-end">
            <Button variant="text" size="sm" onClick={() => setFeedbackOpen(true)}>
              <ChatBubbleOvalLeftIcon className="size-4" aria-hidden="true" />
              의견/오류 제보
            </Button>
          </div>
        </div>
      </PageMain>
      <WalkthroughTimelineSheet
        open={timelineParty !== null}
        party={timelineParty}
        partyIndex={timelinePartyIndex}
        students={students}
        studentsByUid={studentsByUid}
        onChange={(steps: TimelineStep[]) => {
          if (timelineParty) updateParty(timelineParty.uid, (party) => ({ ...party, steps }));
        }}
        onClose={() => setTimelinePartyUid(null)}
      />
      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        featureName="공략/타임라인"
        feedbackType="walkthrough_timeline_feedback"
      />
    </V2Page>
  );
}
