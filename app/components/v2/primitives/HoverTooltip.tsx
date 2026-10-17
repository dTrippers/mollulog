import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Like ResourceCard's tooltip, render outside scrolling lists so the name cannot be clipped.
export function HoverTooltip({
  children,
  content,
  as: Tag = "span",
  className,
  focusable = false,
}: {
  children: ReactNode;
  content: string;
  as?: "span" | "div";
  className?: string;
  focusable?: boolean;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const panel = tooltipRef.current.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(
      margin,
      Math.min(anchor.left + (anchor.width - panel.width) / 2, window.innerWidth - panel.width - margin),
    );
    const preferredTop =
      anchor.top - panel.height - margin >= margin ? anchor.top - panel.height - margin : anchor.bottom + margin;
    const top = Math.max(margin, Math.min(preferredTop, window.innerHeight - panel.height - margin));
    setPosition({ top, left });
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    const hide = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const show = () => {
    if (!open) {
      setPosition(null);
      setOpen(true);
    }
  };

  return (
    <>
      <Tag
        ref={(node) => {
          triggerRef.current = node;
        }}
        className={cn(
          "inline-flex",
          focusable &&
            "rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
          className,
        )}
        tabIndex={focusable ? 0 : undefined}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
      >
        {children}
      </Tag>
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-layer-modal max-w-[calc(100vw-1rem)] rounded-md bg-v2-elevated px-2 py-1 text-xs text-v2-fg shadow-lg ring-1 ring-v2-control-border"
            style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
