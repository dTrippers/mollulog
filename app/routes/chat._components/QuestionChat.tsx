import {
  ArrowPathIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  UserCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigation } from "react-router";
import StudentPortrait from "~/components/v2/features/students/StudentPortrait";
import { useV2Page } from "~/components/v2/layout";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { Dialog } from "~/components/v2/primitives/Dialog";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { Popover } from "~/components/v2/primitives/Popover";
import { Switch } from "~/components/v2/primitives/Switch";
import { useImageFailure } from "~/components/v2/primitives/use-image-failure";
import {
  type ChatErrorCode,
  type ChatMessage,
  type ChatProgressStep,
  isChatMessageInterrupted,
} from "~/domain/chat-conversation";
import type { AnswerSource, QuestionRunEvent, QuestionRunResult, SourceKind } from "~/models/al1s-question-contract";
import { bossImageUrl } from "~/models/assets";
import {
  applyChatProgressEvent,
  canApplyChatResponse,
  type LiveChatProgress,
  reconcileChatTurns,
  settledChatTurnState,
} from "./chat-ui-state";

export type ChatAskHandlers = {
  onStarted: (started: { conversationUid: string; messageUid: string }) => void;
  onEvent: (event: QuestionRunEvent) => void;
};

export type QuestionChatActionResult =
  | { ok: true; result: QuestionRunResult; conversationUid: string; messageUid: string }
  | { ok: false; code: ChatErrorCode; conversationUid?: string; messageUid?: string };

export type QuestionTurn = {
  id: string;
  question: string;
  personalMode: boolean;
  // Set once the server has stored the turn, so that a retry asks the stored message again.
  messageUid?: string;
  result?: Pick<
    Extract<QuestionRunResult, { status: "answered" | "needs_clarification" | "insufficient_evidence" }>,
    "status" | "answer"
  >;
  failure?: ChatErrorCode;
  pending?: boolean;
  waitingLonger?: boolean;
  interrupted?: boolean;
  localInFlight?: boolean;
  progress?: ChatProgressStep[];
  activeProgressIds?: string[];
};

export type ChatInput = {
  question: string;
  personalMode: boolean;
  conversationUid: string | null;
  retryMessageUid?: string;
};

type QuestionChatProps = {
  isSignedIn: boolean;
  initialConsent: boolean;
  consentUnavailable: boolean;
  onConsent: (consented: boolean) => Promise<boolean>;
  onAsk: (input: ChatInput, handlers: ChatAskHandlers) => Promise<QuestionChatActionResult>;
  initialConversationUid: string | null;
  initialMessages: ChatMessage[];
  liveProgress?: LiveChatProgress & { messageUid: string; outcome?: QuestionChatActionResult };
  loadedAt: Date;
  onConversationUid: (uid: string) => void;
};

const ERROR_COPY: Record<ChatErrorCode | "question_too_long", string> = {
  rate_limited: "짧은 시간에 질문이 많았어요. 잠시 후 다시 시도해 주세요.",
  service_unavailable: "지금은 AI 챗봇을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  provider_failure: "지금은 AI 챗봇을 사용할 수 없어요. 잠시 후 다시 시도해 주세요.",
  timeout: "답변하는 데 시간이 너무 오래 걸렸어요. 질문을 더 구체적으로 바꿔서 다시 시도해 주세요.",
  internal_error: "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
  validation_failed: "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
  budget_exhausted: "한 번에 답하기 어려운 질문이에요. 여러 질문으로 나눠서 물어봐 주세요.",
  invalid_request: "이 질문은 처리할 수 없어요. 내용을 줄이거나 바꿔서 다시 보내 주세요.",
  member_data_unavailable:
    "내 데이터를 불러오지 못해 답하지 못했어요. 잠시 후 다시 시도하거나, ‘내 데이터 함께 보내기’를 끄고 질문해 주세요. 끄면 동의도 취소돼요.",
  snapshot_too_large:
    "내 데이터가 너무 많아 함께 보낼 수 없어요. ‘내 데이터 함께 보내기’를 끄고 질문해 주세요. 끄면 동의도 취소돼요.",
  session_expired: "로그인이 만료됐어요. 다시 로그인한 뒤 질문해 주세요.",
  consent_required: "‘내 데이터 함께 보내기’에 대한 동의가 취소된 상태예요. 다시 켜서 동의한 뒤 질문해 주세요.",
  conversation_not_found: "대화를 찾을 수 없어요. 새 대화에서 다시 질문해 주세요.",
  conversation_busy: "이전 질문에 대한 답변을 기다리고 있어요. 답변이 끝난 뒤 다시 보내 주세요.",
  network: "연결에 문제가 있어 답변을 받지 못했어요. 다시 시도해 주세요.",
  question_too_long: "질문이 너무 길어요. 줄여서 보내 주세요.",
};

