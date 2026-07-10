import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

type SectionProps = {
  title: string;
  description?: string;
  collapsible?: boolean;
  persistenceKey?: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
};

export default function Section({
  title,
  description,
  collapsible = false,
  persistenceKey,
  defaultExpanded = true,
  children,
}: SectionProps) {
  const [expanded, setExpanded] = useState(() => {
    if (persistenceKey && typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`panel::${persistenceKey}`);
        if (saved !== null) {
          return JSON.parse(saved) as boolean;
        }
      } catch (_error) {
        // Ignore unavailable or invalid local storage.
      }
    }

    return defaultExpanded;
  });

  useEffect(() => {
    if (!persistenceKey || typeof window === "undefined") {
      return;
    }

    try {
      localStorage.setItem(`panel::${persistenceKey}`, JSON.stringify(expanded));
    } catch (_error) {
      // Ignore unavailable local storage.
    }
  }, [expanded, persistenceKey]);

  const heading = (
    <>
      <div className="min-w-0 grow">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {collapsible ? (
        <ChevronDownIcon
          className={cn("size-5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      ) : null}
    </>
  );

  return (
    <section>
      {collapsible ? (
        <button
          type="button"
          className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {heading}
        </button>
      ) : (
        <div className="flex items-start gap-3">{heading}</div>
      )}
      {expanded ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

export type { SectionProps };
