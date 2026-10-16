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
  // A node lets a loading value show a skeleton in place of text.
  description?: ReactNode;
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
    <span className="flex min-w-0 flex-1 items-center gap-3 pl-1">
      <Icon className="size-5 shrink-0 text-v2-fg-secondary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {/* Focus target for actions that hide themselves, such as the filter reset. */}
        <span
          id={titleId}
          data-panel-title={panelId}
          tabIndex={-1}
          className={cn(
            "block text-sm font-semibold focus:outline-none",
            disabled ? "text-v2-fg-disabled" : "text-v2-fg",
          )}
        >
          {title}
        </span>
        {description ? <span className="block truncate text-xs text-v2-fg-tertiary">{description}</span> : null}
      </span>
    </span>
  );

  // The collapsible toggle sets the header height with its min-height row. Otherwise the title line does, so the row
  // aligns to its top and the action stays on the title line.
  const togglesBody = collapsible && !disabled;
  // A disabled panel never opens its sheet. A request still sets sheetPanelId, so every reader checks disabled.
  const sheetOpen = stacked && sheetPanelId === panelId && !disabled;
  const showsBody = phase !== "collapsed" && !sheetOpen;

  return (
    <>
      <section
        ref={sectionRef}
        aria-labelledby={titleId}
        data-v2-panel={panelId}
        className="relative rounded-lg bg-v2-surface p-v2-block-p"
      >
        <div className={cn("flex gap-2", togglesBody ? "items-center" : "items-start")}>
          {togglesBody ? (
            <button
              type="button"
              aria-expanded={phase === "open"}
              aria-controls={bodyId}
              onClick={toggle}
              className={cn(
                "-mx-v2-row-x flex min-h-v2-row-min min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-v2-row-x text-left hover:bg-v2-hover",
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
            <div className="flex min-w-0 flex-1 items-start gap-2">{heading}</div>
          )}
          {/* The action is taller than one title line, so the box is one line high and the action overflows it evenly.
              The header row height never changes when the action appears or disappears. */}
          {headerAction ? <div className="flex h-5 shrink-0 items-center">{headerAction}</div> : null}
        </div>
        {showsBody ? (
          <div
            id={bodyId}
            onAnimationEnd={handleBodyAnimationEnd}
            className={cn(
              "mt-v2-group-gap text-sm",
              animated && (phase === "open" ? "v2-panel-enter" : "v2-panel-exit"),
            )}
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
        open={sheetOpen}
        title={title}
        Icon={Icon}
        panelId={panelId}
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
