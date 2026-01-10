import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";

type SectionProps = {
  title: string;
  description?: string;
  foldable?: boolean;
  border?: boolean;
  foldStateKey?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

export function Section({ title, description, foldable = false, border = true, foldStateKey, defaultExpanded = true, children }: SectionProps) {
  const [visible, setVisible] = useState(() => {
    if (foldStateKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`section::${foldStateKey}`);
        if (saved !== null) {
          return JSON.parse(saved);
        }
      } catch (error) {
        // Ignore localStorage errors
      }
    }
    return defaultExpanded;
  });

  useEffect(() => {
    if (foldStateKey && typeof window !== "undefined") {
      try {
        localStorage.setItem(`section::${foldStateKey}`, JSON.stringify(visible));
      } catch (error) {
        // Ignore localStorage errors
      }
    }
  }, [visible, foldStateKey]);

  return (
    <div className={`pb-4 mb-4 ${visible ? "pb-8" : ""} ${border && foldable ? "border-b border-neutral-200 dark:border-neutral-700" : ""}`}>
      <div
        className={`flex items-center gap-3 ${foldable ? "cursor-pointer" : ""}`}
        onClick={foldable ? () => setVisible((prev: boolean) => !prev) : undefined}
      >
        <div className="grow min-w-0">
          <h2 className="font-semibold text-lg text-neutral-900 dark:text-neutral-100">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
          )}
        </div>
        {foldable && (
          <ChevronDownIcon
            className={`size-5 shrink-0 text-neutral-400 dark:text-neutral-500 transition-transform duration-200 ease-in-out ${visible ? "rotate-180" : ""}`}
          />
        )}
      </div>
      {visible && <div className={title ? "mt-4" : ""}>{children}</div>}
    </div>
  );
}

