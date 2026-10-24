import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  PlayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
} from "@heroicons/react/16/solid";
import { Suspense, useEffect, useRef, useState } from "react";
import YouTube from "react-youtube";
import { MultilineText } from "~/components/primitives";
import BlurhashPlaceholder from "~/components/primitives/BlurhashPlaceholder";
import HaloModeNotice from "~/components/primitives/HaloModeNotice";
import { useHaloMode } from "~/contexts/HaloModeContext";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
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
import type { TimelineContentType } from "~/models/timeline-content";

type Video = {
  title: string;
  youtube: string;
  start: number | null;
};

type YouTubePlayer = {
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  getDuration: () => number;
  stopVideo: () => void;
};

type YouTubeEvent = {
  target: YouTubePlayer;
};

type EventHeaderProps = {
  imageUrl: string | null;
  imageBlurhash?: string | null;
  name: string;
  type: TimelineContentType;
  runType: "first" | "rerun" | "permanent";
  since: UtcIsoString;
  until: UtcIsoString | null;
  endless: boolean;

  videos?: Video[];
};

function EventHeaderPlayButton({ onPlay }: { onPlay: () => void }) {
  return (
    <button
      type="button"
      aria-label="영상 재생"
      title="영상 재생"
      className="p-2 rounded-full bg-neutral-900/75 hover:bg-neutral-700/75 transition backdrop-blur-sm text-white"
      onClick={onPlay}
    >
      <PlayIcon className="size-4" />
    </button>
  );
}

export default function EventHeader({
  imageUrl,
  imageBlurhash,
  name,
  type,
  runType,
  since,
  until,
  endless,
  videos,
}: EventHeaderProps) {
  const { haloMode } = useHaloMode();
  const displayTimeZone = useDisplayTimeZone();
  const now = nowUtcIso();

  // Calculate remaining time
  let timeLabel = null;
  if (isInstantAfter(since, now)) {
    timeLabel = `${relativeTime(parseUtcTimestamp(since), { timeZone: displayTimeZone })} 시작`;
  } else if (!endless && until && isInstantAfter(until, now)) {
    timeLabel = `${relativeTime(parseUtcTimestamp(until), { timeZone: displayTimeZone })} 종료`;
  }

  // States about videos
  const [currentVideo, setCurrentVideo] = useState<Video | null>(videos?.[0] ?? null);
  const [playRequested, setPlayRequested] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    if (!playerRef.current) return;
    if (muted) playerRef.current.mute();
    else {
      playerRef.current.unMute();
      playerRef.current.setVolume(30);
    }
  }, [muted]);

  useEffect(() => {
    return () => {
      if (videoEndTimer.current) clearTimeout(videoEndTimer.current);
    };
  }, []);

  const previousHaloMode = useRef(haloMode);
  useEffect(() => {
    const wasEnabled = previousHaloMode.current;
    previousHaloMode.current = haloMode;
    if (!haloMode || wasEnabled) return;
    if (videoEndTimer.current) clearTimeout(videoEndTimer.current);
    videoEndTimer.current = null;
    playerRef.current?.stopVideo();
    playerRef.current = null;
    setVideoPlaying(false);
    setPlayRequested(false);
  }, [haloMode]);

  useEffect(() => {
    setCurrentVideo(videos?.[0] ?? null);
  }, [videos]);

  let aspectRatioClass = "";
  if (!imageUrl) {
    aspectRatioClass = "";
  } else if (videos && videos.length > 0) {
    aspectRatioClass = "aspect-video";
  } else {
    aspectRatioClass = "aspect-video md:aspect-2/1";
  }

  return (
    <>
      <div className={`relative overflow-hidden rounded-lg ${aspectRatioClass}`}>
        {/* Videos */}
        {playRequested && currentVideo && (
          <Suspense>
            <div className="absolute top-0 left-0 h-full w-full overflow-hidden md:rounded-lg">
              <YouTube
                videoId={currentVideo.youtube}
                className="w-full h-full"
                iframeClassName="w-full h-full -z-10"
                opts={{
                  playerVars: { autoplay: 1, mute: 1, controls: 0, rel: 0, start: currentVideo.start ?? 0 },
                }}
                onReady={(ytEvent: YouTubeEvent) => {
                  playerRef.current = ytEvent.target;
                  setMuted(true);
                  ytEvent.target.setVolume(30);
                }}
                onPlay={(ytEvent: YouTubeEvent) => {
                  if (videoEndTimer.current) clearTimeout(videoEndTimer.current);
                  setVideoPlaying(true);
                  videoEndTimer.current = setTimeout(
                    () => setVideoPlaying(false),
                    Math.max(0, ytEvent.target.getDuration() - (currentVideo.start ?? 0) - 1) * 1000,
                  );
                }}
                onEnd={() => {
                  if (videoEndTimer.current) clearTimeout(videoEndTimer.current);
                  videoEndTimer.current = null;
                  setVideoPlaying(false);
                  setPlayRequested(false);
                  playerRef.current = null;
                }}
              />
            </div>
          </Suspense>
        )}

        {/* Background Image */}
        {imageUrl && haloMode ? (
          <BlurhashPlaceholder
            blurhash={imageBlurhash}
            className={cn("transition-opacity duration-500", videoPlaying ? "opacity-0" : "opacity-100")}
          />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className={`absolute top-0 left-0 w-full h-full object-cover transition-opacity duration-500 ${videoPlaying ? "opacity-0" : "opacity-100"}`}
          />
        ) : null}

        {haloMode && imageUrl && !videoPlaying ? (
          <HaloModeNotice />
        ) : null}

        {/* Action Buttons */}
        <div className="absolute top-0 right-0 z-20 p-4 flex items-center gap-2">
          {videos && videos.length > 0 ? (
            playRequested ? (
              <button
                type="button"
                aria-label={muted ? "음소거 해제" : "음소거"}
                className="p-2 rounded-full bg-neutral-900/75 hover:bg-neutral-700/75 transition backdrop-blur-sm text-white"
                onClick={() => setMuted((prev) => !prev)}
              >
                {muted ? <SpeakerXMarkIcon className="size-4" /> : <SpeakerWaveIcon className="size-4" />}
              </button>
            ) : (
              <EventHeaderPlayButton onPlay={() => setPlayRequested(true)} />
            )
          ) : null}
        </div>

        {/* Content Info */}
        <div
          className={`p-4 ${imageUrl ? "absolute bottom-0 left-0 right-0 text-white bg-linear-to-t from-black/80 via-black/60 to-transparent via-75%" : "bg-linear-to-br from-neutral-900 via-neutral-800 to-neutral-700 via-75%"}`}
        >
          {/* Event Type and Status */}
          <span className="text-sm md:text-base text-white">{timelineContentTypeLocale[type]}</span>

          {/* Event Name */}
          <h3 className="my-1">
            <MultilineText className="text-xl md:text-2xl font-bold text-white" texts={name.split("\n")} />
          </h3>

          <div className="flex items-end gap-1">
            <p className="grow text-xs md:text-sm text-neutral-300">
              {endless
                ? formatInstant(since, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })
                : `${formatInstant(since, { timeZone: displayTimeZone, format: "YYYY-MM-DD" })} ~ ${
                    until ? formatInstant(until, { timeZone: displayTimeZone, format: "YYYY-MM-DD" }) : ""
                  }`}
            </p>
            {runType === "rerun" && <Label text="복각" />}
            {runType === "permanent" && <Label text="상설" />}
            {timeLabel && <Label text={timeLabel} showRedDot={isInstantBefore(since, now)} />}
            {!endless && until && isInstantBefore(until, now) && <Label text="종료" />}
          </div>
        </div>
      </div>

      {videos && videos.length > 0 && (
        <VideoList
          videos={videos}
          currentVideo={currentVideo}
          onVideoSelect={(video) => {
            if (videoEndTimer.current) clearTimeout(videoEndTimer.current);
            videoEndTimer.current = null;
            setCurrentVideo(video);
            setVideoPlaying(false);
            setPlayRequested(true);
          }}
        />
      )}
    </>
  );
}

