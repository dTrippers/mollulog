import { PlayIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { RaidPartyCard, type RaidPartyStudentMap } from "~/components/features/raids";
import { toRaidPartyRow } from "~/components/features/raids/toRaidPartyRow";
import { AttributeBadge } from "~/components/primitives";
import { defenseTypeColor, defenseTypeLocale } from "~/locales/ko";
import { getRaidVideoParties, type RaidVideoItem } from "~/models/raid-videos";

export default function RaidPortalVideoCard({
  video,
  allStudents,
  maxLevel,
}: {
  video: RaidVideoItem;
  allStudents: RaidPartyStudentMap;
  maxLevel: number;
}) {
  const parties = getRaidVideoParties(video);
  const firstParty = parties[0];
  const rankLabel =
    video.rankMatch && video.rankMatch.finalRank > 0
      ? `최종 ${video.rankMatch.finalRank.toLocaleString()}위`
      : video.rankHint && video.rankHint.rank > 0
        ? `최대 ${video.rankHint.rank.toLocaleString()}위`
        : null;
  const scoreLabel = typeof video.score === "number" ? `${video.score.toLocaleString()}점` : null;
  const publishedDateLabel = video.publishedAt ? video.publishedAt.slice(0, 10).replaceAll("-", ".") : null;

  return (
    <article className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 dark:shadow-md dark:shadow-black/20 dark:hover:shadow-lg dark:hover:shadow-black/30">
      <Link
        to={`https://www.youtube.com/watch?v=${video.youtubeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition-colors after:absolute after:inset-0 after:z-10 group-hover:bg-muted/40"
        aria-label={`${video.title} 영상 보기`}
      >
        <div className="flex gap-3 p-3 lg:block lg:p-0">
          <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg lg:w-auto lg:rounded-none">
            <img src={video.thumbnailUrl} alt={video.title} className="size-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
              <PlayIcon className="size-7 text-white lg:size-12" />
            </div>
            {rankLabel ? (
              <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                {rankLabel}
              </span>
            ) : null}
            {scoreLabel ? (
              <span className="absolute top-9 left-2 hidden rounded-md bg-black/70 px-2 py-1 text-[11px] text-white lg:inline">
                {scoreLabel}
              </span>
            ) : null}
            {publishedDateLabel ? (
              <span className="absolute top-2 right-2 hidden rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white lg:inline">
                {publishedDateLabel}
              </span>
            ) : null}
            {video.defenseType ? (
              <span className="absolute right-2 bottom-2 hidden lg:inline-flex">
                <AttributeBadge
                  text={defenseTypeLocale[video.defenseType]}
                  color={defenseTypeColor[video.defenseType]}
                />
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1 lg:p-4">
            <div className="mb-1 flex items-center justify-between gap-2 lg:hidden">
              {video.defenseType ? (
                <AttributeBadge
                  text={defenseTypeLocale[video.defenseType]}
                  color={defenseTypeColor[video.defenseType]}
                />
              ) : (
                <span />
              )}
              {publishedDateLabel ? (
                <span className="text-xs whitespace-nowrap text-muted-foreground">{publishedDateLabel}</span>
              ) : null}
            </div>
            <h3 className="mb-2 line-clamp-2 text-sm font-semibold transition-colors group-hover:text-primary">
              {video.title}
            </h3>
            <p className="hidden line-clamp-1 text-xs text-muted-foreground lg:block">{video.channelTitle}</p>
            {scoreLabel ? <p className="text-xs tabular-nums text-muted-foreground lg:hidden">{scoreLabel}</p> : null}
          </div>
        </div>
      </Link>

      {firstParty ? (
        <RaidPartyCard
          rows={[
            {
              ...toRaidPartyRow({ party: firstParty, allStudents, maxLevel, showLevel: false }),
              label: "",
            },
          ]}
          summaryItems={[]}
          centerRowLabels
          popupIdPrefix={`portal-video-${video.youtubeId}`}
          className="grow rounded-none pt-0 md:pt-0"
        />
      ) : null}
      {parties.length > 1 ? (
        <p className="px-4 pb-3 text-right text-xs text-muted-foreground">외 {parties.length - 1}개 편성</p>
      ) : null}
    </article>
  );
}
