import type { ElementType, KeyboardEvent } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";
import { IconButton } from "./IconButton";

export type ActionMenuItem = {
  key: string;
  label: string;
  icon: ElementType;
  danger?: boolean;
  onSelect: () => void;
};

// Menu button with menu semantics. Arrow, Home, and End move between items. Escape and an outside press close the menu, and
// focus returns to the trigger. Selecting an item closes the menu first.
export function ActionMenu({
  label,
  items,
  icon,
  className,
  disabled = false,
}: {
  label: string;
  items: ActionMenuItem[];
  icon: ElementType;
  className?: string;
  // Disables the trigger and every item, and closes an open menu, such as while a save is in flight.
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const moveFocus = (target: "first" | "last" | "next" | "previous") => {
    const itemElements = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (itemElements.length === 0) {
      return;
    }
    const current = itemElements.indexOf(document.activeElement as HTMLElement);
    const index =
      target === "first"
        ? 0
        : target === "last"
          ? itemElements.length - 1
          : target === "next"
            ? (current + 1) % itemElements.length
            : (current - 1 + itemElements.length) % itemElements.length;
    itemElements[index]?.focus();
  };

  const closeToTrigger = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus("next");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus("previous");
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus("first");
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus("last");
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeToTrigger();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className={cn("relative inline-flex", className)}>
      <IconButton
        ref={triggerRef}
        icon={icon}
        label={label}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      />
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className="absolute top-full right-0 z-20 mt-1 min-w-36 rounded-lg bg-v2-surface p-1 shadow-lg ring-1 ring-v2-control-border"
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} role="none">
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={disabled}
                  onClick={() => {
                    closeToTrigger();
                    item.onSelect();
                  }}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm text-v2-fg focus:outline-none",
                    item.danger
                      ? "text-v2-danger hover:bg-v2-danger-subtle focus:bg-v2-danger-subtle"
                      : "hover:bg-v2-hover focus:bg-v2-hover",
                    v2FocusRing,
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
