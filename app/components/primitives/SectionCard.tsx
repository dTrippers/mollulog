import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type SectionCardProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export default function SectionCard({ title, description, action, className, children }: SectionCardProps) {
  return (
    <section className={cn("space-y-4 rounded-lg bg-card p-4 text-card-foreground md:p-5", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export type { SectionCardProps };
