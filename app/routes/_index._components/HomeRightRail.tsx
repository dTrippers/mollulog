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

export function HomeRightRailSkeleton() {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <RailSection title="최근 피드">
        <div className="space-y-2" aria-hidden="true">
          {["community-1", "community-2", "community-3"].map((key) => (
            <div key={key} className="rounded-md bg-background p-3">
              <div className="h-4 w-3/4 animate-pulse rounded-sm bg-muted" />
              <div className="mt-2 h-3 w-1/2 animate-pulse rounded-sm bg-muted" />
            </div>
          ))}
          <div className="h-9 animate-pulse rounded-md bg-muted" />
        </div>
      </RailSection>
      <RailSection title="공식 유튜브 최근 영상">
        <div className="space-y-3" aria-hidden="true">
          {["youtube-1", "youtube-2", "youtube-3"].map((key) => (
            <div key={key} className="flex gap-3 rounded-md bg-background p-2">
              <div className="aspect-video w-28 shrink-0 animate-pulse rounded-md bg-muted" />
              <div className="min-w-0 flex-1 py-1">
                <div className="h-4 w-full animate-pulse rounded-sm bg-muted" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
                <div className="mt-3 h-5 w-20 animate-pulse rounded-full bg-muted" />
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <div className="h-9 animate-pulse rounded-md bg-muted" />
            <div className="h-9 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      </RailSection>
    </aside>
  );
}

function HomeRecentCommunitySection({
  recentCommunityPosts,
  signedIn,
  studentsByUid,
}: Pick<HomeRightRailProps, "recentCommunityPosts" | "signedIn" | "studentsByUid">) {
  return (
    <RailSection title="최근 피드">
      <CommunityFeed posts={recentCommunityPosts} signedIn={signedIn} studentsByUid={studentsByUid} preview />
      <Button text="더 보기" to="/community" variant="secondary" className="bg-background" fullWidth />
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
        <div className="py-6 text-sm text-muted-foreground">
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
            variant="secondary"
            className="bg-background"
            fullWidth
          />
        ))}
      </div>
    </RailSection>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
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
      className={`group rounded-md transition-colors hover:bg-muted ${mobile ? "block p-2" : "flex gap-3 p-2"}`}
    >
      <img
        src={video.thumbnailUrl}
        alt=""
        className={`aspect-video rounded-md object-cover ${mobile ? "w-full" : "w-28 shrink-0"}`}
        loading="lazy"
      />
      <div className={`min-w-0 ${mobile ? "pt-3" : "py-1"}`}>
        <p className="line-clamp-2 min-h-10 text-sm font-semibold text-foreground transition-colors group-hover:text-red-600 dark:group-hover:text-red-400">
          {video.title}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{dayjs(video.publishedAt).format("YYYY.MM.DD")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            {video.channelKey === "jp" ? "#일본서버" : "#한국서버"}
          </span>
          {video.isShorts && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              #Shorts
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
