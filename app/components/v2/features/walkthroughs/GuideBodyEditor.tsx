import { BoldIcon, LinkIcon, ListBulletIcon, MinusIcon, NumberedListIcon, PlayIcon } from "@heroicons/react/16/solid";
import { mergeAttributes, Node } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import {
  EditorContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { createContext, type FormEvent, type ReactNode, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type GuideBody,
  type GuideMentionKind,
  GUIDE_BODY_LIMITS,
  isGuideMentionKind,
  normalizeGuideLinkHref,
  parseYouTubeVideoId,
} from "~/domain/guide-body";
import { walkthroughPartyLabel } from "~/domain/walkthrough-mentions";
import { filterStudentByName } from "~/filters/student";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Button } from "../../primitives/Button";
import { Popover } from "../../primitives/Popover";
import { RoundStudentImage } from "../students/RoundStudentImage";
import { guideBodyClassName } from "./GuideBodyContent";
import { type GuideMentionContext, GuideMentionChipFace, resolveGuideMention } from "./GuideMentionChip";
import { walkthroughPartyStudentUids } from "./walkthrough-editor-state";
import { PartyFaceStack, type WalkthroughStudent, walkthroughStudentName } from "./walkthrough-parts";

const MAX_LISTED_STUDENTS = 8;

// The parties and students the chips and the @ menu resolve against. The node views render inside the editor's React
// tree, so they read the current formation from here.
const MentionContext = createContext<GuideMentionContext | null>(null);

// ---------------------------------------------------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------------------------------------------------

function MentionChipView({ node, selected }: ReactNodeViewProps) {
  const context = useContext(MentionContext);
  const kind = node.attrs.kind as unknown;
  const id = String(node.attrs.id ?? "");
  const target =
    context && isGuideMentionKind(kind)
      ? resolveGuideMention(context, kind, id)
      : ({ kind: "missing", mentionKind: "party" } as const);
  return (
    <NodeViewWrapper as="span" className={cn("rounded-full", selected && "outline-2 outline-v2-focus")}>
      <GuideMentionChipFace target={target} />
    </NodeViewWrapper>
  );
}

const GuideMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      kind: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-kind"),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.kind ? { "data-kind": String(attributes.kind) } : {},
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(MentionChipView, { as: "span" });
  },
});

function YouTubeView({ node, selected }: ReactNodeViewProps) {
  const videoId = String(node.attrs.videoId ?? "");
  return (
    <NodeViewWrapper
      data-drag-handle
      className={cn(
        "relative my-3 block w-full max-w-md overflow-hidden rounded-md bg-v2-inset",
        selected && "outline-2 outline-v2-focus",
      )}
    >
      <img
        src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
        alt=""
        className="aspect-video w-full object-cover opacity-80"
        draggable={false}
      />
      <span className="absolute inset-x-0 bottom-0 truncate bg-v2-surface/80 px-3 py-1.5 text-xs text-v2-fg-secondary">
        youtube.com/watch?v={videoId}
      </span>
    </NodeViewWrapper>
  );
}