const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  knowledge: "게임 용어·규칙",
  student: "학생 정보",
  schedule: "일정",
  raid_stats: "총력전·대결전 통계",
  member: "내 데이터",
};

const PROGRESS_TOOL_LABELS: Record<string, { working: string; complete: string }> = {
  get_schedule: { working: "일정 확인 중", complete: "일정 확인" },
  find_students: { working: "학생 찾는 중", complete: "학생 찾기" },
  get_student: { working: "학생 정보 확인 중", complete: "학생 정보 확인" },
  get_raid_stats: { working: "통계 확인 중", complete: "통계 확인" },
  search_knowledge: { working: "자료 찾는 중", complete: "자료 찾기" },
  get_knowledge: { working: "자료 확인 중", complete: "자료 확인" },
  get_my_data: { working: "내 데이터 확인 중", complete: "내 데이터 확인" },
  get_content: { working: "콘텐츠 정보 확인 중", complete: "콘텐츠 정보 확인" },
};

function ProgressStepRow({ step, active }: { step: ChatProgressStep; active: boolean }) {
  const imageSrc = step.subject?.type === "raid_boss" ? bossImageUrl(step.subject.boss) : null;
  const image = useImageFailure(imageSrc);
  const label = PROGRESS_TOOL_LABELS[step.toolName];
  if (!label) return null;
  return (
    <li className={`flex items-center gap-2 text-sm leading-5 ${active ? "text-v2-fg" : "text-v2-fg-secondary"}`}>
      {active ? (
        <ArrowPathIcon className="size-4 shrink-0 animate-spin text-v2-fg-secondary" aria-hidden="true" />
      ) : step.ok ? (
        <CheckIcon className="size-4 shrink-0 text-v2-success" aria-hidden="true" />
      ) : (
        <XMarkIcon className="size-4 shrink-0 text-v2-danger" aria-hidden="true" />
      )}
      <span>{active ? label.working : label.complete}</span>
      {step.target ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-v2-fg">
          {step.subject?.type === "student" ? (
            <StudentPortrait uid={step.subject.uid} className="size-5 shrink-0 rounded-full object-cover" />
          ) : imageSrc && !image.failed ? (
            <img
              ref={image.ref}
              src={imageSrc}
              onError={image.onError}
              onLoad={image.onLoad}
              alt=""
              className="size-5 shrink-0 rounded-full object-cover"
            />
          ) : null}
          <span className="truncate">{step.target}</span>
        </span>
      ) : null}
    </li>
  );
}

