import { cn } from "~/lib/utils";
import { PanelBodySection } from "./PanelBody";

type PanelOptionGroupProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

type PanelOptionChipProps = {
  label: string;
  active: boolean;
  emphasis?: "subtle" | "strong";
  Icon?: React.ElementType;
  onClick: () => void;
};

export type PanelOptionIconButtonProps = {
  label: string;
  active: boolean;
  emphasis?: "subtle" | "strong";
  Icon: React.ElementType;
  onClick: () => void;
};

export function PanelOptionGroup({ title, description, children }: PanelOptionGroupProps) {
  return (
    <PanelBodySection title={title} className="py-1.5">
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </PanelBodySection>
  );
}

export function PanelOptionChip({ label, active, emphasis = "subtle", Icon, onClick }: PanelOptionChipProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 lg:h-7 lg:px-1.5",
        active
          ? emphasis === "strong"
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-primary/10 text-primary hover:bg-primary/15"
          : "bg-muted text-foreground shadow-sm shadow-black/5 hover:bg-muted/80 dark:shadow-none",
      )}
      aria-pressed={active}
      onClick={onClick}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {label}
    </button>
  );
}

export function PanelOptionIconButton({
  label,
  active,
  emphasis = "subtle",
  Icon,
  onClick,
}: PanelOptionIconButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 lg:size-7",
        active
          ? emphasis === "strong"
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "bg-primary/10 text-primary hover:bg-primary/15"
          : "bg-muted text-foreground shadow-sm shadow-black/5 hover:bg-muted/80 dark:shadow-none",
      )}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <Icon className="size-4 lg:size-3.5" />
    </button>
  );
}
