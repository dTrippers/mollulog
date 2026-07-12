import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type PanelBodyProps = {
  children: ReactNode;
  className?: string;
};

type PanelBodySectionProps = PanelBodyProps & {
  title: string;
};

type PanelBodyRowProps = PanelBodyProps & {
  title: string;
  description?: string | null;
};

export function PanelBody({ children, className }: PanelBodyProps) {
  return <div className={cn("space-y-3 text-sm", className)}>{children}</div>;
}

export function PanelBodySection({ title, children, className }: PanelBodySectionProps) {
  return (
    <section className={cn("space-y-2", className)}>
      <h4 className="text-xs font-semibold text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function PanelBodyRow({ title, description, children, className }: PanelBodyRowProps) {
  return (
    <div className={cn("flex min-h-8 items-center gap-2 py-1.5 lg:min-h-7 lg:gap-1.5", className)}>
      <div className="min-w-0 grow">
        <p className="text-sm font-normal text-foreground/85">{title}</p>
        {description ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
