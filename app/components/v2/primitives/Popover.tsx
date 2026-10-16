import { Portal, Transition } from "@headlessui/react";
import { type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { getPopoverPosition, type PopoverPosition } from "./popover-position";

export type PopoverProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  // The trigger. Focus returns here on Escape and after the popover closes from its own action.
  returnFocusRef: RefObject<HTMLElement | null>;
  // The element the panel is placed against. Defaults to the trigger. A caller whose trigger is only part of a larger
  // block passes the block, so the panel clears the whole block. A press inside it does not count as outside.
  anchorRef?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
};

// Layout effects run before the browser paints. Server render has no layout, so it uses useEffect.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// The panel settles from the trigger side. Below the trigger it slides down from above; above the trigger it slides up
// from below. The placement is a data attribute, set before the paint, so the variant applies from the first frame.
// Reduced motion keeps the opacity fade only.
const hiddenPanelMotion =
  "opacity-0 motion-safe:scale-95 motion-safe:-translate-y-1 data-[placement=above]:motion-safe:translate-y-1";

// Anchored panel for the desktop quick view. It renders in a portal on the body, so a scrolling table or list does not
// clip it. It sits below the trigger, flips above when there is no room below, and stays inside the viewport. It follows
// the trigger on resize and scroll. Escape and an outside pointer press close it, and focus returns to the trigger on
// Escape. It fades and settles from the trigger side. Motion is off for reduced-motion users, and the exit finishes
// before the panel unmounts.
export function Popover({ open, label, onClose, returnFocusRef, anchorRef, className, children }: PopoverProps) {
  const placementRef = anchorRef ?? returnFocusRef;
  const panelRef = useRef<HTMLDivElement | null>(null);
  // The transition mounts the panel one commit after `open` turns true, so focus waits for the node itself.
  const [panelNode, setPanelNode] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
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
    if (open && panelNode) {
      panelNode.querySelector<HTMLElement>("button, [href]")?.focus();
    }
  }, [open, panelNode]);

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
      const next = getPopoverPosition({
        anchor,
        panel: { width: panelNode.offsetWidth, height: panelNode.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
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
  }, [open, panelNode, placementRef]);

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
    const handlePointerDown = (event: PointerEvent) => {
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
          data-placement={placement}
          style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
          className={cn(
            "fixed z-30 w-72 rounded-lg bg-v2-surface p-v2-block-p shadow-lg ring-1 ring-v2-inset",
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