const YouTube = Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { videoId: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: "div[data-youtube-video]",
        getAttrs: (element) => ({ videoId: element.getAttribute("data-youtube-video") }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-youtube-video": HTMLAttributes.videoId })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(YouTubeView);
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// @ menu
// ---------------------------------------------------------------------------------------------------------------------

type MentionItem = { kind: GuideMentionKind; id: string };

type SuggestionState = {
  element: HTMLElement;
  props: SuggestionProps<MentionItem, MentionItem>;
};

function mentionItems(
  query: string,
  context: GuideMentionContext,
  students: readonly WalkthroughStudent[],
): MentionItem[] {
  const trimmed = query.trim();
  const parties = context.parties.flatMap((party, index) =>
    !trimmed || walkthroughPartyLabel(index).includes(trimmed) || String(index + 1) === trimmed
      ? [{ kind: "party" as const, id: party.uid }]
      : [],
  );
  const inParty = context.parties.flatMap((party) => walkthroughPartyStudentUids(party));
  const inPartySet = new Set(inParty);
  let studentUids: string[];
  if (!trimmed) {
    studentUids = [...new Set(inParty)];
  } else {
    const matched = filterStudentByName(trimmed, [...students], students.length);
    studentUids = [
      ...matched.filter((student) => inPartySet.has(student.uid)),
      ...matched.filter((student) => !inPartySet.has(student.uid)),
    ].map((student) => student.uid);
  }
  return [...parties, ...studentUids.slice(0, MAX_LISTED_STUDENTS).map((id) => ({ kind: "student" as const, id }))];
}

function firstPartyIndexOf(context: GuideMentionContext, studentUid: string): number | null {
  const index = context.parties.findIndex((party) => party.units.some((unit) => unit.studentUid === studentUid));
  return index >= 0 ? index : null;
}

function MentionMenu({
  state,
  activeIndex,
  context,
  onPick,
  onHover,
}: {
  state: SuggestionState;
  activeIndex: number;
  context: GuideMentionContext;
  onPick: (item: MentionItem) => void;
  onHover: (index: number) => void;
}) {
  const id = useId();
  const { items } = state.props;
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);
  const group = (kind: GuideMentionKind, title: string) => {
    const rows = items.flatMap((item, index) => (item.kind === kind ? [{ item, index }] : []));
    if (rows.length === 0) return null;
    return (
      // biome-ignore lint/a11y/useSemanticElements: A listbox may only hold options and option groups; a <fieldset> is neither.
      <div role="group" aria-labelledby={`${id}-${kind}`}>
        <p id={`${id}-${kind}`} className="px-2.5 pt-2 pb-1 text-xs font-medium text-v2-fg-tertiary">
          {title}
        </p>
        {rows.map(({ item, index }) => {
          const active = index === activeIndex;
          let content: ReactNode;
          if (item.kind === "party") {
            const partyIndex = context.parties.findIndex((party) => party.uid === item.id);
            const party = context.parties[partyIndex];
            content = (
              <>
                {party ? <PartyFaceStack party={party} /> : null}
                <span className="truncate">{walkthroughPartyLabel(partyIndex)}</span>
              </>
            );
          } else {
            const partyIndex = firstPartyIndexOf(context, item.id);
            content = (
              <>
                <RoundStudentImage studentUid={item.id} size="sm" />
                <span className="min-w-0 truncate">{walkthroughStudentName(context.studentsByUid, item.id)}</span>
                {partyIndex !== null ? (
                  <span className="ml-auto shrink-0 text-xs text-v2-fg-tertiary">
                    {walkthroughPartyLabel(partyIndex)}
                  </span>
                ) : null}
              </>
            );
          }
          return (
            <button
              key={`${item.kind}-${item.id}`}
              id={`${id}-option-${index}`}
              data-index={index}
              type="button"
              role="option"
              aria-selected={active}
              // The keyboard stays in the editor, which moves the active option with the arrow keys.
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={(event) => {
                if (event.movementX !== 0 || event.movementY !== 0) onHover(index);
              }}
              onClick={() => onPick(item)}
              className={cn(
                "flex min-h-v2-row-min w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm text-v2-fg",
                active && "bg-v2-hover",
              )}
            >
              {content}
            </button>
          );
        })}
      </div>
    );
  };
  return createPortal(
    <div
      ref={listRef}
      role="listbox"
      aria-label="언급할 파티나 학생"
      className="max-h-80 w-64 overflow-y-auto overscroll-contain rounded-lg bg-v2-popover-surface p-1.5 shadow-v2-popover backdrop-blur-md"
    >
      {items.length === 0 ? (
        <p className="px-2.5 py-2 text-sm text-v2-fg-secondary">검색 결과가 없어요</p>
      ) : (
        <>
          {group("party", "파티")}
          {group("student", "학생")}
        </>
      )}
    </div>,
    state.element,
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------------------------------------------------

function ToolbarButton({
  label,
  pressed,
  disabled,
  onClick,
  buttonRef,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md px-1.5 text-sm font-semibold text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg disabled:cursor-not-allowed disabled:text-v2-fg-disabled disabled:hover:bg-transparent v2-interaction-transition",
        pressed && "bg-v2-hover text-v2-fg",
        v2FocusRing,
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-v2-divider" />;
}

// A URL field in a popover, for a link or a video.
function UrlPopover({
  open,
  label,
  triggerRef,
  initialValue,
  submitLabel,
  removeLabel,
  error,
  onSubmit,
  onRemove,
  onClose,
}: {
  open: boolean;
  label: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  initialValue: string;
  submitLabel: string;
  removeLabel?: string;
  error: string | null;
  onSubmit: (value: string) => void;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, initialValue]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onSubmit(value);
  };
  return (
    <Popover
      open={open}
      label={label}
      onClose={onClose}
      returnFocusRef={triggerRef}
      className="w-80 max-w-[calc(100vw-2rem)] p-3"
    >
      {/* A nested form would submit the page's form, so the field submits on Enter by hand. */}
      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={value}
          placeholder="https://"
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") submit(event);
          }}
          className={cn(
            "h-7 w-full min-w-0 rounded-md border border-v2-control-border bg-v2-surface px-2.5 text-base text-v2-fg placeholder:text-v2-fg-tertiary sm:text-sm",
            v2FocusRing,
          )}
        />
        {error ? (
          <p id={errorId} className="text-xs text-v2-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          {onRemove && removeLabel ? (
            <Button size="sm" variant="text" className="mr-auto" onClick={onRemove}>
              {removeLabel}
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={() => onSubmit(value)}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Popover>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------------------------------------------------

// The body of a guide: paragraphs, one heading level, bold, lists, links, a divider, a video, and @ mentions of the
// guide's parties and students. It loads only on the write and edit pages.
export default function GuideBodyEditor({
  initialValue,
  context,
  students,
  onChange,
  labelledBy,
}: {
  initialValue: GuideBody | null;
  context: GuideMentionContext;
  students: readonly WalkthroughStudent[];
  onChange: (value: GuideBody) => void;
  labelledBy: string;
}) {
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [popover, setPopover] = useState<"link" | "youtube" | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const linkRef = useRef<HTMLButtonElement>(null);
  const youtubeRef = useRef<HTMLButtonElement>(null);
  // The suggestion plugin keeps the callbacks it was created with, so they read the latest values from refs.
  const contextRef = useRef(context);
  const studentsRef = useRef(students);
  const suggestionRef = useRef<SuggestionState | null>(null);
  const activeIndexRef = useRef(0);
  const onChangeRef = useRef(onChange);
  contextRef.current = context;
  studentsRef.current = students;
  suggestionRef.current = suggestion;
  activeIndexRef.current = activeIndex;
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        blockquote: false,
        code: false,
        codeBlock: false,
        italic: false,
        strike: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          isAllowedUri: (url) => normalizeGuideLinkHref(url) !== null,
          HTMLAttributes: { target: "_blank", rel: "nofollow noopener noreferrer" },
        },
      }),
      YouTube,
      GuideMention.configure({
        renderText: ({ node }) => {
          const kind = node.attrs.kind as unknown;
          if (!isGuideMentionKind(kind)) return "";
          const target = resolveGuideMention(contextRef.current, kind, String(node.attrs.id ?? ""));
          return target.kind === "party"
            ? walkthroughPartyLabel(target.partyIndex)
            : target.kind === "student"
              ? target.name
              : "";
        },
        suggestion: {
          char: "@",
          items: ({ query }) => mentionItems(query, contextRef.current, studentsRef.current),
          command: ({ editor: current, range, props }) => {
            // The menu passes the picked item; the plugin types it as the node's attributes.
            const item = props as unknown as MentionItem;
            current
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: "mention", attrs: { kind: item.kind, id: item.id } },
                { type: "text", text: " " },
              ])
              .run();
          },
          render: () => {
            let unmount: (() => void) | null = null;
            return {
              onStart: (props) => {
                const element = document.createElement("div");
                element.className = "z-30";
                unmount = props.mount(element);
                setActiveIndex(0);
                setSuggestion({ element, props });
              },
              onUpdate: (props) => {
                setActiveIndex(0);
                setSuggestion((current) => (current ? { element: current.element, props } : current));
              },
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                const state = suggestionRef.current;
                if (!state || event.isComposing) return false;
                const count = state.props.items.length;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  if (count === 0) return true;
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setActiveIndex((activeIndexRef.current + step + count) % count);
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  const item = state.props.items[activeIndexRef.current];
                  if (!item) return false;
                  state.props.command(item);
                  return true;
                }
                if (event.key === "Escape") {
                  setSuggestion(null);
                  return true;
                }
                return false;
              },
              onExit: () => {
                setSuggestion(null);
                unmount?.();
                unmount = null;
              },
            };
          },
        },
      }),
    ],
    content: initialValue ?? undefined,
    editorProps: {
      attributes: {
        "aria-labelledby": labelledBy,
        "aria-multiline": "true",
        role: "textbox",
        class: cn(guideBodyClassName, "min-h-48 px-4 py-3 outline-none"),
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain").trim() ?? "";
        if (!text || /\s/.test(text)) return false;
        const videoId = parseYouTubeVideoId(text);
        if (!videoId) return false;
        const { state } = view;
        const node = state.schema.nodes.youtube?.create({ videoId });
        if (!node) return false;
        view.dispatch(state.tr.replaceSelectionWith(node).scrollIntoView());
        return true;
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getJSON() as GuideBody),
  });

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            heading: current.isActive("heading", { level: 2 }),
            bold: current.isActive("bold"),
            bulletList: current.isActive("bulletList"),
            orderedList: current.isActive("orderedList"),
            link: current.isActive("link"),
            href: String(current.getAttributes("link").href ?? ""),
          }
        : null,
  });

  const closePopover = () => {
    setPopover(null);
    setUrlError(null);
  };

  const applyLink = (value: string) => {
    if (!editor) return;
    if (!value.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      closePopover();
      return;
    }
    const href = normalizeGuideLinkHref(value.trim()) ?? normalizeGuideLinkHref(`https://${value.trim()}`);
    if (!href || href.length > GUIDE_BODY_LIMITS.urlLength) {
      setUrlError("http나 https로 시작하는 주소를 넣어 주세요.");
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !editor.isActive("link")) {
      chain.insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    closePopover();
  };

  const insertYouTube = (value: string) => {
    if (!editor) return;
    const videoId = parseYouTubeVideoId(value.trim());
    if (!videoId) {
      setUrlError("유튜브 영상 주소를 넣어 주세요.");
      return;
    }
    editor.chain().focus().insertContent({ type: "youtube", attrs: { videoId } }).run();
    closePopover();
  };

  return (
    <MentionContext.Provider value={context}>
      <div
        className={cn(
          "min-w-0 rounded-lg border border-v2-control-border bg-v2-surface",
          "has-[.ProseMirror-focused]:outline-2 has-[.ProseMirror-focused]:outline-offset-2 has-[.ProseMirror-focused]:outline-v2-focus",
        )}
      >
        <div role="toolbar" aria-label="본문 서식" className="flex flex-wrap items-center gap-0.5 px-2 pt-2">
          <ToolbarButton
            label="소제목"
            pressed={toolbar?.heading}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H
          </ToolbarButton>
          <ToolbarButton
            label="굵게"
            pressed={toolbar?.bold}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <BoldIcon className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            label="글머리 기호 목록"
            pressed={toolbar?.bulletList}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <ListBulletIcon className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="번호 목록"
            pressed={toolbar?.orderedList}
            disabled={!editor}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <NumberedListIcon className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            label="링크"
            pressed={toolbar?.link || popover === "link"}
            disabled={!editor}
            buttonRef={linkRef}
            onClick={() => {
              setUrlError(null);
              setPopover((current) => (current === "link" ? null : "link"));
            }}
          >
            <LinkIcon className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="구분선"
            disabled={!editor}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          >
            <MinusIcon className="size-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton
            label="파티나 학생 언급"
            disabled={!editor}
            onClick={() => editor?.chain().focus().insertContent("@").run()}
          >
            @
          </ToolbarButton>
          <ToolbarButton
            label="유튜브 영상"
            pressed={popover === "youtube"}
            disabled={!editor}
            buttonRef={youtubeRef}
            onClick={() => {
              setUrlError(null);
              setPopover((current) => (current === "youtube" ? null : "youtube"));
            }}
          >
            <PlayIcon className="size-4" aria-hidden="true" />
            <span className="text-xs">유튜브</span>
          </ToolbarButton>
        </div>
        <EditorContent editor={editor} />
      </div>
      <UrlPopover
        open={popover === "link"}
        label="링크 주소"
        triggerRef={linkRef}
        initialValue={toolbar?.href ?? ""}
        submitLabel="적용"
        removeLabel={toolbar?.link ? "링크 삭제" : undefined}
        error={popover === "link" ? urlError : null}
        onSubmit={applyLink}
        onRemove={() => {
          editor?.chain().focus().extendMarkRange("link").unsetLink().run();
          closePopover();
        }}
        onClose={closePopover}
      />
      <UrlPopover
        open={popover === "youtube"}
        label="유튜브 영상 주소"
        triggerRef={youtubeRef}
        initialValue=""
        submitLabel="추가"
        error={popover === "youtube" ? urlError : null}
        onSubmit={insertYouTube}
        onClose={closePopover}
      />
      {suggestion ? (
        <MentionMenu
          state={suggestion}
          activeIndex={activeIndex}
          context={context}
          onHover={setActiveIndex}
          onPick={(item) => suggestion.props.command(item)}
        />
      ) : null}
    </MentionContext.Provider>
  );
}
