import { ArrowUpIcon, CheckIcon, LockClosedIcon, LockOpenIcon } from "@heroicons/react/16/solid";
import {
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { IconButton } from "../../primitives/IconButton";

export type CommentVisibility = "private" | "public";
export type CommentDraft = { body: string; visibility: CommentVisibility };

export type CommentComposerProps = {
  label: string;
  placeholder: string;
  // Keyboard shortcut help appended to the placeholder. Touch devices omit it, since they have no hardware keyboard.
  shortcutHint?: string;
  initialBody?: string;
  initialVisibility?: CommentVisibility;
  // Only a new top-level opinion and a top-level edit can change visibility. Replies keep the parent's public visibility.
  showVisibility?: boolean;
  submitLabel: string;
  // "save" uses a check for an edit. "send" uses an arrow for a new opinion or a reply.
  submitKind?: "send" | "save";
  disabled?: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string, visibility: CommentVisibility) => void;
  // Lets the caller move focus into the editor, such as after the opinion tutorial closes.
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  // Reports each change of the text or visibility, so a caller can keep the draft while the composer is unmounted.
  onDraftChange?: (draft: CommentDraft) => void;
};

const MAX_EDITOR_HEIGHT_PX = 120;

const COARSE_POINTER_QUERY = "(pointer: coarse)";

function subscribeCoarsePointer(onChange: () => void) {
  const query = window.matchMedia(COARSE_POINTER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    () => window.matchMedia(COARSE_POINTER_QUERY).matches,
    () => false,
  );
}

// One field holds the text, the visibility toggle, and the submit control. The text grows with its content up to a limit.
// Enter submits, Shift+Enter inserts a line break, and Enter during IME composition is ignored.
export function CommentComposer({
  label,
  placeholder,
  shortcutHint,
  initialBody = "",
  initialVisibility = "public",
  showVisibility = true,
  submitLabel,
  submitKind = "send",
  disabled = false,
  autoFocus = false,
  onSubmit,
  textareaRef,
  onDraftChange,
}: CommentComposerProps) {
  const localTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = textareaRef ?? localTextareaRef;
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldId = useId();
  const [body, setBody] = useState(initialBody);
  const [visibility, setVisibility] = useState<CommentVisibility>(initialVisibility);
  const trimmed = body.trim();
  const canSubmit = !disabled && trimmed.length > 0;
  const coarsePointer = useCoarsePointer();
  const shownPlaceholder = shortcutHint && !coarsePointer ? `${placeholder} (${shortcutHint})` : placeholder;

  // Focus moves to the editor when it opens for a reply or an edit, and the editor scrolls into view. The page never
  // autofocuses the editor on open.
  useEffect(() => {
    if (autoFocus) {
      editorRef.current?.focus();
      containerRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [autoFocus, editorRef]);

  // Runs after every render, so the height follows the text, including the clear after a submit.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    editor.style.height = "auto";
    editor.style.height = `${Math.min(editor.scrollHeight, MAX_EDITOR_HEIGHT_PX)}px`;
  });

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit(trimmed, visibility);
    // The composer does not learn whether the save succeeded, so it resets with the cleared body, as the 1.x composer did.
    setBody("");
    setVisibility("public");
    onDraftChange?.({ body: "", visibility: "public" });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const isPrivate = visibility === "private";
  const nextVisibilityText = isPrivate ? "전체 공개로 바꾸기" : "나만 보기로 바꾸기";

  return (
    <div
      ref={containerRef}
      className="flex items-end gap-1 rounded-lg border border-v2-control-border bg-v2-surface py-1 pr-1 pl-3 focus-within:border-v2-control-border-strong focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-v2-focus"
    >
      <label className="sr-only" htmlFor={`${fieldId}-textarea`}>
        {label}
      </label>
      <textarea
        ref={editorRef}
        id={`${fieldId}-textarea`}
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          onDraftChange?.({ body: event.target.value, visibility });
        }}
        onKeyDown={handleKeyDown}
        placeholder={shownPlaceholder}
        disabled={disabled}
        rows={1}
        className="min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm max-lg:min-h-11 max-lg:py-3 leading-5 text-v2-fg outline-none placeholder:truncate placeholder:text-v2-fg-tertiary/75 disabled:opacity-60"
      />
      {showVisibility ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next: CommentVisibility = isPrivate ? "public" : "private";
            setVisibility(next);
            onDraftChange?.({ body, visibility: next });
          }}
          aria-label={`공개 범위: ${isPrivate ? "나만 보기" : "전체 공개"}`}
          title={nextVisibilityText}
          className={cn(
            "inline-flex h-8 shrink-0 cursor-pointer max-lg:h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg disabled:cursor-not-allowed disabled:text-v2-fg-disabled",
            v2FocusRing,
          )}
        >
          {isPrivate ? (
            <LockClosedIcon className="size-4" aria-hidden="true" />
          ) : (
            <LockOpenIcon className="size-4" aria-hidden="true" />
          )}
          <span>{isPrivate ? "나만 보기" : "전체 공개"}</span>
        </button>
      ) : null}
      <IconButton
        icon={submitKind === "save" ? CheckIcon : ArrowUpIcon}
        label={submitLabel}
        disabled={!canSubmit}
        onClick={submit}
        className="bg-v2-fg text-v2-canvas hover:bg-v2-fg hover:text-v2-canvas hover:opacity-90 disabled:bg-v2-inset disabled:text-v2-fg-disabled"
      />
    </div>
  );
}
