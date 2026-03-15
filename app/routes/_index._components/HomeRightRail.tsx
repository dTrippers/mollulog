import dayjs from "dayjs";
import type { HomeYoutubeChannelSection } from "~/models/youtube";
import { Button, HorizontalScroll } from "~/components/primitives";

type HomeRightRailProps = {
  youtubeSections: HomeYoutubeChannelSection[];
};

const channelLinks = [
  {
    text: "일본 서버 채널",
    href: "https://www.youtube.com/@BlueArchive_JP",
  },
  {
    text: "한국 서버 채널",
    href: "https://www.youtube.com/@bluearchive_kr",
  },
] as const;

export default function HomeRightRail({ youtubeSections }: HomeRightRailProps) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-24">
      <HomeYoutubeSection youtubeSections={youtubeSections} />
    </aside>
  );
}

function HomeYoutubeSection({ youtubeSections }: HomeRightRailProps) {
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
    <section className="rounded-2xl border border-neutral-200 bg-neutral-50/80 mt-4 p-4 dark:border-neutral-800 dark:bg-neutral-900/80">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">공식 유튜브 최근 영상</h2>
      </div>
      <div className="mt-4 space-y-5">
        {videos.length === 0 ? (
          <div className="py-6 text-sm text-neutral-500 dark:text-neutral-400">
            최근 영상을 불러오지 못했어요. 잠시 후 다시 시도해주세요.
          </div>
        ) : (
          <>
            <div className="lg:hidden -mx-4">
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
        <div className="grid grid-cols-2 gap-2 pt-1">
          {channelLinks.map((channel) => (
            <Button
              key={channel.href}
              text={channel.text}
              href={channel.href}
              target="_blank"
              variant="tint"
              fullWidth
              className="justify-center"
            />
          ))}
        </div>
      </div>
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
