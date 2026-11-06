import type { ReactNode } from "react";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../layout/styles";

export type SectionTabItem = {
  id: string;
  label: string;
  imageUrl?: string;
  icon?: ReactNode;
};

export function SectionTabs({
  items,
  selectedId,
  onChange,
  label,
  verticalWhenWide = false,
}: {
  items: SectionTabItem[];
  selectedId: string;
  onChange: (id: string) => void;
  label?: string;
  // Stacks the tabs into a left column once the nearest unnamed @container is 48rem wide.
  verticalWhenWide?: boolean;
}) {
  return (
    <fieldset
      aria-label={label}
      className={cn(
        "my-2 flex min-w-0 max-w-full gap-1 overflow-x-auto border-0 border-b border-v2-divider p-0",
        verticalWhenWide &&
          "@min-[48rem]:my-0 @min-[48rem]:flex-col @min-[48rem]:gap-0.5 @min-[48rem]:overflow-visible @min-[48rem]:border-b-0 @min-[48rem]:border-r",
      )}
    >
      {items.map(({ id, label: tabLabel, imageUrl, icon }) => {
        const selected = id === selectedId;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(id)}
            className={cn(
              "flex min-h-v2-row-min shrink-0 cursor-pointer items-center justify-center gap-1.5 border-b-2 px-3 text-sm whitespace-nowrap",
              verticalWhenWide &&
                "@min-[48rem]:justify-start @min-[48rem]:border-r-2 @min-[48rem]:border-b-0 @min-[48rem]:py-1.5 @min-[48rem]:text-left @min-[48rem]:break-keep @min-[48rem]:whitespace-normal",
              selected
                ? "border-v2-link font-semibold text-v2-fg"
                : "border-transparent text-v2-fg-secondary hover:text-v2-fg",
              v2FocusRing,
            )}
          >
            {icon}
            {imageUrl ? <img src={imageUrl} alt="" loading="lazy" className="size-8 shrink-0 object-contain" /> : null}
            {tabLabel}
          </button>
        );
      })}
    </fieldset>
  );
}