function ProgressDisclosure({
  steps,
  activeProgressIds = [],
  live = false,
}: {
  steps: ChatProgressStep[];
  activeProgressIds?: string[];
  live?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = steps.filter((step) => PROGRESS_TOOL_LABELS[step.toolName]);
  if (visible.length === 0) return null;
  const rows = visible.map((step) => (
    <ProgressStepRow
      key={`${step.round}:${step.callId}`}
      step={step}
      active={activeProgressIds.includes(`${step.round}:${step.callId}`)}
    />
  ));
  if (live) return <ul className="mt-2 flex flex-col gap-1.5 border-l-2 border-v2-divider pl-3">{rows}</ul>;
  return (
    <div className="mt-2">
      <Button
        variant="text"
        size="sm"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="min-h-0 px-0 py-0 text-v2-fg-tertiary hover:text-v2-fg-secondary"
      >
        확인한 자료 {visible.length}건
        <ChevronDownIcon className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </Button>
      {expanded ? <ul className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-v2-divider pl-3">{rows}</ul> : null}
    </div>
  );
}

function SourceChip({ source }: { source: AnswerSource }) {
  const imageSrc = source.subject?.type === "raid_boss" ? bossImageUrl(source.subject.boss) : null;
  const image = useImageFailure(imageSrc);
  const hasAvatar = source.subject !== undefined;
  const content = (
    <>
      {source.subject?.type === "student" ? (
        <StudentPortrait uid={source.subject.uid} className="size-5 shrink-0 rounded-full object-cover" />
      ) : imageSrc && !image.failed ? (
        <img
          ref={image.ref}
          src={imageSrc}
          onError={image.onError}
          onLoad={image.onLoad}
          alt=""
          className="size-5 shrink-0 rounded-full object-cover"
        />
      ) : null}
      <span className="text-sm font-medium">{source.label}</span>
      <span className="text-xs text-v2-fg-tertiary">{SOURCE_KIND_LABELS[source.kind]}</span>
    </>
  );
  const className = `inline-flex min-h-8 items-center gap-2 rounded-full bg-v2-inset ${hasAvatar ? "pl-1.5 pr-3" : "px-3"} text-v2-fg`;
  return (
    <li>
      {source.subject?.type === "student" ? (
        <Link
          to={`/students/${encodeURIComponent(source.subject.uid)}`}
          className={`${className} hover:bg-v2-filled-hover ${v2FocusRing}`}
        >
          {content}
          <ArrowUpRightIcon aria-hidden="true" className="size-3 text-v2-fg-tertiary" />
        </Link>
      ) : (
        <span className={className}>{content}</span>
      )}
    </li>
  );
}

function codePointLength(value: string): number {
  return [...value].length;
}

function QuestionSendIcon(props: ComponentProps<typeof ArrowUpIcon>) {
  return <ArrowUpIcon {...props} className="size-6 lg:size-4" />;
}

function AssistantMark({ working = false }: { working?: boolean }) {
  const gradientId = useId();
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-5 items-center justify-center ${working ? "animate-v2-ai-working shadow-v2-ai-glow" : ""}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--v2-ai-from)" />
            <stop offset="1" stopColor="var(--v2-ai-to)" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.5 14.3 9.7 21.5 12l-7.2 2.3L12 21.5l-2.3-7.2L2.5 12l7.2-2.3L12 2.5Z"
          fill={`url(#${gradientId})`}
        />
        <path d="m19 2 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z" fill={`url(#${gradientId})`} />
      </svg>
    </span>
  );
}

