import { PlayIcon, TrophyIcon } from "@heroicons/react/24/outline";
import type { RefObject } from "react";
import { Link } from "react-router";
import { Button, EmptyView, LoadingSkeleton } from "~/components/primitives";
import { buildExactPartiesPath, compactExactParties } from "~/domain/raid-exact-parties";
import { getRaidVideoParties, type RaidVideoItem } from "~/models/raid-videos";
import RaidPartyCard from "./RaidPartyCard";
import { type RaidPartyStudentMap, toRaidPartyRow } from "./toRaidPartyRow";

export type RaidVideosScreenProps = {
  videos: RaidVideoItem[];
  hasMore: boolean;
  isLoading: boolean;
  loadingRef: RefObject<HTMLDivElement | null>;
  allStudents: RaidPartyStudentMap;
  maxLevel: number;
  recruitedStudentTiers: Record<string, number>;
  showUnrecruitedStudents: boolean;
  ranksPath: string;
  emptyText?: string;
};

export default function RaidVideosScreen({
  videos,
  hasMore,
  isLoading,
  loadingRef,
  allStudents,
  maxLevel,
  recruitedStudentTiers,
  showUnrecruitedStudents,
  ranksPath,
  emptyText = "공략 영상을 준비중이에요",
}: RaidVideosScreenProps) {
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">편성 정보는 자동 분류되어 정확하지 않을 수 있어요.</p>

      {videos.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {videos.map((video) => (
              <VideoCard
                key={video.youtubeId}
                {...video}
                allStudents={allStudents}
                maxLevel={maxLevel}
                recruitedStudentTiers={recruitedStudentTiers}
                showUnrecruitedStudents={showUnrecruitedStudents}
                ranksPath={ranksPath}
              />
            ))}
          </div>
        </div>
      ) : isLoading || hasMore ? (
        <LoadingSkeleton />
      ) : (
        <EmptyView text={emptyText} />
      )}

      {/* Infinite scroll loading indicator */}
      {hasMore && (
        <div ref={loadingRef} className="flex justify-center py-8">
          {isLoading && videos.length > 0 ? <LoadingSkeleton /> : null}
        </div>
      )}
    </div>
  );
}

function VideoCard({
  title,
  channelTitle,
  score,
  youtubeId,
  thumbnailUrl,
  publishedAt,
  rankMatch,
  rankHint,
  sourceParties,
  allStudents,
  maxLevel,
  recruitedStudentTiers,
  showUnrecruitedStudents,
  ranksPath,
}: RaidVideoItem & {
  allStudents: RaidPartyStudentMap;
  maxLevel: number;
  recruitedStudentTiers: Record<string, number>;
  showUnrecruitedStudents: boolean;
  ranksPath: string;
}) {
  const parties = getRaidVideoParties({ sourceParties, rankMatch });
  const exactParties = compactExactParties(parties.map((party) => party.slots.map((slot) => slot.studentUid)));
  const exactRanksPath = buildExactPartiesPath(ranksPath, exactParties);
  const recordLabel = rankMatch
    ? rankMatch.finalRank > 0
      ? `종합 ${rankMatch.finalRank.toLocaleString()}위`
      : "순위 정보 없음"
    : rankHint && rankHint.rank > 0
      ? `편성 최고 ${rankHint.rank.toLocaleString()}위`
      : null;
  const scoreLabel = typeof score === "number" ? `${score.toLocaleString()}점` : null;
  const publishedDateLabel = publishedAt ? publishedAt.slice(0, 10).replaceAll("-", ".") : null;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
      <Link
        to={`https://www.youtube.com/watch?v=${youtubeId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block transition-colors hover:bg-muted/40"
        aria-label={`${title} 영상 보기`}
      >
        <div className="relative aspect-video">
          <img src={thumbnailUrl} alt={title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity hover:opacity-100">
            <PlayIcon className="size-12 text-white" />
          </div>
          {recordLabel || scoreLabel ? (
            <div className="absolute top-2 left-2 flex flex-col items-center rounded-md bg-black/70 px-2 py-1 text-center text-white">
              {recordLabel ? <span className="text-xs font-semibold">{recordLabel}</span> : null}
              {scoreLabel ? <span className="text-[11px] font-normal">{scoreLabel}</span> : null}
            </div>
          ) : null}
          {publishedDateLabel ? (
            <span className="absolute top-2 right-2 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">
              {publishedDateLabel}
            </span>
          ) : null}
        </div>
        <div className="p-4">
          <h3 className="mb-2 h-10 line-clamp-2 text-sm font-semibold">{title}</h3>
          <p className="line-clamp-1 text-xs text-muted-foreground">{channelTitle}</p>
        </div>
      </Link>

      {parties.length > 0 ? (
        <>
          <RaidPartyCard
            rows={parties.map((party) => ({
              ...toRaidPartyRow({
                party,
                allStudents,
                maxLevel,
                recruitedStudentTiers,
                showUnrecruitedStudents,
                showLevel: false,
              }),
              label: String(party.partyIndex + 1),
            }))}
            summaryItems={[]}
            visibleRowCount={parties.length >= 3 ? 1 : undefined}
            centerRowLabels
            emptyText="편성 정보가 없어요"
            popupIdPrefix={`video-${youtubeId}`}
            className="grow rounded-none pt-0 md:pt-0"
          />
          {exactParties.length > 0 ? (
            <div className="flex justify-end px-3 pb-3">
              <Button text="이 편성 순위 보기" to={exactRanksPath} icon={TrophyIcon} size="xs" className="shadow-xs" />
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
