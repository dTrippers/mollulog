import { EllipsisHorizontalIcon } from "@heroicons/react/16/solid";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { Popover } from "~/components/v2/primitives/Popover";
import { cn } from "~/lib/utils";

export type GrowthRowMenuItem =
  | { key: string; label: string; to: string; danger?: false }
  | { key: string; label: string; onSelect: () => void; danger?: boolean };

// The ⋯ menu of a planner row. It opens in a popover on the page body, so the scrolling table does not clip it. Arrow,
// Home and End keys move between items; Escape and an outside press close it, and focus returns to the trigger.
export function GrowthRowMenu({
  label,
  items,
  disabled = false,
}: {
  label: string;
  items: GrowthRowMenuItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const moveFocus = (target: "first" | "last" | "next" | "previous") => {
    const elements = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (elements.length === 0) return;
    const current = elements.indexOf(document.activeElement as HTMLElement);
    const index =
      target === "first"
        ? 0
        : target === "last"
          ? elements.length - 1
          : target === "next"
            ? (current + 1) % elements.length
            : (current - 1 + elements.length) % elements.length;
    elements[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, "first" | "last" | "next" | "previous"> = {
      ArrowDown: "next",
      ArrowUp: "previous",
      Home: "first",
      End: "last",
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      moveFocus(move);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        icon={EllipsisHorizontalIcon}
        label={label}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(open && "bg-v2-hover text-v2-fg")}
      />
      <Popover
        open={open}
        label={label}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
        className="min-w-36 p-1"
      >
        <div ref={menuRef} role="menu" aria-label={label} onKeyDown={handleKeyDown}>
          {items.map((item) => (
            <div key={item.key} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close();
                  if ("to" in item) navigate(item.to);
                  else item.onSelect();
                }}
                className={cn(
                  "flex min-h-v2-row-min w-full cursor-pointer items-center rounded-md px-2.5 text-left text-sm focus:outline-none",
                  item.danger
                    ? "text-v2-danger hover:bg-v2-danger-subtle focus:bg-v2-danger-subtle"
                    : "text-v2-fg hover:bg-v2-hover focus:bg-v2-hover",
                  "v2-interaction-transition",
                  v2FocusRing,
                )}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      </Popover>
    </>
  );
}
