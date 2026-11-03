import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useId, useState } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";

export function FilterGroupDisclosure({
  title,
  selectedCount,
  children,
}: {
  title: string;
  selectedCount: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const bodyId = useId();
  return (
    <section>
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((open) => !open)}
          className={cn(
            "flex min-h-v2-row-min w-full items-center justify-between rounded-md px-0 text-left text-sm text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg active:bg-v2-filled-hover sm:min-h-8 sm:px-1",
            v2FocusRing,
          )}
        >
          <span id={titleId} className="inline-flex items-center gap-2">
            <span>{title}</span>
            {selectedCount > 0 ? (
              <span className="tabular-nums text-xs text-v2-fg-tertiary">{selectedCount}</span>
            ) : null}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 text-v2-fg-tertiary motion-safe:transition-transform duration-v2-base ease-v2-standard",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      </h3>
      {expanded ? (
        <fieldset id={bodyId} aria-labelledby={titleId} className="m-0 min-w-0 border-0 p-0 pb-2 pt-0.5 sm:pb-3">
          {children}
        </fieldset>
      ) : null}
    </section>
  );
}
