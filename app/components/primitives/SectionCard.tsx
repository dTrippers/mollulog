import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type SectionCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export default function SectionCard({ title, description, action, className, children }: SectionCardProps) {
  return (
    <section
      className={cn(
        "space-y-4 rounded-lg bg-card p-4 text-card-foreground shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-5",
        className,
      )}
    >
      {title || description || action ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export type { SectionCardProps };
