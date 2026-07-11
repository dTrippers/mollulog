import { BookOpenIcon, CalendarIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { Page } from "~/components/features/layout";
import { canonicalLink } from "~/lib/seo";
import {
  formatMainStorySeasonTitle,
  getMainStories,
  type MainStoryChapter,
  type MainStoryPart,
  type MainStoryVolume,
} from "~/models/main-story";

export const meta: MetaFunction = ({ location }) => {
  const title = "메인 스토리 | 몰루로그";
  const description = "블루 아카이브 메인 스토리 일람 및 공개 일정을 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const mainStories = await getMainStories(env);
  return { mainStories };
};

type Volume = MainStoryVolume;
type Chapter = MainStoryChapter;
type Part = MainStoryPart;

type FlatPart = {
  part: Part;
  chapter: Chapter;
  volume: Volume;
  releasedAt: Date | null;
};

function getGlobalSchedule(part: Part) {
  return part.schedules.find((s) => s.region === "gl") ?? null;
}

function formatMainStoryPageVolumeTitle(volume: Volume) {
  return [volume.label, volume.name].filter(Boolean).join(" ");
}

type SeasonGroup = {
  season: number;
  volumes: Volume[];
};

function groupBySeason(volumes: Volume[]): SeasonGroup[] {
  const groups = new Map<number, Volume[]>();
  const sortedVolumes = [...volumes].sort((a, b) => a.season - b.season || a.sortOrder - b.sortOrder);

  for (const volume of sortedVolumes) {
    if (!groups.has(volume.season)) {
      groups.set(volume.season, []);
    }
    groups.get(volume.season)?.push(volume);
  }

  return [...groups.entries()].map(([season, seasonVolumes]) => ({
    season,
    volumes: seasonVolumes,
  }));
}

function flattenByRelease(volumes: Volume[]): FlatPart[] {
  const parts: FlatPart[] = [];
  for (const volume of volumes) {
    for (const chapter of volume.chapters) {
      for (const part of chapter.parts) {
        const schedule = getGlobalSchedule(part);
        parts.push({
          part,
          chapter,
          volume,
          releasedAt: schedule ? new Date(schedule.releasedAt) : null,
        });
      }
    }
  }
  return parts.sort((a, b) => {
    if (a.releasedAt === null) return 1;
    if (b.releasedAt === null) return -1;
    const releasedAtDiff = a.releasedAt.getTime() - b.releasedAt.getTime();
    if (releasedAtDiff !== 0) return releasedAtDiff;
    return (
      a.volume.season - b.volume.season ||
      a.volume.sortOrder - b.volume.sortOrder ||
      a.chapter.chapterNumber - b.chapter.chapterNumber ||
      a.part.sortOrder - b.part.sortOrder
    );
  });
}

type YearGroup = {
  year: number | null; // null = 미정
  parts: FlatPart[];
};

function groupByYear(flatParts: FlatPart[]): YearGroup[] {
  const map = new Map<number | null, FlatPart[]>();
  for (const item of flatParts) {
    const year = item.releasedAt ? item.releasedAt.getFullYear() : null;
    if (!map.has(year)) map.set(year, []);
    map.get(year)?.push(item);
  }
  // Sort years ascending, null at end
  const years = [...map.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
  return years.flatMap((year) => {
    const parts = map.get(year);
    return parts ? [{ year, parts }] : [];
  });
}

function formatDate(date: Date | null): string {
  if (!date) return "미정";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function EpisodeRange({ start, end }: { start: number | null; end: number | null }) {
  if (start === null || end === null) return null;
  if (start === end) {
    return <span className="text-sm text-muted-foreground">{start}화</span>;
  }
  return (
    <span className="text-sm text-muted-foreground">
      {start}~{end}화
    </span>
  );
}

function UpcomingBadge({ releasedAt }: { releasedAt: Date | null }) {
  if (!releasedAt || !dayjs(releasedAt).isAfter(dayjs())) return null;
  return (
    <span className="whitespace-nowrap rounded-sm bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
      예정
    </span>
  );
}

// Volume order view
function VolumeOrderView({ volumes }: { volumes: Volume[] }) {
  const seasonGroups = groupBySeason(volumes);

  return (
    <div className="space-y-10">
      {seasonGroups.map(({ season, volumes: seasonVolumes }) => (
        <section key={season} className="space-y-6">
          <div className="border-b border-border pb-2">
            <h2 className="text-xl font-bold">{formatMainStorySeasonTitle(season)}</h2>
          </div>

          <div className="space-y-10">
            {seasonVolumes.map((volume) => (
              <div key={volume.uid}>
                <div className="mb-4 flex items-center gap-2">
                  <BookOpenIcon className="size-5 shrink-0 text-primary" strokeWidth={2} />
                  <h3 className="text-lg font-bold">{formatMainStoryPageVolumeTitle(volume)}</h3>
                </div>

                <div className="ml-2 space-y-4">
                  {[...volume.chapters]
                    .sort((a, b) => a.chapterNumber - b.chapterNumber)
                    .map((chapter) => (
                      <div key={chapter.uid}>
                        <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                          제{chapter.chapterNumber}장 {chapter.name}
                        </h4>
                        <div className="ml-2 divide-y divide-border overflow-hidden rounded-lg bg-card shadow-md shadow-black/5 dark:shadow-sm dark:shadow-black/20">
                          {[...chapter.parts]
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((part) => {
                              const schedule = getGlobalSchedule(part);
                              const releasedAt = schedule ? new Date(schedule.releasedAt) : null;
                              return (
                                <div key={part.uid} className="flex items-center justify-between bg-card px-4 py-3">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <UpcomingBadge releasedAt={releasedAt} />
                                    <span className="truncate font-medium">{part.name ?? "전체"}</span>
                                    <EpisodeRange start={part.episodeStart} end={part.episodeEnd} />
                                  </div>
                                  <div className="ml-4 flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
                                    <CalendarIcon className="size-4 shrink-0" strokeWidth={2} />
                                    <span>{formatDate(releasedAt)}</span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// Release order view
function ReleaseOrderView({ volumes }: { volumes: Volume[] }) {
  const groups = groupByYear(flattenByRelease(volumes));

  return (
    <div>
      {groups.map(({ year, parts }) => {
        const groupKey = year !== null ? String(year) : "undecided";
        const label = year !== null ? `${year}년` : "미정";

        return (
          <div key={groupKey}>
            {/* Year marker */}
            <div className="flex items-center">
              <div className="size-3 shrink-0 rounded-full bg-muted-foreground/60" />
              <span className="ml-3 text-sm font-bold text-muted-foreground">{label}</span>
            </div>

            {/* Items within year */}
            <div className="flex">
              {/* Vertical line */}
              <div className="flex w-3 shrink-0 justify-center">
                <div className="w-px bg-border" />
              </div>

              {/* Content list */}
              <div className="min-w-0 flex-1 pb-6 pl-4 pt-2">
                <div className="divide-y divide-border overflow-hidden rounded-lg bg-card shadow-md shadow-black/5 dark:shadow-sm dark:shadow-black/20">
                  {parts.map(({ part, chapter, volume, releasedAt }) => (
                    <div key={part.uid} className="flex items-center gap-3 px-3 py-2.5">
                      {/* Text content */}
                      <div className="flex min-w-0 flex-1 flex-col">
                        {/* Label: Vol n. 편명 */}
                        <span className="text-xs text-muted-foreground md:text-sm">
                          {formatMainStoryPageVolumeTitle(volume)}
                        </span>
                        {/* Main: 제m장. 장명 (파트명) */}
                        <span className="mt-1 text-sm font-medium md:text-base">
                          제{chapter.chapterNumber}장{` ${chapter.name}`}
                          {part.name && <span className="font-normal text-muted-foreground"> ({part.name})</span>}
                        </span>
                      </div>

                      {/* Date + 예정 badge: far right */}
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm text-muted-foreground">
                          {releasedAt ? dayjs(releasedAt).format("M/D") : "미정"}
                        </span>
                        <UpcomingBadge releasedAt={releasedAt} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type SortMode = "volume" | "release";

export default function MainStoryPage() {
  const { mainStories } = useLoaderData<typeof loader>();
  const [sortMode, setSortMode] = useState<SortMode>("volume");

  return (
    <Page
      title="메인 스토리"
      description="블루 아카이브 메인 스토리 일람 및 공개 일정"
      screens={[
        {
          text: "스토리순",
          Icon: BookOpenIcon,
          active: sortMode === "volume",
          onClick: () => setSortMode("volume"),
        },
        {
          text: "공개순",
          Icon: CalendarIcon,
          active: sortMode === "release",
          onClick: () => setSortMode("release"),
        },
      ]}
    >
      {sortMode === "volume" ? <VolumeOrderView volumes={mainStories} /> : <ReleaseOrderView volumes={mainStories} />}
    </Page>
  );
}
