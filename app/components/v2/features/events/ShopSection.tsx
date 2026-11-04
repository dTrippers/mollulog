import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useEffect, useId, useState } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { v2ButtonClassName } from "../../primitives/Button";

export function ShopSection({
  title,
  persistenceKey,
  storageKey: explicitStorageKey,
  defaultExpanded = true,
  variant = "default",
  action,
  footer,
  children,
}: {
  title: string;
  persistenceKey: string;
  storageKey?: string;
  defaultExpanded?: boolean;
  variant?: "default" | "shop";
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loaded, setLoaded] = useState(false);
  const shopVariant = variant === "shop";
  const ChevronIcon = expanded ? ChevronUpIcon : ChevronDownIcon;
  const storageKey =
    explicitStorageKey ??
    (shopVariant && !persistenceKey.startsWith("panel::") ? `panel::${persistenceKey}` : persistenceKey);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null && shopVariant) {
        const parsed: unknown = JSON.parse(stored);
        if (typeof parsed === "boolean") setExpanded(parsed);
      } else if (stored !== null) {
        setExpanded(stored === "true");
      }
    } catch {
      // The section remains usable when storage is unavailable or contains an old value.
    }
    setLoaded(true);
  }, [shopVariant, storageKey]);

  useEffect(() => {
    if (shopVariant && !loaded) return;
    try {
      localStorage.setItem(storageKey, shopVariant ? JSON.stringify(expanded) : String(expanded));
    } catch {
      // The section remains usable when storage is unavailable.
    }
  }, [expanded, loaded, shopVariant, storageKey]);

  return (
    <section className={shopVariant ? undefined : "rounded-lg bg-v2-surface p-v2-block-p"}>
      {shopVariant ? (
        <h2 className="m-0 flex items-center gap-3">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((value) => !value)}
            className={v2ButtonClassName({
              variant: "text",
              size: "sm",
              className: "h-7 min-w-0 flex-1 justify-between gap-2 px-0 text-left",
            })}
          >
            <span className="truncate text-lg font-semibold text-v2-fg">{title}</span>
            <ChevronIcon className="size-5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
          </button>
          {action ? <div className="shrink-0 text-right">{action}</div> : null}
        </h2>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((value) => !value)}
            className={cn(
              "-mx-v2-row-x flex min-h-v2-row-min min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-md px-v2-row-x text-left hover:bg-v2-hover",
              v2FocusRing,
            )}
          >
            <span className="text-sm font-semibold text-v2-fg">{title}</span>
            <ChevronIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
          </button>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {expanded ? (
        <>
          <div id={bodyId} className="mt-v2-group-gap">
            {children}
          </div>
          {shopVariant && footer ? (
            <div className="mt-v2-group-gap flex justify-end gap-v2-block-gap">{footer}</div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
