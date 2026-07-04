import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

type ContainerProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export default function Container({ title, description, action, className, children }: ContainerProps) {
  return (
    <section className={cn("rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900", className)}>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">{title}</h3>
          {description ? <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export type { ContainerProps };
