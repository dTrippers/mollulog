import dayjs from "dayjs";
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { BookOpenIcon, CalendarIcon } from "@heroicons/react/24/outline";
import { FilterButtons } from "~/components/primitives";
import { Title } from "~/components/primitives";
import {
  formatMainStorySeasonTitle,
  getMainStories,
  type MainStoryChapter,
  type MainStoryPart,
  type MainStoryVolume,
} from "~/models/main-story";

export const meta: MetaFunction = () => {
  const title = "메인 스토리 | 몰루로그";
  const description = "블루 아카이브 메인 스토리 일람 및 공개 일정을 확인해보세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
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
    return a.volume.season - b.volume.season ||
      a.volume.sortOrder - b.volume.sortOrder ||
      a.chapter.chapterNumber - b.chapter.chapterNumber ||
      a.part.sortOrder - b.part.sortOrder;
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
    return <span className="text-sm text-neutral-500 dark:text-neutral-400">{start}화</span>;
  }
  return <span className="text-sm text-neutral-500 dark:text-neutral-400">{start}~{end}화</span>;
}

function UpcomingBadge({ releasedAt }: { releasedAt: Date | null }) {
  if (!releasedAt || !dayjs(releasedAt).isAfter(dayjs())) return null;
  return (
    <span className="whitespace-nowrap px-1.5 py-0.5 text-xs rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 font-medium">
      예정
    </span>
  );
}

// Volume order view
function VolumeOrderView({ volumes }: { volumes: Volume[] }) {
  const seasonGroups = groupBySeason(volumes);

  return (
    <div className="max-w-3xl space-y-10">
      {seasonGroups.map(({ season, volumes: seasonVolumes }) => (
        <section key={season} className="space-y-6">
          <div className="border-b border-neutral-200 pb-2 dark:border-neutral-700">
            <h2 className="text-xl font-bold">{formatMainStorySeasonTitle(season)}</h2>
          </div>

          <div className="space-y-10">
            {seasonVolumes.map((volume) => (
              <div key={volume.uid}>
                <div className="flex items-center gap-2 mb-4">
                  <BookOpenIcon className="size-5 text-primary-600 dark:text-primary-400 shrink-0" strokeWidth={2} />
                  <h3 className="text-lg font-bold">{formatMainStoryPageVolumeTitle(volume)}</h3>
                </div>

                <div className="ml-2 space-y-4">
                  {[...volume.chapters]
                    .sort((a, b) => a.chapterNumber - b.chapterNumber)
                    .map((chapter) => (
                      <div key={chapter.uid}>
                        <h4 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300 mb-2">
                          제{chapter.chapterNumber}장 {chapter.name}
                        </h4>
                        <div className="ml-2 divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-100 dark:border-neutral-700 rounded-lg overflow-hidden">
                          {[...chapter.parts]
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((part) => {
                              const schedule = getGlobalSchedule(part);
                              const releasedAt = schedule ? new Date(schedule.releasedAt) : null;
                              return (
                                <div
                                  key={part.uid}
                                  className="flex items-center justify-between px-4 py-3 bg-neutral-50 dark:bg-neutral-900"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <UpcomingBadge releasedAt={releasedAt} />
                                    <span className="font-medium truncate">{part.name ?? "전체"}</span>
                                    <EpisodeRange start={part.episodeStart} end={part.episodeEnd} />
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 ml-4 text-sm text-neutral-500 dark:text-neutral-400">
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
              <div className="size-3 rounded-full bg-neutral-400 dark:bg-neutral-500 shrink-0" />
              <span className="ml-3 font-bold text-neutral-500 dark:text-neutral-400 text-sm">
                {label}
              </span>
            </div>

            {/* Items within year */}
            <div className="flex">
              {/* Vertical line */}
              <div className="w-3 flex justify-center shrink-0">
                <div className="w-px bg-neutral-200 dark:bg-neutral-700" />
              </div>

              {/* Content list */}
              <div className="pl-4 pb-6 flex-1 min-w-0 space-y-1 pt-2">
                {parts.map(({ part, chapter, volume, releasedAt }) => (
                  <div
                    key={part.uid}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800"
                  >
                    {/* Text content */}
                    <div className="flex flex-col min-w-0 flex-1">
                      {/* Label: Vol n. 편명 */}
                      <span className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">
                        {formatMainStoryPageVolumeTitle(volume)}
                      </span>
                      {/* Main: 제m장. 장명 (파트명) */}
                      <span className="text-sm md:text-base font-medium mt-1">
                        제{chapter.chapterNumber}장{` ${chapter.name}`}
                        {part.name && (
                          <span className="font-normal text-neutral-500 dark:text-neutral-400"> ({part.name})</span>
                        )}
                      </span>
                    </div>

                    {/* Date + 예정 badge: far right */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-sm text-neutral-500 dark:text-neutral-400">
                        {releasedAt ? dayjs(releasedAt).format("M/D") : "미정"}
                      </span>
                      <UpcomingBadge releasedAt={releasedAt} />
                    </div>
                  </div>
                ))}
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
    <div>
      <Title text="메인 스토리" description="블루 아카이브 메인 스토리 일람 및 공개 일정" />
      <FilterButtons
        buttonProps={[
          {
            text: "스토리순",
            active: sortMode === "volume",
            onToggle: (activated) => { if (activated) setSortMode("volume"); },
          },
          {
            text: "공개순",
            active: sortMode === "release",
            onToggle: (activated) => { if (activated) setSortMode("release"); },
          },
        ]}
        exclusive
        atLeastOne
      />
      <div className="mt-4">
        {sortMode === "volume"
          ? <VolumeOrderView volumes={mainStories} />
          : <ReleaseOrderView volumes={mainStories} />}
      </div>
    </div>
  );
}
