import { CheckIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { cn } from "~/lib/utils";

type DropdownOption<T extends string> = {
  value: T;
  label: string;
  color?: "red" | "yellow" | "green" | "blue" | "purple" | "grey";
};

type DropdownProps<T extends string> = {
  label?: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  size?: "md" | "sm" | "xs";
  className?: string;
  fullWidth?: boolean;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "false" | "true";
};

const optionColors = {
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-green-600",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  grey: "bg-neutral-500",
};

export default function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "sm",
  className,
  fullWidth = false,
  id,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(() => {
    const selectedIndex = options.findIndex((option) => option.value === value);
    return selectedIndex >= 0 ? selectedIndex : 0;
  });
  const generatedId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const controlId = id ?? generatedId;
  const menuId = `${controlId}-menu`;
  const selectedOptionIndex = options.findIndex((option) => option.value === value);
  const activeIndex = options.length > 0 ? Math.min(Math.max(activeOptionIndex, 0), options.length - 1) : -1;
  const menuOpen = isOpen && !disabled;

  const focusOption = (index: number) => {
    if (options.length === 0) return;
    const nextIndex = ((index % options.length) + options.length) % options.length;
    setActiveOptionIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus();
  };

  const closeDropdown = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const selectOption = (nextValue: T) => {
    onChange(nextValue);
    closeDropdown();
  };

  const scheduleCloseForTab = () => {
    window.setTimeout(() => setIsOpen(false), 0);
  };

  const openDropdown = (initialIndex = selectedOptionIndex >= 0 ? selectedOptionIndex : 0) => {
    if (disabled) return;
    setActiveOptionIndex(initialIndex);
    setIsOpen(true);
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, optionValue: T) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
      return;
    }
    if (event.key === "Tab") {
      scheduleCloseForTab();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectOption(optionValue);
    }
  };

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  return (
    <div ref={rootRef} className={cn("relative", fullWidth ? "w-full" : "w-fit", className)}>
      {label && (
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor={controlId}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-md border border-input bg-background font-medium text-foreground shadow-xs outline-none transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
          fullWidth && "w-full",
          size === "xs"
            ? "min-h-8 px-2.5 py-1 text-xs"
            : size === "md"
              ? "min-h-10 px-3 py-2 text-sm"
              : "min-h-9 px-3 py-1.5 text-sm",
        )}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => {
          if (menuOpen) {
            closeDropdown();
          } else {
            openDropdown();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) {
            event.preventDefault();
            closeDropdown();
            return;
          }
          if (event.key === "Tab" && menuOpen) {
            scheduleCloseForTab();
            return;
          }
          if (!menuOpen && event.key === "ArrowDown") {
            event.preventDefault();
            openDropdown();
            return;
          }
          if (!menuOpen && event.key === "ArrowUp") {
            event.preventDefault();
            openDropdown(options.length - 1);
          }
        }}
      >
        <span className="inline-flex items-center gap-1.5">
          {selectedOption?.color && (
            <span className={cn("size-2.5 rounded-full", optionColors[selectedOption.color])} />
          )}
          {selectedOption?.label}
        </span>
        <ChevronDownIcon
          className={cn("size-4 text-muted-foreground transition-transform", menuOpen && "rotate-180")}
        />
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={controlId}
          aria-orientation="vertical"
          className="absolute left-0 z-20 mt-1 max-h-72 min-w-full overflow-y-auto rounded-md bg-popover py-1 text-popover-foreground shadow-lg"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                tabIndex={index === activeIndex ? 0 : -1}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 text-left whitespace-nowrap outline-none transition-colors focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30",
                  size === "xs" ? "py-1.5 text-xs" : "py-2 text-sm",
                  selected ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60",
                )}
                role="menuitemradio"
                aria-checked={selected}
                onFocus={() => setActiveOptionIndex(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index, option.value)}
                onClick={() => {
                  selectOption(option.value);
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  {option.color && <span className={cn("size-2.5 rounded-full", optionColors[option.color])} />}
                  {option.label}
                </span>
                {selected && <CheckIcon className="size-4 text-blue-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type { DropdownOption, DropdownProps };
