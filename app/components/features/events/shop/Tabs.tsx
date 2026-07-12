import type { Dispatch, SetStateAction } from "react";
import { cn } from "~/lib/utils";

type TabsProps = {
  tabs: {
    tabId: string;
    name: string;
    imageUrl?: string;
  }[];

  activeTabId: string;
  setActiveTabId: Dispatch<SetStateAction<string>>;
};

export function Tabs({ tabs, activeTabId, setActiveTabId }: TabsProps) {
  return (
    <div className="my-2 flex overflow-x-auto border-b border-border">
      {tabs.map(({ tabId, name, imageUrl }) => {
        const isActive = activeTabId === tabId;
        return (
          <button
            type="button"
            key={tabId}
            onClick={() => setActiveTabId(tabId)}
            aria-pressed={isActive}
            className={cn(`
                flex shrink-0 cursor-pointer items-center gap-1 border-b-3 px-4 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30
                ${
                  isActive
                    ? "border-b-primary text-foreground"
                    : "border-b-transparent text-muted-foreground hover:text-foreground"
                }
            `)}
          >
            {imageUrl && <img alt={name} src={imageUrl} className="-ml-2 -my-2 size-8 object-contain" loading="lazy" />}
            <span className="text-sm font-medium whitespace-nowrap">{name}</span>
          </button>
        );
      })}
    </div>
  );
}
