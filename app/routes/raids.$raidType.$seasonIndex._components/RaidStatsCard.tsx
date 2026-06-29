import type { ReactNode } from "react";

type RaidStatsCardProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

export default function RaidStatsCard({ title, description, action, children }: RaidStatsCardProps) {
  return (
    <section className="rounded-lg bg-neutral-50 p-4 dark:bg-neutral-900">
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
