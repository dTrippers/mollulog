import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import { cn } from "~/lib/utils";

export type PagePanelProps = {
  title: string;
  description?: string;
  Icon: React.ElementType;
  collapsible?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
};

export default function PagePanel({
  Icon,
  title,
  description,
  collapsible = false,
  disabled = false,
  children,
}: PagePanelProps) {
  const [expanded, setExpanded] = useState(!disabled && !collapsible);
  const heading = (
    <>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 grow">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {collapsible ? (
        <ChevronDownIcon
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      ) : null}
    </>
  );

  return (
    <section
      className={cn(
        "rounded-lg bg-card p-3 text-card-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20",
        expanded && "space-y-3",
        disabled && "opacity-50",
      )}
    >
      <div>
        {collapsible && !disabled ? (
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 rounded-md p-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {heading}
          </button>
        ) : (
          <div className="flex items-center gap-3 p-1">{heading}</div>
        )}
      </div>
      {expanded ? <div className="text-sm text-foreground/85">{children}</div> : null}
    </section>
  );
}
