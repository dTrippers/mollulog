import { EmptyView } from "~/components/atoms/typography";
import { LoadingSkeleton } from "~/components/atoms/layout";
import { PlayIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { FilterButtons } from "~/components/navigation";
import { ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { VideoSortEnum } from "~/graphql/graphql";
import type { RefObject } from "react";

export type RaidVideosScreenProps = {
  videos: {
    id: string;
    title: string;
    score: number;
    youtubeId: string;
    thumbnailUrl: string;
    publishedAt: string;
  }[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
  sort: VideoSortEnum;
  setSort: (sort: VideoSortEnum) => void;
  isLoading: boolean;
  loadingRef: RefObject<HTMLDivElement | null>;
};

export default function RaidVideosScreen({ videos, pageInfo, sort, setSort, isLoading, loadingRef }: RaidVideosScreenProps) {
  return (
    <div>
      <FilterButtons
        Icon={ArrowsUpDownIcon}
        buttonProps={[
          { text: "점수순", active: sort === VideoSortEnum.ScoreDesc, onToggle: () => setSort(VideoSortEnum.ScoreDesc) },
          { text: "최신순", active: sort === VideoSortEnum.PublishedAtDesc, onToggle: () => setSort(VideoSortEnum.PublishedAtDesc) },
        ]}
        exclusive
        atLeastOne
      />
      <p className="my-4 text-sm text-neutral-500 dark:text-neutral-400">
        제목을 기준으로 자동 분류되어 정확하지 않을 수 있어요.
      </p>

      {videos.length > 0 ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => <VideoCard key={video.id} {...video} />)}
          </div>

          {/* Infinite scroll loading indicator */}
          {pageInfo.hasNextPage && (
            <div ref={loadingRef} className="flex justify-center py-8">
              {isLoading && <LoadingSkeleton />}
            </div>
          )}
        </div>
      ) : !isLoading ? (
        <EmptyView text="공략 영상을 준비중이에요" />
      ) : (
        <LoadingSkeleton />
      )}
    </div>
  );
}

type VideoCardProps = {
  title: string;
  score: number;
  youtubeId: string;
  thumbnailUrl: string;
  publishedAt: string;
};

function VideoCard({ title, score, youtubeId, thumbnailUrl, publishedAt }: VideoCardProps) {
  return (
    <div className="bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden transition-colors cursor-pointer">
      <div className="relative aspect-video">
        <img
          src={thumbnailUrl}
          alt={title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <PlayIcon className="w-12 h-12 text-white" />
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${youtubeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0"
          aria-label={`${title} 영상 보기`}
        />
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm line-clamp-2 mb-2">
          {title}
        </h3>
        <div className="flex justify-between items-center text-xs text-neutral-500 dark:text-neutral-400">
          <span>{score.toLocaleString()}점</span>
          <span>{dayjs(publishedAt.slice(0, 10)).format("YYYY.MM.DD")}</span>
        </div>
      </div>
    </div>
  );
}
