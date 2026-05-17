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
  size?: "sm" | "xs";
  className?: string;
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
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const buttonClassName = {
    sm: "min-h-9 px-3 py-1.5 text-sm",
    xs: "min-h-8 px-2.5 py-1 text-xs",
  }[size];
  const menuClassName = {
    sm: "py-2 text-sm",
    xs: "py-1.5 text-xs",
  }[size];

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
    <div ref={rootRef} className={cn("relative w-fit", className)}>
      {label && <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>}
      <button
        type="button"
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white font-medium text-neutral-800 shadow-xs transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800",
          buttonClassName,
        )}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="inline-flex items-center gap-1.5">
          {selectedOption?.color && <span className={cn("size-2.5 rounded-full", optionColors[selectedOption.color])} />}
          {selectedOption?.label}
        </span>
        <ChevronDownIcon className={cn("size-4 text-neutral-500 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && (
        <div className="absolute left-0 z-20 mt-1 min-w-full overflow-hidden rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 text-left whitespace-nowrap transition-colors",
                  menuClassName,
                  selected
                    ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                    : "text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800",
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
