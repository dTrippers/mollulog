import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { Link } from "react-router";
import { selectHomeMainStory } from "~/domain/home-content";
import type { TimelineContent } from "~/models/timeline-content";
import type { HomeSourceResult } from "~/views/home";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, nowUtcIso } from "~/lib/date-time";

export default function HomeMainStoryCard({ source }: { source: HomeSourceResult<TimelineContent | null> }) {
  const displayTimeZone = useDisplayTimeZone();
  const now = nowUtcIso();
  const current = source.status === "success" ? selectHomeMainStory(source.data, now) : null;
  const title =
    source.status === "error"
      ? "메인 스토리 정보를 불러오지 못했어요"
      : current?.name ?? "공개된 메인 스토리가 없어요";
  const dateLabel = current ? `${formatInstant(current.startAt, { timeZone: displayTimeZone, format: "M/D" })} 공개` : null;

  return (
    <Link
      to="/mainstory"
      className="group flex flex-col overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 transition-shadow hover:shadow-xl hover:shadow-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:flex-row lg:flex-col xl:flex-row dark:shadow-md dark:shadow-black/20 dark:hover:shadow-lg dark:hover:shadow-black/30"
    >
      {current?.imageUrl ? (
        <div className="relative aspect-3/1 w-full shrink-0 md:aspect-auto md:w-64 lg:aspect-3/1 lg:w-full xl:aspect-auto xl:w-64">
          <img src={current.imageUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">메인 스토리</p>
          <p className="mt-2 whitespace-pre-line text-base font-semibold leading-tight text-foreground">{title}</p>
          {dateLabel ? <p className="mt-4 text-xs text-muted-foreground">{dateLabel}</p> : null}
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
    </Link>
  );
}
