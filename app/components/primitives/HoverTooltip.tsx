import type { ReactNode } from "react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/utils";

type HoverTooltipProps = {
  children: ReactNode;
  content: ReactNode;
  as?: "div" | "span";
  disabled?: boolean;
  focusable?: boolean;
  className?: string;
  contentClassName?: string;
};

type TooltipPosition = {
  top: number;
  left: number;
  placement: "top" | "bottom";
};

export default function HoverTooltip({
  children,
  content,
  as = "span",
  disabled = false,
  focusable = false,
  className,
  contentClassName,
}: HoverTooltipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipPosition | null>(null);

  const showTooltip = () => {
    if (disabled || typeof window === "undefined") {
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setTooltip({
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
      placement: "top",
    });
  };

  const hideTooltip = () => setTooltip(null);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current || !triggerRef.current || typeof window === "undefined") {
      return;
    }

    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const minLeft = viewportPadding + tooltipRect.width / 2;
    const maxLeft = window.innerWidth - viewportPadding - tooltipRect.width / 2;
    const nextLeft = Math.min(Math.max(triggerRect.left + triggerRect.width / 2, minLeft), maxLeft);
    const placement = triggerRect.top - tooltipRect.height - viewportPadding < viewportPadding ? "bottom" : "top";
    const nextTop = placement === "top" ? triggerRect.top - viewportPadding : triggerRect.bottom + viewportPadding;

    if (tooltip.left !== nextLeft || tooltip.top !== nextTop || tooltip.placement !== placement) {
      setTooltip({
        top: nextTop,
        left: nextLeft,
        placement,
      });
    }
  }, [tooltip]);

  const triggerProps = {
    className,
    tabIndex: disabled || !focusable ? undefined : 0,
    "aria-describedby": tooltip && !disabled ? tooltipId : undefined,
    onMouseEnter: showTooltip,
    onMouseLeave: hideTooltip,
    onFocus: showTooltip,
    onBlur: hideTooltip,
  };

  return (
    <>
      {as === "div" ? (
        <div
          ref={(node) => {
            triggerRef.current = node;
          }}
          {...triggerProps}
        >
          {children}
        </div>
      ) : (
        <span
          ref={(node) => {
            triggerRef.current = node;
          }}
          {...triggerProps}
        >
          {children}
        </span>
      )}
      {!disabled &&
        tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-layer-navigation max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-md bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-neutral-800",
              tooltip.placement === "top" && "-translate-y-full",
              contentClassName,
            )}
            style={{ top: tooltip.top, left: tooltip.left }}
          >
            {content}
            <div
              className={cn(
                "absolute left-1/2 -translate-x-1/2 border-4 border-transparent",
                tooltip.placement === "top"
                  ? "top-full border-t-neutral-900 dark:border-t-neutral-800"
                  : "bottom-full border-b-neutral-900 dark:border-b-neutral-800",
              )}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
