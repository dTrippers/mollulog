import { QuestionMarkCircleIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Popover } from "~/components/v2/primitives/Popover";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { annotateKnowledgeDescriptionParts, annotateKnowledgeText } from "~/domain/knowledge-annotation";
import type { KnowledgeAnnotationSegment, PublicKnowledgeEntry } from "~/models/knowledge-entry";

export function handleKeyboardTermClick(detail: number, setOpen: (open: boolean) => void): void {
  if (detail === 0) setOpen(true);
}

export function StudentKnowledgePopoverProvider({ children }: { children: ReactNode }) {
  return children;
}

export function KnowledgeAnnotatedText({ text, entries }: { text: string; entries: readonly PublicKnowledgeEntry[] }) {
  return <>{renderAnnotatedSegments(annotateKnowledgeText(text, entries))}</>;
}

export function KnowledgeAnnotatedDescription({
  parts,
  entries,
}: {
  parts: readonly { key: string; text: string; dynamic: boolean; emphasized: boolean }[];
  entries: readonly PublicKnowledgeEntry[];
}) {
  const annotatedParts = annotateKnowledgeDescriptionParts(parts, entries);
  return (
    <>
      {annotatedParts.map((part) =>
        part.dynamic ? (
          <span key={part.key} className={part.emphasized ? "font-semibold text-v2-fg" : "text-v2-fg"}>
            {part.segments[0]?.text}
          </span>
        ) : (
          <span key={part.key}>{renderAnnotatedSegments(part.segments, part.key)}</span>
        ),
      )}
    </>
  );
}

// Kept as pure geometry helpers for callers and their focused unit tests. The popover itself uses its trigger as the anchor.
export function getVisibleFixedHeaderBottom({
  viewportTop,
  headerRect,
  headerDisplay,
  headerVisibility,
}: {
  viewportTop: number;
  headerRect: Pick<DOMRect, "bottom" | "height"> | null;
  headerDisplay: string;
  headerVisibility: string;
}): number {
  if (headerRect === null || headerRect.height <= 0 || headerDisplay === "none" || headerVisibility !== "visible") {
    return viewportTop;
  }
  return Math.max(viewportTop, headerRect.bottom);
}

export function getKnowledgePopoverVisibleTop({
  viewportTop,
  scrollAreaTop,
  fixedHeaderBottom,
  studentTabBarRect,
}: {
  viewportTop: number;
  scrollAreaTop: number;
  fixedHeaderBottom: number;
  studentTabBarRect: Pick<DOMRect, "top" | "bottom"> | null;
}): number {
  const contentTop = Math.max(viewportTop, scrollAreaTop, fixedHeaderBottom);
  const studentTabBarIsSticky = studentTabBarRect !== null && studentTabBarRect.top <= contentTop + 1;
  return studentTabBarIsSticky ? Math.max(contentTop, studentTabBarRect.bottom) : contentTop;
}

function renderAnnotatedSegments(segments: readonly KnowledgeAnnotationSegment[], keyPrefix = "summary") {
  const rendered: ReactNode[] = [];
  let sourceOffset = 0;
  let segmentIndex = 0;
  let textOffset = 0;

  while (segmentIndex < segments.length) {
    const segment = segments[segmentIndex];
    const key = `${keyPrefix}-${sourceOffset}`;
    if (segment.kind === "text") {
      const text = segment.text.slice(textOffset);
      if (text) rendered.push(<span key={key}>{text}</span>);
      sourceOffset += text.length;
      segmentIndex += 1;
      textOffset = 0;
      continue;
    }

    const group: ReactNode[] = [renderTermTrigger(segment, key)];
    sourceOffset += segment.text.length;
    let remaining = segment.noWrapTailLength;
    let nextIndex = segmentIndex + 1;
    let nextTextOffset = 0;

    while (remaining > 0 && nextIndex < segments.length) {
      const next = segments[nextIndex];
      if (next.kind === "text") {
        const available = next.text.slice(nextTextOffset);
        const text = available.slice(0, remaining);
        if (!text) break;
        group.push(<span key={`${keyPrefix}-${sourceOffset}`}>{text}</span>);
        sourceOffset += text.length;
        remaining -= text.length;
        nextTextOffset += text.length;
        if (nextTextOffset === next.text.length) {
          nextIndex += 1;
          nextTextOffset = 0;
        } else {
          break;
        }
      } else {
        group.push(renderTermTrigger(next, `${keyPrefix}-${sourceOffset}`));
        sourceOffset += next.text.length;
        remaining -= next.text.length;
        nextIndex += 1;
      }
    }

    rendered.push(group.length === 1 ? group[0] : <span key={key} className="whitespace-nowrap">{group}</span>);
    segmentIndex = nextIndex;
    textOffset = nextTextOffset;
  }
  return rendered;
}

function renderTermTrigger(segment: Extract<KnowledgeAnnotationSegment, { kind: "term" }>, key: string) {
  return <KnowledgeTermTrigger key={key} termText={segment.text} entry={segment.entry} />;
}

function KnowledgeTermTrigger({ termText, entry }: { termText: string; entry: PublicKnowledgeEntry }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const suppressReturnFocusOpenRef = useRef(false);
  const popoverId = useId();
  const [open, setOpen] = useState(false);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const markEscapeFocusReturn = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.activeElement !== triggerRef.current) {
        suppressReturnFocusOpenRef.current = true;
      }
    };
    document.addEventListener("keydown", markEscapeFocusReturn, true);
    return () => document.removeEventListener("keydown", markEscapeFocusReturn, true);
  }, [open]);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 180);
  };

  return (
    <span className="inline whitespace-nowrap">
      <button
        ref={triggerRef}
        type="button"
        aria-label={termText}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onFocus={(event) => {
          if (suppressReturnFocusOpenRef.current) {
            suppressReturnFocusOpenRef.current = false;
            return;
          }
          if (event.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse" || event.pointerType === "pen") {
            cancelClose();
            setOpen(true);
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" || event.pointerType === "pen") scheduleClose();
        }}
        onClick={(event) => {
          if (event.detail === 0) {
            handleKeyboardTermClick(event.detail, setOpen);
          } else {
            setOpen(true);
          }
        }}
        className={`group inline cursor-help rounded-sm p-0 align-baseline text-v2-fg-secondary ${v2FocusRing} [&[aria-expanded=true]>svg]:opacity-100 [&[aria-expanded=true]>svg]:text-v2-fg`}
      >
        <span className="underline decoration-dotted decoration-1 decoration-v2-fg-tertiary underline-offset-2 hover:text-v2-fg">{termText}</span>
        <QuestionMarkCircleIcon aria-hidden="true" className="relative -top-1 ml-px -mr-0.5 inline-block size-3 text-v2-fg-tertiary opacity-[0.65] [stroke-width:2] group-hover:text-v2-fg group-hover:opacity-100 group-focus-visible:text-v2-fg group-focus-visible:opacity-100" />
      </button>
      <Popover
        open={open}
        label={entry.title}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        className="w-[min(18rem,calc(100vw-1.5rem))] backdrop-blur-[4px]"
      >
        <div
          id={popoverId}
          onPointerEnter={cancelClose}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse" || event.pointerType === "pen") scheduleClose();
          }}
        >
          <p className="text-[13px] font-semibold leading-[1.43] text-v2-fg">{entry.title}</p>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-[1.43] text-v2-fg-secondary">{entry.body}</p>
        </div>
      </Popover>
    </span>
  );
}