function Label({ text, showRedDot = false }: { text: string; showRedDot?: boolean }): React.ReactNode {
  return (
    <span className="flex items-center gap-1.5 px-2 md:px-3 py-1 text-xs md:text-sm bg-black/40 backdrop-blur-sm rounded-full text-white border border-white/20">
      {showRedDot && <div className="size-2 bg-red-500 rounded-full animate-pulse" />}
      {text}
    </span>
  );
}

type VideoListProps = {
  videos: Video[];
  currentVideo: Video | null;
  onVideoSelect: (video: Video) => void;
};

function VideoList({ videos, currentVideo, onVideoSelect }: VideoListProps): React.ReactNode {
  const videoListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!currentVideo || !videoListRef.current) {
      return;
    }

    const targetIndex = videos.findIndex((video) => video.youtube === currentVideo.youtube);
    const target = videoListRef.current.children[targetIndex] as HTMLElement | undefined;
    if (!target) {
      return;
    }

    videoListRef.current.scrollTo({
      left: target.offsetLeft - 40,
      behavior: "smooth",
    });
  }, [currentVideo, videos]);

  const changeVideo = (indexDiff: 1 | -1) => {
    if (!currentVideo) {
      return;
    }

    const newIndex =
      (videos.findIndex((video) => video.youtube === currentVideo.youtube) + indexDiff + videos.length) % videos.length;
    onVideoSelect(videos[newIndex]);
  };

  return (
    <div className="w-full my-2 md:my-4 relative">
      <div className="w-full px-10 flex flex-nowrap overflow-x-scroll no-scrollbar" ref={videoListRef}>
        {videos.map((video) => (
          <button
            type="button"
            key={video.youtube}
            className={cn(`
              -mx-1 shrink-0 rounded-lg px-4 py-2 text-sm transition-colors hover:bg-muted
              ${currentVideo?.youtube === video.youtube ? "bg-muted font-bold" : ""}
            `)}
            onClick={() => onVideoSelect(video)}
          >
            {video.title}
          </button>
        ))}
      </div>
      <div className="absolute top-0 left-0 flex h-full w-8 items-center justify-center bg-background">
        <button
          type="button"
          onClick={() => changeVideo(-1)}
          className="p-1 hover:bg-black hover:text-white rounded-full transition"
        >
          <ChevronDoubleLeftIcon className="size-6" strokeWidth={2} />
        </button>
      </div>
      <div className="absolute top-0 right-0 flex h-full w-8 items-center justify-center bg-background">
        <button
          type="button"
          onClick={() => changeVideo(1)}
          className="p-1 hover:bg-black hover:text-white rounded-full transition"
        >
          <ChevronDoubleRightIcon className="size-6" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
