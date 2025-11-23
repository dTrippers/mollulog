import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/16/solid";

export type PagePanelProps = {
  title: string;
  description?: string;
  Icon: React.ElementType;
  foldable?: boolean;
  disabled?: boolean;

  children: React.ReactNode;
};

export default function PagePanel({ Icon, title, description, foldable, disabled, children }: PagePanelProps) {
  const [folded, setFolded] = useState(disabled ? true : (foldable ?? false));

  return (
    <div className={`my-2 rounded-xl py-3 px-4 border border-neutral-200 dark:border-neutral-700 ${disabled ? "opacity-50" : ""}`}>
      <div
        className={`px-2 py-1 -mx-2 -my-1 flex items-center gap-3 ${foldable && !disabled ? "hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg cursor-pointer transition-colors" : ""}`}
        onClick={() => foldable && !disabled ? setFolded((prev) => !prev) : undefined}
      >
        <div className="shrink-0 my-2 p-2 flex items-center justify-center bg-neutral-100 dark:bg-neutral-700 rounded-lg">
          <Icon className="size-5 text-neutral-600 dark:text-neutral-400" strokeWidth={2} />
        </div>
        <div className="grow">
          <p className="font-bold">{title}</p>
          {description && <p className="text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
        </div>
        {foldable && (
          <ChevronDownIcon
            className={`shrink-0 size-4 text-neutral-600 dark:text-neutral-400 transition-transform duration-200 ease-in-out ${folded ? "" : "rotate-180"}`}
            strokeWidth={2}
          />
        )}
      </div>

      {!folded && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
}