function AnswerSources({
  result,
  id,
}: {
  result: Pick<
    Extract<QuestionRunResult, { status: "answered" | "needs_clarification" | "insufficient_evidence" }>,
    "status" | "answer"
  >;
  id: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {result.answer.sources.length ? (
        <ul id={id} className="flex flex-wrap gap-2">
          {result.answer.sources.map((source) => (
            <SourceChip key={`${source.kind}:${source.sourceId}`} source={source} />
          ))}
        </ul>
      ) : null}
      {result.answer.limitations.length ? (
        <div>
          <p className="text-sm text-v2-fg-secondary">확인하지 못한 내용</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm leading-6 text-v2-fg-secondary">
            {result.answer.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <IconButton
          icon={ClipboardDocumentIcon}
          label="답변 복사"
          onClick={() => {
            void navigator.clipboard?.writeText(result.answer.text).catch(() => undefined);
          }}
          className="size-8 text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg"
        />
      </div>
    </div>
  );
}

function AssistantTurn({ turn, onRetry, sourcesId }: { turn: QuestionTurn; onRetry: () => void; sourcesId: string }) {
  if (turn.pending) {
    return (
      <div className="rounded-lg bg-v2-surface p-4">
        <div className="flex items-center gap-3 text-sm text-v2-fg-secondary">
          <AssistantMark working />
          <span>답변을 준비하고 있어요</span>
        </div>
        {turn.waitingLonger ? (
          <p className="mt-1 pl-8 text-xs text-v2-fg-tertiary">자료를 확인하고 있어요. 1분 가까이 걸릴 수 있어요.</p>
        ) : null}
        {turn.progress?.length ? (
          <ProgressDisclosure steps={turn.progress} activeProgressIds={turn.activeProgressIds} live />
        ) : null}
      </div>
    );
  }

  if (turn.interrupted) {
    return (
      <div className="rounded-lg bg-v2-surface p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-v2-danger">
          <AssistantMark />
          <XCircleIcon className="size-4" aria-hidden="true" />
          <span>답변이 중단됐어요</span>
        </div>
        <p className="mt-3 whitespace-pre-wrap break-keep text-sm leading-6 text-v2-fg">
          답변을 받는 중에 연결이 끊겼어요. 다시 시도해 주세요.
        </p>
        <Button type="button" onClick={onRetry} className="mt-3">
          다시 시도
        </Button>
      </div>
    );
  }

  if (turn.failure) {
    return (
      <div className="rounded-lg bg-v2-surface p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-v2-danger">
          <AssistantMark />
          <XCircleIcon className="size-4" aria-hidden="true" />
          <span>답변하지 못했어요</span>
        </div>
        {turn.progress?.length ? <ProgressDisclosure steps={turn.progress} /> : null}
        <p className="mt-3 whitespace-pre-wrap break-keep text-sm leading-6 text-v2-fg">{ERROR_COPY[turn.failure]}</p>
        {turn.failure !== "budget_exhausted" &&
        turn.failure !== "invalid_request" &&
        turn.failure !== "snapshot_too_large" &&
        turn.failure !== "session_expired" &&
        turn.failure !== "consent_required" &&
        turn.failure !== "conversation_not_found" ? (
          <Button type="button" onClick={onRetry} className="mt-3">
            다시 시도
          </Button>
        ) : null}
      </div>
    );
  }

  const result = turn.result;
  if (!result) return null;
  const status = {
    answered: { label: "AI 답변", Icon: null, className: "text-v2-fg-secondary" },
    needs_clarification: { label: "추가 정보가 필요해요", Icon: QuestionMarkCircleIcon, className: "text-v2-info" },
    insufficient_evidence: { label: "자료가 부족해요", Icon: ExclamationTriangleIcon, className: "text-v2-warning" },
  }[result.status];
  const StatusIcon = status.Icon;
  return (
    <div className="rounded-lg bg-v2-surface p-4">
      <div className={`flex items-center gap-2 text-sm font-medium ${status.className}`}>
        <AssistantMark />
        {StatusIcon ? <StatusIcon className="size-4" aria-hidden="true" /> : null}
        <span>{status.label}</span>
      </div>
      {turn.progress?.length ? <ProgressDisclosure steps={turn.progress} /> : null}
      <p className="mt-3 whitespace-pre-wrap break-keep text-base leading-7 text-v2-fg">{result.answer.text}</p>
      <AnswerSources result={result} id={sourcesId} />
    </div>
  );
}

function toQuestionTurn(message: ChatMessage, loadedAt: Date): QuestionTurn {
  const turn: QuestionTurn = {
    id: message.uid,
    messageUid: message.uid,
    question: message.question,
    personalMode: message.personalMode,
    progress: message.progress ?? undefined,
  };
  if (message.status === "pending") {
    return isChatMessageInterrupted(message, loadedAt) ? { ...turn, interrupted: true } : { ...turn, pending: true };
  }
  if (message.status === "failed") {
    if (message.failureCode === null) throw new Error("Stored failed chat message is missing its failure code.");
    return { ...turn, failure: message.failureCode };
  }
  if (message.answer) return { ...turn, result: { status: message.status, answer: message.answer } };
  return turn;
}

export function QuestionChat({
  isSignedIn,
  initialConsent,
  consentUnavailable,
  onConsent,
  onAsk,
  initialConversationUid,
  initialMessages,
  liveProgress,
  loadedAt,
  onConversationUid,
}: QuestionChatProps) {
  const { stacked } = useV2Page();
  const navigation = useNavigation();
  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const mountedRef = useRef(false);
  const [turns, setTurns] = useState<QuestionTurn[]>(() =>
    initialMessages.map((message) => toQuestionTurn(message, loadedAt)),
  );
  const [conversationUid, setConversationUid] = useState<string | null>(initialConversationUid);
  const activeConversationUidRef = useRef(initialConversationUid);
  const [draft, setDraft] = useState("");
  const [personalMode, setPersonalMode] = useState(initialConsent);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState(false);
  const [waitingLonger, setWaitingLonger] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const scrollQuestionId = useRef<string | null>(null);
  const scrollConversationEnd = useRef(false);
  const isComposing = useRef(false);
  const focusDraftAfterConsent = useRef(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState<number | null>(null);
  const isResponseActive = () => {
    const currentNavigation = navigationRef.current;
    const pendingLocation = currentNavigation.state === "idle" ? undefined : currentNavigation.location;
    return canApplyChatResponse(mountedRef.current, activeConversationUidRef.current, pendingLocation);
  };
  const personalModeDescription = !isSignedIn
    ? "로그인하면 쓸 수 있어요"
    : consentUnavailable
      ? "설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
      : "보유 학생, 관심 학생, 편성을 함께 보내요";

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  });

  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    const measure = () => setComposerHeight(Math.ceil(composer.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setTurns((current) => reconcileChatTurns(current, initialMessages, (message) => toQuestionTurn(message, loadedAt)));
  }, [initialMessages, loadedAt]);

  useEffect(() => {
    if (!liveProgress) {
      setPending(false);
      return;
    }
    if (liveProgress.outcome) {
      const outcome = liveProgress.outcome;
      setPending(false);
      setTurns((current) =>
        current.map((turn) => {
          if (turn.messageUid !== liveProgress.messageUid) return turn;
          return { ...turn, ...settledChatTurnState(outcome) };
        }),
      );
      setAnnouncement(
        !outcome.ok
          ? ERROR_COPY[outcome.code]
          : outcome.result.status === "failed"
            ? ERROR_COPY[outcome.result.error.code]
            : "답변이 도착했어요",
      );
      scrollConversationEnd.current = true;
      return;
    }
    setPending(true);
    setTurns((current) =>
      current.map((turn) =>
        turn.messageUid === liveProgress.messageUid
          ? { ...turn, pending: true, result: undefined, failure: undefined, localInFlight: true, ...liveProgress }
          : turn,
      ),
    );
  }, [liveProgress]);

  useEffect(() => {
    const updateKeyboardInset = () => {
      if (!stacked || !window.visualViewport) {
        setKeyboardBottomInset(null);
        return;
      }
      const inset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
      setKeyboardBottomInset(inset > 100 ? inset : null);
    };
    updateKeyboardInset();
    window.addEventListener("resize", updateKeyboardInset);
    window.visualViewport?.addEventListener("resize", updateKeyboardInset);
    window.visualViewport?.addEventListener("scroll", updateKeyboardInset);
    return () => {
      window.removeEventListener("resize", updateKeyboardInset);
      window.visualViewport?.removeEventListener("resize", updateKeyboardInset);
      window.visualViewport?.removeEventListener("scroll", updateKeyboardInset);
    };
  }, [stacked]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      setWaitingLonger(true);
      setAnnouncement("자료를 확인하고 있어요. 1분 가까이 걸릴 수 있어요.");
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    const id = scrollQuestionId.current;
    if (id) {
      document.getElementById(`question-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      scrollQuestionId.current = null;
    }
    if (scrollConversationEnd.current) {
      conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      scrollConversationEnd.current = false;
    }
  });

  const updatePersonalMode = async (next: boolean) => {
    if (!isSignedIn || consentUnavailable || savingConsent) return;
    setConsentError(null);
    if (next) {
      triggerRef.current?.focus();
      setOptionsOpen(false);
      setConsentDialogOpen(true);
      return;
    }
    setPersonalMode(false);
    setSavingConsent(true);
    try {
      const saved = await onConsent(false);
      if (!saved) {
        setPersonalMode(true);
        setConsentError("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setAnnouncement("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setPersonalMode(true);
      setConsentError("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setAnnouncement("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSavingConsent(false);
    }
  };

  const agreeToPersonalMode = async () => {
    setConsentError(null);
    setSavingConsent(true);
    try {
      const saved = await onConsent(true);
      if (saved) {
        setPersonalMode(true);
        setConsentDialogOpen(false);
        setAnnouncement("내 데이터 함께 보내기를 켰어요");
        focusDraftAfterConsent.current = false;
        window.requestAnimationFrame(() => textareaRef.current?.focus());
      } else {
        setConsentError("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
        setAnnouncement("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setConsentError("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setAnnouncement("설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSavingConsent(false);
    }
  };

  const submitQuestion = async (rawQuestion: string, existingTurn?: Pick<QuestionTurn, "id" | "messageUid">) => {
    if (pending) return;
    const question = rawQuestion.trim();
    if (!question) return;
    if (codePointLength(question) > 8192) {
      setComposerError(ERROR_COPY.question_too_long);
      setAnnouncement(ERROR_COPY.question_too_long);
      return;
    }

    setComposerError(null);
    setDraft("");
    setPending(true);
    setWaitingLonger(false);
    setAnnouncement("답변을 준비하고 있어요");
    const activePersonalMode = personalMode;
    const id = existingTurn?.id ?? crypto.randomUUID();
    if (existingTurn) {
      setTurns((current) =>
        current.map((turn) =>
          turn.id === existingTurn.id
            ? {
                ...turn,
                question,
                personalMode: activePersonalMode,
                failure: undefined,
                result: undefined,
                progress: [],
                activeProgressIds: [],
                interrupted: false,
                pending: true,
                localInFlight: true,
              }
            : turn,
        ),
      );
    } else {
      setTurns((current) => [
        ...current,
        { id, question, personalMode: activePersonalMode, pending: true, localInFlight: true },
      ]);
      scrollQuestionId.current = id;
    }

    try {
      const response = await onAsk(
        {
          question,
          personalMode: activePersonalMode,
          conversationUid,
          ...(existingTurn?.messageUid ? { retryMessageUid: existingTurn.messageUid } : {}),
        },
        {
          onStarted: (started) => {
            if (!isResponseActive()) return;
            const previousUid = activeConversationUidRef.current;
            activeConversationUidRef.current = started.conversationUid;
            setConversationUid(started.conversationUid);
            setTurns((current) =>
              current.map((turn) =>
                turn.id === id
                  ? { ...turn, messageUid: started.messageUid, progress: [], activeProgressIds: [] }
                  : turn,
              ),
            );
            if (previousUid !== started.conversationUid) onConversationUid(started.conversationUid);
          },
          onEvent: (event) => {
            setTurns((current) =>
              current.map((turn) => {
                if (turn.id !== id) return turn;
                const next = applyChatProgressEvent(
                  { progress: turn.progress ?? [], activeProgressIds: turn.activeProgressIds ?? [] },
                  event,
                );
                return { ...turn, ...next };
              }),
            );
          },
        },
      );
      if (!isResponseActive()) return;
      if (response.conversationUid) {
        activeConversationUidRef.current = response.conversationUid;
        setConversationUid(response.conversationUid);
        if (response.conversationUid !== conversationUid) onConversationUid(response.conversationUid);
      }
      const messageUid = response.messageUid ?? existingTurn?.messageUid;
      if (!response.ok) {
        const failure = response.code;
        scrollConversationEnd.current = true;
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id
              ? { ...turn, messageUid, pending: false, localInFlight: false, failure, activeProgressIds: [] }
              : turn,
          ),
        );
        if (failure === "consent_required") setPersonalMode(false);
        if (failure === "conversation_not_found") setConversationUid(null);
        setAnnouncement(ERROR_COPY[failure]);
      } else if (response.result.status === "failed") {
        const failure = response.result.error.code;
        scrollConversationEnd.current = true;
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id
              ? { ...turn, messageUid, pending: false, localInFlight: false, failure, activeProgressIds: [] }
              : turn,
          ),
        );
        setAnnouncement(ERROR_COPY[failure]);
      } else {
        const result = response.result;
        scrollConversationEnd.current = true;
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id
              ? { ...turn, messageUid, pending: false, localInFlight: false, activeProgressIds: [], result }
              : turn,
          ),
        );
        setAnnouncement(
          {
            answered: "답변이 도착했어요",
            needs_clarification: "AI가 추가 정보를 요청했어요",
            insufficient_evidence: "자료가 부족해 답하지 못했어요",
          }[result.status],
        );
      }
    } catch {
      if (!isResponseActive()) return;
      scrollConversationEnd.current = true;
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { ...turn, pending: false, localInFlight: false, failure: "network" } : turn,
        ),
      );
      setAnnouncement(ERROR_COPY.network);
    } finally {
      if (isResponseActive()) {
        setPending(false);
        setWaitingLonger(false);
      }
    }
  };

  const submitDraft = () => {
    if (pending || !draft.trim()) return;
    void submitQuestion(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !isComposing.current && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitDraft();
    }
  };

  return (
    <div
      className="flex min-h-[calc(100dvh-8rem)] flex-col"
      style={{ "--question-composer-height": `${composerHeight}px` } as CSSProperties}
    >
      {turns.length === 0 ? (
        <div className="flex flex-1 flex-col gap-4 pt-2 pb-6">
          <div className="flex items-center gap-2.5 text-lg font-semibold text-v2-fg">
            <AssistantMark />
            <p>블루 아카이브에 대해 궁금한 점을 물어보세요</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { label: "일정", question: "다음 픽업 학생과 기간 알려 줘" },
              { label: "학생", question: "미카 EX 스킬 효과 정리해 줘" },
              { label: "총력전", question: "이번 총력전 상위권은 누구를 많이 써?" },
              { label: "내 데이터", question: "내 보유 학생으로 신비 편성 추천해 줘", personal: true },
            ].map((suggestion) => (
              <button
                key={suggestion.label}
                type="button"
                onClick={() => {
                  setDraft(suggestion.question);
                  textareaRef.current?.focus();
                  if (suggestion.personal && !personalMode && isSignedIn && !consentUnavailable && !savingConsent) {
                    focusDraftAfterConsent.current = true;
                    void updatePersonalMode(true);
                  }
                }}
                className={`flex min-h-v2-row-min flex-col items-start gap-1 rounded-lg bg-v2-surface px-4 py-3 text-left text-sm leading-5 text-v2-fg hover:bg-v2-hover ${v2FocusRing}`}
              >
                <span className="text-xs text-v2-fg-tertiary">{suggestion.label}</span>
                <span>{suggestion.question}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-4 pb-[calc(var(--question-composer-height)_+_var(--mobile-nav-height)_+_1rem)] lg:pb-[calc(var(--question-composer-height)_+_1rem)]">
          {turns.map((turn) => (
            <article key={turn.id} id={`question-${turn.id}`} className="scroll-mt-4">
              <div className="ml-auto max-w-[88%] rounded-lg bg-v2-inset px-3 py-2.5 text-base leading-6 text-v2-fg">
                <p className="whitespace-pre-wrap break-keep">{turn.question}</p>
              </div>
              {turn.personalMode ? (
                <p className="mt-1 flex justify-end items-center gap-1 text-xs text-v2-fg-tertiary">
                  <UserCircleIcon className="size-3.5" aria-hidden="true" />내 데이터 포함
                </p>
              ) : null}
              <div className="mt-3">
                <AssistantTurn
                  turn={{ ...turn, waitingLonger }}
                  onRetry={() => void submitQuestion(turn.question, turn)}
                  sourcesId={`sources-${turn.id}`}
                />
              </div>
            </article>
          ))}
          <div ref={conversationEndRef} className="h-px" />
        </div>
      )}

      <div
        ref={composerRef}
        style={keyboardBottomInset === null ? undefined : { bottom: `${keyboardBottomInset}px` }}
        className={`z-10 bg-v2-canvas pt-2 ${
          stacked
            ? "fixed bottom-[var(--mobile-nav-height)] left-4 w-[min(48rem,calc(100vw_-_2rem))] md:left-8 md:w-[min(48rem,calc(100vw_-_4rem))]"
            : "sticky bottom-0 left-auto mt-auto w-full"
        }`}
      >
        <div className="rounded-lg border border-v2-control-border bg-v2-surface px-3 py-2 focus-within:border-v2-control-border-strong focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-v2-focus focus-within:shadow-v2-ai-glow">
          <label className="sr-only" htmlFor="question-input">
            질문
          </label>
          <textarea
            ref={textareaRef}
            id="question-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onCompositionStart={() => {
              isComposing.current = true;
            }}
            onCompositionEnd={() => {
              isComposing.current = false;
            }}
            placeholder="궁금한 점을 입력해 주세요"
            rows={1}
            disabled={pending}
            aria-describedby="question-shortcut-help"
            className="block max-h-[120px] min-h-8 w-full resize-none bg-transparent py-1 text-base leading-5 text-v2-fg outline-none placeholder:text-v2-fg-tertiary/75 disabled:opacity-60 max-lg:min-h-11 max-lg:py-3"
          />
          <span id="question-shortcut-help" className="sr-only">
            Enter로 질문 보내기, Shift+Enter로 줄바꿈
          </span>
          <div className="flex min-h-8 items-center justify-between gap-3 max-lg:min-h-11">
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={optionsOpen}
              aria-label={personalMode ? "질문 옵션, 내 데이터 함께 보내기 켜짐" : "질문 옵션"}
              title={personalMode ? undefined : "질문 옵션"}
              onClick={() => setOptionsOpen((open) => !open)}
              className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-v2-fast ${v2FocusRing} ${
                personalMode
                  ? "h-8 gap-1 bg-v2-inset px-2 text-v2-fg-secondary hover:bg-v2-filled-hover hover:text-v2-fg max-lg:h-11"
                  : "size-8 bg-transparent text-v2-fg-tertiary hover:bg-v2-hover hover:text-v2-fg max-lg:size-11"
              }`}
            >
              <PlusIcon className="size-5 lg:size-4" aria-hidden="true" />
              {personalMode ? <span className="text-sm font-medium lg:text-xs">내 데이터</span> : null}
            </button>
            <Popover
              open={optionsOpen}
              label="질문 옵션"
              onClose={() => setOptionsOpen(false)}
              returnFocusRef={triggerRef}
              placement="above"
              focusPanelIfNoFocusable
              className="w-72 max-w-[calc(100vw-1rem)] p-2"
            >
              <ul className="flex flex-col gap-v2-list-gap">
                <li className="rounded-md px-v2-row-x py-v2-row-y">
                  <Switch
                    id="question-personal-mode"
                    checked={personalMode}
                    onCheckedChange={(checked) => void updatePersonalMode(checked)}
                    label="내 데이터 함께 보내기"
                    description={personalModeDescription}
                    disabled={!isSignedIn || consentUnavailable || savingConsent || pending}
                  />
                </li>
              </ul>
            </Popover>
            <IconButton
              icon={QuestionSendIcon}
              label="질문 보내기"
              onClick={submitDraft}
              disabled={pending || !draft.trim()}
              className="bg-v2-fg text-v2-canvas hover:bg-v2-fg hover:text-v2-canvas hover:opacity-90 disabled:bg-v2-inset disabled:text-v2-fg-disabled"
            />
          </div>
          {consentError ? <p className="mt-1 text-xs text-v2-danger">{consentError}</p> : null}
          {composerError ? <p className="mt-1 text-xs text-v2-danger">{composerError}</p> : null}
        </div>
        <p className="py-2 text-xs leading-4 text-v2-fg-tertiary">
          AI 답변은 틀릴 수 있어요. 질문과 답변은 대화 기록에 저장돼요.
        </p>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Dialog
        open={consentDialogOpen}
        onClose={() => {
          if (!savingConsent) {
            setConsentDialogOpen(false);
            if (focusDraftAfterConsent.current) {
              focusDraftAfterConsent.current = false;
              window.requestAnimationFrame(() => textareaRef.current?.focus());
            }
          }
        }}
        title="질문과 함께 내 데이터를 보낼까요?"
        size="sm"
      >
        <div className="space-y-3 text-sm leading-6 text-v2-fg-secondary">
          <p>
            스위치를 켜 두면 질문할 때마다 몰루로그에 저장된 아래 정보를 질문과 함께 외부 AI 모델 제공사에 전달해요.
          </p>
          <ul className="rounded-md bg-v2-inset px-4 py-2">
            <li>· 보유 학생</li>
            <li>· 관심 학생</li>
            <li>· 편성</li>
          </ul>
          <p>전달한 정보는 질문, 답변과 함께 기록으로 저장돼요.</p>
          <p>동의는 계정에 저장되어 스위치를 끌 때까지 유지돼요. 스위치를 끄면 동의가 취소돼요.</p>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              onClick={() => {
                setConsentDialogOpen(false);
                if (focusDraftAfterConsent.current) {
                  focusDraftAfterConsent.current = false;
                  window.requestAnimationFrame(() => textareaRef.current?.focus());
                }
              }}
              disabled={savingConsent}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void agreeToPersonalMode()}
              disabled={savingConsent}
              className="flex-1"
            >
              동의하고 켜기
            </Button>
          </div>
          {consentError ? <p className="text-xs text-v2-danger">{consentError}</p> : null}
        </div>
      </Dialog>
    </div>
  );
}
