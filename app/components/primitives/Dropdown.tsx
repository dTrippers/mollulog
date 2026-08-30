import { CheckIcon, ChevronDownIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, useState } from "react";
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
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  return (
    <div ref={rootRef} className={cn("relative", fullWidth ? "w-full" : "w-fit", className)}>
      {label && <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>}
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-md border border-input bg-background font-medium text-foreground shadow-xs transition-colors hover:bg-muted",
          fullWidth && "w-full",
          size === "xs"
            ? "min-h-8 px-2.5 py-1 text-xs"
            : size === "md"
              ? "min-h-10 px-3 py-2 text-sm"
              : "min-h-9 px-3 py-1.5 text-sm",
        )}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="inline-flex items-center gap-1.5">
          {selectedOption?.color && (
            <span className={cn("size-2.5 rounded-full", optionColors[selectedOption.color])} />
          )}
          {selectedOption?.label}
        </span>
        <ChevronDownIcon className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="absolute left-0 z-20 mt-1 max-h-72 min-w-full overflow-y-auto rounded-md bg-popover py-1 text-popover-foreground shadow-lg">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 text-left whitespace-nowrap transition-colors",
                  size === "xs" ? "py-1.5 text-xs" : "py-2 text-sm",
                  selected ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60",
                )}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
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
