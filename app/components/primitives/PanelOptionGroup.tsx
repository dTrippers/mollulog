import { cn } from "~/lib/utils";

type PanelOptionGroupProps = {
  title: string;
  description?: string;
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

export function PanelOptionGroup({ title, description, children }: PanelOptionGroupProps) {
  return (
    <div className="space-y-1">
      <div className="px-3 py-2 lg:px-2.5 lg:py-1.5">
        <div className="min-h-8 lg:min-h-7">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{title}</p>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1">{children}</div>
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
        "inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 lg:h-7 lg:px-1.5",
        active
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
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
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 lg:size-7",
        active
          ? "bg-primary/10 text-primary hover:bg-primary/15"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
      )}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon className="size-4 lg:size-3.5" />
    </button>
  );
}
