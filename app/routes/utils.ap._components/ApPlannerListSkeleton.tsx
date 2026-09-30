import SectionCard from "~/components/primitives/SectionCard";

type ApPlannerSkeletonGroup = {
  month: string;
  events: Array<{ key: string; kind: "compact" | "full" }>;
};

function CompactEventSkeleton() {
  return (
    <SectionCard className="p-3 md:p-4">
      <div className="flex min-w-0 items-start gap-3">
        <div aria-hidden="true" className="size-10 shrink-0 rounded-md bg-muted md:size-12" />
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2 sm:items-center">
          <div aria-hidden="true" className="min-w-0 flex-1">
            <div className="h-4 w-40 max-w-full rounded bg-muted" />
            <div className="mt-1 h-5 w-2/3 max-w-full rounded bg-muted" />
            <div className="h-5 w-1/2 max-w-full rounded bg-muted md:hidden" />
            <div className="h-4 w-28 max-w-full rounded bg-muted" />
          </div>
          <div aria-hidden="true" className="h-6 w-20 shrink-0 rounded bg-muted" />
        </div>
      </div>
    </SectionCard>
  );
}

function FullEventSkeleton() {
  return (
    <SectionCard className="space-y-4 p-5 md:space-y-3.5 md:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <div aria-hidden="true" className="size-10 shrink-0 rounded-md bg-muted md:size-12" />
        <div aria-hidden="true" className="min-w-0 flex-1 space-y-1">
          <div className="h-4 w-40 max-w-full rounded bg-muted" />
          <div className="h-6 w-2/3 max-w-full rounded bg-muted" />
        </div>
      </div>
      <div aria-hidden="true" className="h-8 w-52 max-w-full rounded bg-muted" />
      <div aria-hidden="true" className="h-5 w-2/3 max-w-full rounded bg-muted" />
      <div aria-hidden="true" className="flex justify-end gap-2">
        <div className="h-8 w-24 rounded bg-muted" />
        <div className="h-8 w-32 rounded bg-muted" />
      </div>
    </SectionCard>
  );
}

export default function ApPlannerListSkeleton({ groups }: { groups: ApPlannerSkeletonGroup[] }) {
  return (
    <div role="status" aria-label="이벤트 별 AP 계획을 불러오고 있어요" className="space-y-3">
      <span className="sr-only">이벤트 별 AP 계획을 불러오고 있어요</span>
      {groups.map(({ month, events }) => (
        <section key={month} aria-label={`${month} 이벤트 AP`}>
          <div className="pb-2 pt-3">
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">{month}</span>
          </div>
          <div className="space-y-3">
            {events.map((event) =>
              event.kind === "compact" ? (
                <CompactEventSkeleton key={event.key} />
              ) : (
                <FullEventSkeleton key={event.key} />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
