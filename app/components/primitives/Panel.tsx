import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { sanitizeClassName } from "~/prophandlers";

type PanelProps = {
  title: string;
  description?: string;
  Icon?: React.ElementType;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  titleClassName?: string;
  variant?: "section" | "card";
  collapsible?: boolean;
  disabled?: boolean;
  bordered?: boolean;
  defaultExpanded?: boolean;
  persistKey?: string;
};

export default function Panel({
  title,
  description,
  Icon,
  children,
  className,
  bodyClassName,
  titleClassName,
  variant = "section",
  collapsible = false,
  disabled = false,
  bordered = true,
  defaultExpanded = true,
  persistKey,
}: PanelProps) {
  const [expanded, setExpanded] = useState(() => {
    if (persistKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`panel::${persistKey}`);
        if (saved !== null) {
          return JSON.parse(saved);
        }
      } catch (_error) {
        // Ignore localStorage errors.
      }
    }

    return defaultExpanded;
  });

  useEffect(() => {
    if (persistKey && typeof window !== "undefined") {
      try {
        localStorage.setItem(`panel::${persistKey}`, JSON.stringify(expanded));
      } catch (_error) {
        // Ignore localStorage errors.
      }
    }
  }, [expanded, persistKey]);

  const clickable = collapsible && !disabled;
  const isCard = variant === "card";
  const containerClass = isCard
    ? `my-2 rounded-xl px-3 py-2 border ${bordered ? "border-neutral-200 dark:border-neutral-700" : "border-transparent"} ${disabled ? "opacity-50" : ""}`
    : `${expanded ? "pb-8" : "pb-4"} mb-4 ${bordered && collapsible ? "border-b border-neutral-200 dark:border-neutral-700" : ""} ${disabled ? "opacity-50" : ""}`;
  const headerClass = isCard
    ? `px-2 py-1 -mx-2 -my-1 flex items-center gap-3 ${clickable ? "hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg cursor-pointer transition-colors" : ""}`
    : `flex items-center gap-3 ${clickable ? "cursor-pointer" : ""}`;
  const iconWrapperClass = isCard
    ? "shrink-0 my-2 p-2 flex items-center justify-center bg-neutral-100 dark:bg-neutral-700 rounded-lg"
    : "";
  const titleElementClass = isCard ? "font-bold text-sm" : "font-semibold text-lg text-neutral-900 dark:text-neutral-100";
  const descriptionClass = isCard ? "text-sm text-neutral-500 dark:text-neutral-400" : "mt-1 text-sm text-neutral-500 dark:text-neutral-400";
  const bodySpacingClass = isCard ? "mt-4" : title ? "mt-4" : "";

  const content = (
    <>
      {Icon && (
        <div className={iconWrapperClass}>
          <Icon className={sanitizeClassName(`${isCard ? "size-5 text-neutral-600 dark:text-neutral-400" : "size-5 shrink-0 text-neutral-400 dark:text-neutral-500"}`)} strokeWidth={2} />
        </div>
      )}
      <div className="grow min-w-0">
        <p className={titleElementClass}>{title}</p>
        {description && <p className={descriptionClass}>{description}</p>}
      </div>
      {collapsible && (
        <ChevronDownIcon
          className={sanitizeClassName(`
            shrink-0 transition-transform duration-200 ease-in-out
            ${isCard ? "size-4 text-neutral-600 dark:text-neutral-400" : "size-5 text-neutral-400 dark:text-neutral-500"}
            ${expanded ? "rotate-180" : ""}
          `)}
        />
      )}
    </>
  );

  return (
    <div className={sanitizeClassName(`${containerClass} ${className ?? ""}`)}>
      {clickable ? (
        <button
          type="button"
          className={sanitizeClassName(`${headerClass} w-full text-left ${titleClassName ?? ""}`)}
          onClick={() => setExpanded((prev: boolean) => !prev)}
        >
          {content}
        </button>
      ) : (
        <div className={sanitizeClassName(`${headerClass} ${titleClassName ?? ""}`)}>
          {content}
        </div>
      )}
      {expanded && <div className={sanitizeClassName(`${bodySpacingClass} ${bodyClassName ?? ""}`)}>{children}</div>}
    </div>
  );
}

export type { PanelProps };
