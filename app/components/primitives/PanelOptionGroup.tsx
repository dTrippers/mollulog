import { cn } from "~/lib/utils";

type PanelOptionGroupProps = {
  title: string;
  description?: string;
  layout?: "stacked" | "inline";
  children: React.ReactNode;
};

type PanelOptionChipProps = {
  label: string;
  active: boolean;
  Icon?: React.ElementType;
  onClick: () => void;
};

type PanelOptionIconButtonProps = {
  label: string;
  active: boolean;
  Icon: React.ElementType;
  onClick: () => void;
};

export function PanelOptionGroup({ title, description, layout = "stacked", children }: PanelOptionGroupProps) {
  const inline = layout === "inline";

  return (
    <div className="space-y-1 rounded-lg border border-neutral-200/80 p-1 dark:border-neutral-700/80">
      <div className="rounded-md px-3 py-2 transition-colors hover:bg-neutral-100/70 dark:hover:bg-neutral-700/70 lg:px-2.5 lg:py-1.5">
        <div className={cn("min-h-8 lg:min-h-7", inline && "flex items-center gap-2 lg:gap-1.5")}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</p>
            {description ? (
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
            ) : null}
          </div>
          <div className={cn("flex flex-wrap items-center gap-1", inline ? "ml-auto shrink-0 justify-end" : "mt-2")}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PanelOptionChip({ label, active, Icon, onClick }: PanelOptionChipProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1 rounded-sm border px-2 text-xs font-medium transition lg:h-7 lg:px-1.5",
        active
          ? "border-blue-500/20 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
          : "border-neutral-200 bg-neutral-100/70 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700",
      )}
      aria-pressed={active}
      onClick={onClick}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {label}
    </button>
  );
}

export function PanelOptionIconButton({ label, active, Icon, onClick }: PanelOptionIconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border transition lg:size-7",
        active
          ? "border-blue-500/20 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
          : "border-neutral-200 bg-neutral-50 text-neutral-400 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700",
      )}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon className="size-4 lg:size-3.5" />
    </button>
  );
}
