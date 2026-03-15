import dayjs from "dayjs";
import { Link } from "react-router";
import type { StudentGradingTimelineItem } from "~/components/features/students";
import { Button, HorizontalScroll, ProfileImage, TagIcon } from "~/components/primitives";
import { STUDENT_GRADING_TAG_DISPLAY, type StudentGradingTagValue } from "~/models/student-grading-tag";
import type { HomeYoutubeChannelSection } from "~/models/youtube";

type HomeRightRailProps = {
  recentGradings: StudentGradingTimelineItem[];
  youtubeSections: HomeYoutubeChannelSection[];
};

export default function HomeRightRail({ recentGradings, youtubeSections }: HomeRightRailProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <HomeRecentGradingsSection recentGradings={recentGradings} />
      <HomeYoutubeSection youtubeSections={youtubeSections} />
    </aside>
  );
}

function HomeRecentGradingsSection({ recentGradings }: Pick<HomeRightRailProps, "recentGradings">) {
  return (
    <RailSection title="최근 작성된 학생 평가">
      <div className="space-y-2">
        {recentGradings.map((grading) => (
          <RecentGradingCard key={grading.uid} grading={grading} />
        ))}
      </div>
      <Button text="학생 평가 목록" to="/students" variant="tint" fullWidth shadow="xs" />
    </RailSection>
  );
}

function HomeYoutubeSection({ youtubeSections }: Pick<HomeRightRailProps, "youtubeSections">) {
  const channelLinks = [...youtubeSections]
    .sort((a, b) => a.channelKey.localeCompare(b.channelKey))
    .map((section) => ({
      key: section.channelKey,
      text: `${section.channelName} 채널`,
      href: section.channelUrl,
    }));
  const videos = youtubeSections
    .flatMap((section) =>
      section.videos.map((video) => ({
        ...video,
        channelKey: section.channelKey,
        channelName: section.channelName,
      })),
    )
    .sort((a, b) => dayjs(b.publishedAt).valueOf() - dayjs(a.publishedAt).valueOf())
    .slice(0, 5);

  return (
    <RailSection title="공식 유튜브 최근 영상">
      {videos.length === 0 ? (
        <div className="py-6 text-sm text-neutral-500 dark:text-neutral-400">
          최근 영상을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
        </div>
      ) : (
        <>
          <div className="-mx-4 lg:hidden">
            <HorizontalScroll itemWidth={{ mobile: "w-2/3", desktop: "lg:w-full" }} gap="gap-3" className="px-4">
              {videos.map((video) => (
                <YoutubeVideoCard key={`${video.channelKey}-${video.id}`} video={video} mobile />
              ))}
            </HorizontalScroll>
          </div>
          <div className="hidden space-y-3 lg:block">
            {videos.map((video) => (
              <YoutubeVideoCard key={`${video.channelKey}-${video.id}`} video={video} />
            ))}
          </div>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        {channelLinks.map((channel) => (
          <Button
            key={channel.href}
            text={channel.text}
            href={channel.href}
            target="_blank"
            variant="tint"
            fullWidth
            shadow="xs"
          />
        ))}
      </div>
    </RailSection>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/80">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

type RecentGradingCardProps = {
  grading: StudentGradingTimelineItem;
};

function RecentGradingCard({ grading }: RecentGradingCardProps) {
  if (!grading.student || !grading.user) {
    return null;
  }

  return (
    <Link
      to={`/students/${grading.student.uid}/gradings`}
      className="group rounded-lg border border-neutral-200 bg-white transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 block p-3"
    >
      <div className="flex items-center gap-3">
        <ProfileImage studentUid={grading.student.uid} imageSize={8} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">{grading.student.name}</p>
            <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
              {dayjs(grading.updatedAt).format("MM/DD")}
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">@{grading.user.username}</p>
        </div>
      </div>

      {grading.comment && (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-neutral-700 dark:text-neutral-200">
          {grading.comment.trim()}
        </p>
      )}

      {grading.tags && grading.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sortTags(grading.tags).slice(0, 3).map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
      )}
    </Link>
  );
}

function TagBadge({ tag }: { tag: StudentGradingTagValue }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      <TagIcon tag={tag} size="sm" />
      <span>{STUDENT_GRADING_TAG_DISPLAY[tag]}</span>
    </div>
  );
}

type YoutubeVideoCardProps = {
  video: {
    id: string;
    url: string;
    title: string;
    thumbnailUrl: string;
    publishedAt: string;
    isShorts: boolean;
    channelKey: "jp" | "kr";
  };
  mobile?: boolean;
};

function YoutubeVideoCard({ video, mobile = false }: YoutubeVideoCardProps) {
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noreferrer"
      className={`group rounded-lg border border-neutral-200 bg-white transition-colors hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-900 ${
        mobile ? "block p-2" : "flex gap-3 p-2"
      }`}
    >
      <img
        src={video.thumbnailUrl}
        alt=""
        className={`aspect-video rounded-lg object-cover ${mobile ? "w-full" : "w-28 shrink-0"}`}
        loading="lazy"
      />
      <div className={`min-w-0 ${mobile ? "pt-3" : "py-1"}`}>
        <p className="line-clamp-2 min-h-10 text-sm font-semibold text-neutral-900 transition-colors group-hover:text-red-600 dark:text-neutral-100 dark:group-hover:text-red-400">
          {video.title}
        </p>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {dayjs(video.publishedAt).format("YYYY.MM.DD")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {video.channelKey === "jp" ? "#일본서버" : "#한국서버"}
          </span>
          {video.isShorts && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              #Shorts
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

function sortTags(tags: StudentGradingTagValue[]) {
  return [...tags].sort((a, b) => a.localeCompare(b));
}
