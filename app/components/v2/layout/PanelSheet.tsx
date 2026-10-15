import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { type AnimationEvent, type ElementType, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { Sheet } from "../primitives/Sheet";
import { v2FocusRing } from "./styles";
import { useV2Page } from "./V2Page";

type PanelPhase = "collapsed" | "open" | "closing";

export type PanelSheetProps = {
  panelId: string;
  title: string;
  description?: string;
  Icon: ElementType;
  headerAction?: ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  disabled?: boolean;
  children: ReactNode;
};

// The body renders in the Aside by default, so the first paint already has the desktop structure. CSS hides the Aside
// on stacked. While this panel's Sheet is open on stacked, the body moves into the Sheet, so it never renders twice.
export function PanelSheet({
  panelId,
  title,
  description,
  Icon,
  headerAction,
  collapsible = false,
  defaultExpanded = false,
  disabled = false,
  children,
}: PanelSheetProps) {
  const { stacked, sheetPanelId, closeSheet, onSheetExited, revealRequest } = useV2Page();
  const [phase, setPhase] = useState<PanelPhase>(disabled || (collapsible && !defaultExpanded) ? "collapsed" : "open");
  const [highlightKey, setHighlightKey] = useState(0);
  const [pendingReveal, setPendingReveal] = useState<number | null>(null);
  // The enter and exit animations run only after a user or program change, so the first paint does not animate.
  const [animated, setAnimated] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // A desktop program request expands the panel and highlights it. It never moves focus.
  useEffect(() => {
    if (!revealRequest || revealRequest.panelId !== panelId || stacked || disabled) {
      return;
    }
    if (collapsible) {
      setAnimated(true);
      setPhase("open");
    }
    setHighlightKey((key) => key + 1);
    setPendingReveal(revealRequest.requestId);
  }, [revealRequest, panelId, stacked, disabled, collapsible]);

  // Scroll once the panel is open. The nearest-scroll call scrolls the Aside first, then the content area by only the
  // clipped amount.
  useEffect(() => {
    if (pendingReveal === null || stacked || phase !== "open") {
      return;
    }
    setPendingReveal(null);
    sectionRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [pendingReveal, phase, stacked]);

  const toggle = () => {
    setAnimated(true);
    setPhase((current) => (current === "open" ? "closing" : "open"));
  };

  const handleBodyAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    setPhase((current) => (current === "closing" ? "collapsed" : current));
  };

  const heading = (
    <>
      <Icon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span
          id={titleId}
          className={cn("block text-sm font-semibold", disabled ? "text-v2-fg-disabled" : "text-v2-fg")}
        >
          {title}
        </span>
        {description ? <span className="block truncate text-xs text-v2-fg-tertiary">{description}</span> : null}
      </span>
    </>
  );

  // The collapsible toggle sets the header height with its min-height row. Otherwise the title line does, so the row
  // aligns to its top and the action stays on the title line.
  const togglesBody = collapsible && !disabled;
  const sheetShowsBody = stacked && sheetPanelId === panelId;
  const showsBody = phase !== "collapsed" && !sheetShowsBody;

  return (
    <>
      <section
        ref={sectionRef}
        aria-labelledby={titleId}
        data-v2-panel={panelId}
        className="relative rounded-lg bg-v2-surface px-v2-block-p py-4"
      >
        <div className={cn("flex gap-2", togglesBody ? "items-center" : "items-start")}>
          {togglesBody ? (
            <button
              type="button"
              aria-expanded={phase === "open"}
              aria-controls={bodyId}
              onClick={toggle}
              className={cn(
                "-mx-v2-row-x flex min-h-v2-row-min min-w-0 flex-1 items-center gap-2 rounded-md px-v2-row-x text-left hover:bg-v2-hover",
                v2FocusRing,
              )}
            >
              {heading}
              <ChevronDownIcon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-v2-fg-tertiary motion-safe:transition-transform duration-v2-base ease-v2-standard",
                  phase === "open" && "rotate-180",
                )}
              />
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">{heading}</div>
          )}
          {/* The action is taller than one title line, so the box is one line high and the action overflows it evenly.
              The header row height never changes when the action appears or disappears. */}
          {headerAction ? <div className="flex h-5 shrink-0 items-center">{headerAction}</div> : null}
        </div>
        {showsBody ? (
          <div
            id={bodyId}
            onAnimationEnd={handleBodyAnimationEnd}
            className={cn("mt-3 text-sm", animated && (phase === "open" ? "v2-panel-enter" : "v2-panel-exit"))}
          >
            {children}
          </div>
        ) : null}
        <span
          key={highlightKey}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit] bg-v2-highlight opacity-0",
            highlightKey > 0 && "v2-panel-highlight",
          )}
        />
      </section>
      <Sheet
        open={stacked && sheetPanelId === panelId}
        title={title}
        description={description}
        headerAction={headerAction}
        onClose={closeSheet}
        onExited={onSheetExited}
      >
        {children}
      </Sheet>
    </>
  );
}
