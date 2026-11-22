import { Portal, Transition } from "@headlessui/react";
import { type PointerEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { getPopoverMaxHeight, getPopoverPosition, type PopoverPosition } from "./popover-position";

export type PopoverProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  // The trigger. Focus returns here on Escape and after the popover closes from its own action.
  returnFocusRef: RefObject<HTMLElement | null>;
  // The element the panel is placed against. Defaults to the trigger. A caller whose trigger is only part of a larger
  // block passes the block, so the panel clears the whole block. A press inside it does not count as outside.
  anchorRef?: RefObject<HTMLElement | null>;
  // `auto` preserves the usual flip behavior; `above` always places the panel above the anchor.
  placement?: "auto" | "above";
  // When enabled, focus the panel if it contains no enabled button or link.
  focusPanelIfNoFocusable?: boolean;
  // False keeps focus on the trigger when opened on hover or keyboard focus preview.
  autoFocus?: boolean;
  // For a caller that keeps the panel open while the pointer rests on it.
  onPanelPointerEnter?: (event: PointerEvent<HTMLDivElement>) => void;
  onPanelPointerLeave?: (event: PointerEvent<HTMLDivElement>) => void;
  className?: string;
  children: ReactNode;
};

// Fixed bars that cover an edge of the viewport, such as the mobile header and bottom navigation, carry
// `data-v2-fixed-bar="top"` or `"bottom"`. A bar hidden at the current width measures as an empty box and is skipped.
function getFixedBarInsets(viewportHeight: number) {
  let top = 0;
  let bottom = 0;
  for (const bar of document.querySelectorAll<HTMLElement>("[data-v2-fixed-bar]")) {
    const rect = bar.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      continue;
    }
    if (bar.dataset.v2FixedBar === "top") {
      top = Math.max(top, rect.bottom);
    } else if (bar.dataset.v2FixedBar === "bottom") {
      bottom = Math.max(bottom, viewportHeight - rect.top);
    }
  }
  return { top, bottom };
}

// Layout effects run before the browser paints. Server render has no layout, so it uses useEffect.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// The panel settles from the trigger side. Below the trigger it slides down from above; above the trigger it slides up
// from below. The placement is a data attribute, set before the paint, so the variant applies from the first frame.
// Reduced motion keeps the opacity fade only.
const hiddenPanelMotion =
  "opacity-0 motion-safe:scale-95 motion-safe:-translate-y-1 data-[placement=above]:motion-safe:translate-y-1";

// Anchored panel for the desktop quick view. It renders in a portal on the body, so a scrolling table or list does not
// clip it. It sits below the trigger, flips above when there is no room below, and stays inside the viewport. It follows
// the trigger on resize and scroll, and it stays clear of the mobile header and bottom navigation. Escape and an outside
// pointer press close it, and focus returns to the trigger on Escape. It fades and settles from the trigger side. Motion
// is off for reduced-motion users, and the exit finishes before the panel unmounts.
export function Popover({
  open,
  label,
  onClose,
  returnFocusRef,
  anchorRef,
  placement: placementMode = "auto",
  focusPanelIfNoFocusable = false,
  autoFocus = true,
  onPanelPointerEnter,
  onPanelPointerLeave,
  className,
  children,
}: PopoverProps) {
  const placementRef = anchorRef ?? returnFocusRef;
  const panelRef = useRef<HTMLDivElement | null>(null);
  // The transition mounts the panel one commit after `open` turns true, so focus waits for the node itself.
  const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const placement = position?.placement ?? "below";
  const setPanelElement = useCallback((node: HTMLDivElement | null) => {
    panelRef.current = node;
    setPanelNode(node);
  }, []);
  // Callers pass a new onClose on each render. The listeners read the latest one from this ref, so a rerender never
  // re-attaches them, and never moves focus.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus moves to the first control once, when the panel mounts for an open popover. Later rerenders do not move it.
  useEffect(() => {
    if (open && panelNode && autoFocus) {
      const focusableControl = panelNode.querySelector<HTMLElement>("button:not(:disabled), [href]");
      if (focusableControl) {
        focusableControl.focus();
      } else if (focusPanelIfNoFocusable) {
        panelNode.focus();
      }
    }
  }, [open, panelNode, focusPanelIfNoFocusable, autoFocus]);

  // Placed before the first paint, and again when the viewport or any scroll container moves the trigger.
  useIsomorphicLayoutEffect(() => {
    if (!open || !panelNode) {
      return;
    }
    const place = () => {
      const anchor = placementRef.current?.getBoundingClientRect();
      if (!anchor) {
        return;
      }
      const insets = getFixedBarInsets(window.innerHeight);
      const nextMaxHeight = getPopoverMaxHeight({ viewportHeight: window.innerHeight, insets });
      setMaxHeight((prev) => (prev === nextMaxHeight ? prev : nextMaxHeight));
      const next = getPopoverPosition({
        anchor,
        panel: { width: panelNode.offsetWidth, height: panelNode.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        placement: placementMode,
        insets,
      });
      setPosition((prev) =>
        prev && prev.top === next.top && prev.left === next.left && prev.placement === next.placement ? prev : next,
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    // The panel grows when a control is added to it, and the anchor can change size. Either one moves the placement.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    observer?.observe(panelNode);
    if (placementRef.current) {
      observer?.observe(placementRef.current);
    }
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      observer?.disconnect();
    };
  }, [open, panelNode, placementMode, placementRef]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        returnFocusRef.current?.focus();
      }
    };
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      // A press on the trigger or anywhere in the anchor is not outside, so it does not close and reopen the panel.
      if (
        panelRef.current?.contains(target) ||
        returnFocusRef.current?.contains(target) ||
        placementRef.current?.contains(target)
      ) {
        return;
      }
      onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, returnFocusRef, placementRef]);

  return (
    <Portal>
      <Transition
        show={open}
        enter="transition duration-v2-base ease-v2-enter"
        enterFrom={hiddenPanelMotion}
        enterTo="opacity-100 motion-safe:scale-100 motion-safe:translate-y-0"
        leave="transition duration-v2-fast ease-v2-exit"
        leaveFrom="opacity-100 motion-safe:scale-100 motion-safe:translate-y-0"
        leaveTo={hiddenPanelMotion}
      >
        <div
          ref={setPanelElement}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          data-placement={placement}
          onPointerEnter={onPanelPointerEnter}
          onPointerLeave={onPanelPointerLeave}
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            ...(maxHeight === null ? {} : { "--v2-popover-room": `${maxHeight}px` }),
          }}
          className={cn(
            "fixed z-30 w-72 rounded-lg bg-v2-popover-surface p-v2-block-p shadow-v2-popover backdrop-blur-md",
            // A panel taller than the room between the fixed bars scrolls inside. A caller that sets its own max height
            // replaces this one, so it caps with min(…, var(--v2-popover-room, 100dvh)) to keep the room.
            "max-h-[var(--v2-popover-room,100dvh)] overflow-y-auto overscroll-contain",
            "focus:outline-none",
            placement === "above" ? "origin-bottom-left" : "origin-top-left",
            className,
          )}
        >
          {children}
        </div>
      </Transition>
    </Portal>
  );
}
