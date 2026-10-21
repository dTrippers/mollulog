import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  PlayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/16/solid";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import BlurhashPlaceholder from "~/components/media/BlurhashPlaceholder";
import HaloModeNotice from "~/components/media/HaloModeNotice";
import { useHaloMode } from "~/contexts/HaloModeContext";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import type { RunType, TimelineContentType, TimelineContentVideo } from "~/domain/timeline-content";
import {
  formatInstant,
  isInstantAfter,
  isInstantBefore,
  nowUtcIso,
  parseUtcTimestamp,
  type UtcIsoString,
} from "~/lib/date-time";
import { cn } from "~/lib/utils";
import { relativeTime, timelineContentTypeLocale } from "~/locales/ko";
import { uploadedImageProps } from "~/models/assets";

type YouTubePlayer = {
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getDuration: () => number;
  stopVideo: () => void;
};

type YouTubeEvent = { target: YouTubePlayer };

export function EventHero({
  imageUrl,
  imageBlurhash = null,
  name,
  type,
  runType,
  since,
  until,
  endless,
  videos,
}: {
  imageUrl: string | null;
  imageBlurhash?: string | null;
  name: string;
  type: TimelineContentType;
  runType: RunType;
  since: UtcIsoString;
  until: UtcIsoString | null;
  endless: boolean;
  videos: TimelineContentVideo[];
}) {
  const { haloMode } = useHaloMode();
  const timeZone = useDisplayTimeZone();
  const now = nowUtcIso();
  const [currentVideo, setCurrentVideo] = useState<TimelineContentVideo | null>(videos[0] ?? null);
  // The video does not autoplay. It loads only after the viewer asks for playback.
  const [playRequested, setPlayRequested] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCurrentVideo(videos[0] ?? null);
    setVideoPlaying(false);
    setPlayRequested(false);
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
  }, [videos]);

  // Turning halo mode on stops a playing video, so the artwork does not stay on screen.
  const previousHaloMode = useRef(haloMode);
  useEffect(() => {
    const wasEnabled = previousHaloMode.current;
    previousHaloMode.current = haloMode;
    if (!haloMode || wasEnabled) return;
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    endTimerRef.current = null;
    playerRef.current?.stopVideo();
    playerRef.current = null;
    setVideoPlaying(false);
    setPlayRequested(false);
  }, [haloMode]);

  useEffect(() => {
    if (!playerRef.current) return;
    if (muted) {
      playerRef.current.mute();
    } else {
      playerRef.current.unMute();
      playerRef.current.setVolume(30);
    }
  }, [muted]);

  useEffect(
    () => () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    },
    [],
  );

  let timeLabel: string | null = null;
  if (isInstantAfter(since, now)) {
    timeLabel = `${relativeTime(parseUtcTimestamp(since), { timeZone })} 시작`;
  } else if (!endless && until && isInstantAfter(until, now)) {
    timeLabel = `${relativeTime(parseUtcTimestamp(until), { timeZone })} 종료`;
  }

  const formattedSince = formatInstant(since, { timeZone, format: "YYYY-MM-DD" });
  const dateRange = endless
    ? formattedSince
    : `${formattedSince} ~ ${until ? formatInstant(until, { timeZone, format: "YYYY-MM-DD" }) : ""}`;
  const selectVideo = (video: TimelineContentVideo) => {
    if (video.youtube !== currentVideo?.youtube) {
      setVideoPlaying(false);
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    setCurrentVideo(video);
    setPlayRequested(true);
  };

  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-v2-inset">
        {playRequested && currentVideo ? (
          <Suspense>
            <div className="absolute inset-0 overflow-hidden">
              <YouTube
                key={currentVideo.youtube}
                videoId={currentVideo.youtube}
                className="size-full"
                iframeClassName="size-full"
                opts={{ playerVars: { autoplay: 1, mute: 1, controls: 0, rel: 0, start: currentVideo.start ?? 0 } }}
                onReady={(event: YouTubeEvent) => {
                  playerRef.current = event.target;
                  setMuted(true);
                  event.target.setVolume(30);
                }}
                onPlay={(event: YouTubeEvent) => {
                  if (endTimerRef.current) clearTimeout(endTimerRef.current);
                  setVideoPlaying(true);
                  endTimerRef.current = setTimeout(
                    () => setVideoPlaying(false),
                    Math.max(0, event.target.getDuration() - (currentVideo.start ?? 0) - 1) * 1000,
                  );
                }}
                onEnd={() => {
                  if (endTimerRef.current) clearTimeout(endTimerRef.current);
                  endTimerRef.current = null;
                  setVideoPlaying(false);
                  setPlayRequested(false);
                  playerRef.current = null;
                }}
              />
            </div>
          </Suspense>
        ) : null}

        {imageUrl && haloMode ? (
          <BlurhashPlaceholder
            blurhash={imageBlurhash}
            className={cn(
              "transition-opacity duration-v2-base",
              videoPlaying ? "opacity-0" : "opacity-100",
            )}
          />
        ) : imageUrl ? (
          <img
            {...uploadedImageProps(imageUrl, "(min-width: 768px) 768px, 100vw")}
            alt={name}
            className={cn(
              "absolute inset-0 size-full object-cover transition-opacity duration-v2-base",
              videoPlaying ? "opacity-0" : "opacity-100",
            )}
          />
        ) : null}

        {haloMode && imageUrl && !videoPlaying ? <HaloModeNotice placement="top-start" /> : null}

        {videos.length > 0 ? (
          <button
            type="button"
            aria-label={playRequested ? (muted ? "동영상 소리 켜기" : "동영상 음소거") : "동영상 재생"}
            className="absolute top-0 right-0 z-20 m-4 flex size-8 items-center justify-center rounded-full bg-v2-scrim text-v2-on-media backdrop-blur-sm hover:opacity-80"
            onClick={() => (playRequested ? setMuted((value) => !value) : setPlayRequested(true))}
          >
            {!playRequested ? (
              <PlayIcon className="size-4" />
            ) : muted ? (
              <SpeakerXMarkIcon className="size-4" />
            ) : (
              <SpeakerWaveIcon className="size-4" />
            )}
          </button>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-v2-scrim via-v2-scrim/80 via-75% to-transparent p-4 text-v2-on-media">
          <span className="text-sm md:text-base">{timelineContentTypeLocale[type]}</span>
          <h2 className="my-1 whitespace-pre-line text-xl font-bold md:text-2xl">{name}</h2>
          <div className="flex flex-wrap items-end gap-1.5">
            <p className="grow text-xs text-v2-on-media/80 md:text-sm">{dateRange}</p>
            {runType === "rerun" ? <HeroBadge>복각</HeroBadge> : null}
            {runType === "permanent" ? <HeroBadge>상설</HeroBadge> : null}
            {timeLabel ? <HeroBadge showRedDot={isInstantBefore(since, now)}>{timeLabel}</HeroBadge> : null}
            {!endless && until && isInstantBefore(until, now) ? <HeroBadge>종료</HeroBadge> : null}
          </div>
        </div>
      </div>

      {videos.length > 0 ? <EventVideoRail videos={videos} currentVideo={currentVideo} onSelect={selectVideo} /> : null}
    </div>
  );
}

function HeroBadge({ children, showRedDot = false }: { children: ReactNode; showRedDot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-v2-on-media/20 bg-v2-scrim px-2 py-1 text-xs text-v2-on-media backdrop-blur-sm md:px-3 md:text-sm">
      {showRedDot ? <span className="size-2 animate-pulse rounded-full bg-v2-danger" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

function EventVideoRail({
  videos,
  currentVideo,
  onSelect,
}: {
  videos: TimelineContentVideo[];
  currentVideo: TimelineContentVideo | null;
  onSelect: (video: TimelineContentVideo) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!currentVideo || !railRef.current) return;
    const index = videos.findIndex((video) => video.youtube === currentVideo.youtube);
    const target = railRef.current.children[index] as HTMLElement | undefined;
    if (target) railRef.current.scrollTo({ left: target.offsetLeft - 40, behavior: "smooth" });
  }, [currentVideo, videos]);

  const step = (difference: -1 | 1) => {
    if (!currentVideo) return;
    const currentIndex = videos.findIndex((video) => video.youtube === currentVideo.youtube);
    const nextIndex = (currentIndex + difference + videos.length) % videos.length;
    onSelect(videos[nextIndex]);
  };

  return (
    <div className="relative my-2 w-full md:my-4">
      <div ref={railRef} className="flex flex-nowrap overflow-x-auto px-10 [scrollbar-width:none]">
        {videos.map((video) => (
          <button
            key={video.youtube}
            type="button"
            aria-pressed={currentVideo?.youtube === video.youtube}
            className={cn(
              "-mx-1 shrink-0 rounded-lg px-4 py-2 text-sm text-v2-fg-secondary transition-colors hover:bg-v2-hover",
              currentVideo?.youtube === video.youtube && "bg-v2-hover font-bold text-v2-fg",
            )}
            onClick={() => onSelect(video)}
          >
            {video.title}
          </button>
        ))}
      </div>
      <div className="absolute inset-y-0 left-0 flex w-8 items-center justify-center bg-v2-canvas">
        <button
          type="button"
          aria-label="이전 동영상"
          onClick={() => step(-1)}
          className="rounded-full p-1 text-v2-fg hover:bg-v2-hover"
        >
          <ChevronDoubleLeftIcon className="size-6" />
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 flex w-8 items-center justify-center bg-v2-canvas">
        <button
          type="button"
          aria-label="다음 동영상"
          onClick={() => step(1)}
          className="rounded-full p-1 text-v2-fg hover:bg-v2-hover"
        >
          <ChevronDoubleRightIcon className="size-6" />
        </button>
      </div>
    </div>
  );
}
