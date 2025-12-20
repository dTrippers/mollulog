import type { Dispatch, SetStateAction } from "react";
import { sanitizeClassName } from "~/prophandlers";

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
    <div className="my-2 flex border-b border-neutral-200 dark:border-neutral-700 overflow-x-auto">
      {tabs.map(({ tabId, name, imageUrl }) => {
        const isActive = activeTabId === tabId;
        return (
          <div
            key={tabId}
            onClick={() => setActiveTabId(tabId)}
            className={sanitizeClassName(`
                flex items-center gap-1 py-2 px-4 border-b-3 transition-colors shrink-0 hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer
                ${isActive
                ? "border-b-blue-500 text-neutral-800 dark:text-neutral-200"
                : "border-b-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
              }
            `)}
          >
            {imageUrl && <img alt={name} src={imageUrl} className="-ml-2 -my-2 size-8 object-contain" loading="lazy"/>}
            <span className="text-sm font-medium whitespace-nowrap">
              {name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

