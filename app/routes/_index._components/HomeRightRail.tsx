import dayjs from "dayjs";
import { CommunityFeed, type CommunityFeedPostItem } from "~/components/features/community";
import { Button, HorizontalScroll } from "~/components/primitives";
import type { HomeYoutubeChannelSection } from "~/models/youtube";

type HomeRightRailProps = {
  recentCommunityPosts: CommunityFeedPostItem[];
  signedIn: boolean;
  studentsByUid: Record<string, { name: string }>;
  youtubeSections: HomeYoutubeChannelSection[];
};

export default function HomeRightRail({
  recentCommunityPosts,
  signedIn,
  studentsByUid,
  youtubeSections,
}: HomeRightRailProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <HomeRecentCommunitySection
        recentCommunityPosts={recentCommunityPosts}
        signedIn={signedIn}
        studentsByUid={studentsByUid}
      />
      <HomeYoutubeSection youtubeSections={youtubeSections} />
    </aside>
  );
}

function HomeRecentCommunitySection({
  recentCommunityPosts,
  signedIn,
  studentsByUid,
}: Pick<HomeRightRailProps, "recentCommunityPosts" | "signedIn" | "studentsByUid">) {
  return (
    <RailSection title="최근 평가/의견" compact>
      <CommunityFeed posts={recentCommunityPosts} signedIn={signedIn} studentsByUid={studentsByUid} preview />
      <Button text="더 보기" to="/community" variant="tint" fullWidth shadow="xs" />
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
    .slice(0, 3);

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

function RailSection({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={`mt-4 rounded-lg border border-neutral-200 bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-900/80 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <h2 className={`${compact ? "text-base" : "text-lg"} font-semibold text-neutral-900 dark:text-neutral-100`}>
        {title}
      </h2>
      <div className={`${compact ? "mt-3 space-y-3" : "mt-4 space-y-4"}`}>{children}</div>
    </section>
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
