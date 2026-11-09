import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import { EyeSlashIcon } from "@heroicons/react/24/outline";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import YouTube from "react-youtube";
import BlurhashPlaceholder from "~/components/media/BlurhashPlaceholder";
import { useHaloMode } from "~/contexts/HaloModeContext";
import type { TimelineContentVideo } from "~/domain/timeline-content";
import { cn } from "~/lib/utils";
import { uploadedImageProps } from "~/models/assets";

type YouTubePlayer = {
  mute: () => void;
  unMute: () => void;
  setVolume: (volume: number) => void;
  stopVideo: () => void;
};

type YouTubeEvent = { target: YouTubePlayer };

const mediaButton =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-v2-on-media hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus";

export type EventOverviewHeroPeriod = {
  runType: string | null;
  period: string;
  status: { kind: "ended" | "upcoming" | "ongoing"; text: string };
};

// The overview artwork. The overview hides the page header, so the artwork carries the type, name, and period.
// Videos load only after the viewer asks for one. They start muted, and the last video's next control wraps to the first.
export function EventOverviewHero({
  imageUrl,
  imageBlurhash = null,
  name,
  typeLabel,
  period,
  videos,
}: {
  imageUrl: string | null;
  imageBlurhash?: string | null;
  name: string;
  typeLabel: string;
  period: EventOverviewHeroPeriod;
  videos: TimelineContentVideo[];
}) {
  const { haloMode } = useHaloMode();
  const [videoIndex, setVideoIndex] = useState<number | null>(null);
  const [muted, setMuted] = useState(true);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const currentVideo = videoIndex === null ? null : (videos[videoIndex] ?? null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new video list closes the player that showed the old one.
  useEffect(() => {
    setVideoIndex(null);
    playerRef.current = null;
  }, [videos]);

  // Turning halo mode on stops a playing video, so the artwork does not stay on screen.
  useEffect(() => {
    if (!haloMode) return;
    playerRef.current?.stopVideo();
    playerRef.current = null;
    setVideoIndex(null);
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

  const closeVideo = () => {
    playerRef.current = null;
    setVideoIndex(null);
  };
  const step = (difference: -1 | 1) => {
    if (videoIndex === null) return;
    playerRef.current = null;
    setVideoIndex((videoIndex + difference + videos.length) % videos.length);
  };

  return (
    <div
      data-region="overview-hero"
      className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-lg bg-v2-inset"
    >
      {haloMode ? (
        <>
          {imageUrl ? <BlurhashPlaceholder blurhash={imageBlurhash} /> : null}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-v2-scrim/50 pb-16 text-v2-on-media">
            <EyeSlashIcon className="size-6" aria-hidden="true" />
            <p className="text-sm font-semibold">헤일로 모드를 사용 중이에요</p>
            <Link to="/more" className="text-xs font-medium underline underline-offset-2 hover:opacity-80">
              설정에서 바꾸기
            </Link>
          </div>
          <HeroCaption name={name} typeLabel={typeLabel} period={period} />
        </>
      ) : currentVideo ? (
        <div className="absolute inset-0 bg-v2-scrim">
          {imageUrl ? (
            <img
              {...uploadedImageProps(imageUrl, "(min-width: 768px) 640px, 100vw")}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-35"
            />
          ) : null}
          <Suspense>
            <YouTube
              key={currentVideo.youtube}
              videoId={currentVideo.youtube}
              title={currentVideo.title}
              className="absolute inset-0 size-full"
              iframeClassName="size-full"
              opts={{ playerVars: { autoplay: 1, mute: 1, controls: 0, rel: 0, start: currentVideo.start ?? 0 } }}
              onReady={(event: YouTubeEvent) => {
                playerRef.current = event.target;
                if (muted) {
                  event.target.mute();
                } else {
                  event.target.unMute();
                  event.target.setVolume(30);
                }
              }}
              onEnd={closeVideo}
            />
          </Suspense>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-v2-scrim to-transparent px-3 py-2.5 text-v2-on-media">
            <div className="flex items-center gap-2">
              {videos.length > 1 ? (
                <button
                  type="button"
                  aria-label="이전 영상"
                  onClick={() => step(-1)}
                  className={cn(mediaButton, "bg-v2-on-media/15 px-1.5")}
                >
                  <ChevronLeftIcon className="size-4" aria-hidden="true" />
                </button>
              ) : null}
              <span className="text-sm font-semibold tabular-nums" aria-live="polite">
                <span className="sr-only">{currentVideo.title} · </span>
                {(videoIndex ?? 0) + 1} / {videos.length}
              </span>
              {videos.length > 1 ? (
                <button
                  type="button"
                  aria-label="다음 영상"
                  onClick={() => step(1)}
                  className={cn(mediaButton, "bg-v2-on-media/15 px-1.5")}
                >
                  <ChevronRightIcon className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-pressed={!muted}
                onClick={() => setMuted((value) => !value)}
                className={cn(mediaButton, "px-1.5")}
              >
                {muted ? (
                  <SpeakerXMarkIcon className="size-4" aria-hidden="true" />
                ) : (
                  <SpeakerWaveIcon className="size-4" aria-hidden="true" />
                )}
                {muted ? "소리 꺼짐" : "소리 켜짐"}
              </button>
              <button type="button" onClick={closeVideo} className={cn(mediaButton, "bg-v2-on-media/15")}>
                <XMarkIcon className="size-4" aria-hidden="true" />
                일러스트로
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {imageUrl ? (
            <img
              {...uploadedImageProps(imageUrl, "(min-width: 768px) 640px, 100vw")}
              alt={name}
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          <HeroCaption name={name} typeLabel={typeLabel} period={period} />
          {videos.length > 0 ? (
            <button
              type="button"
              onClick={() => setVideoIndex(0)}
              className={cn(mediaButton, "absolute top-3 right-3 bg-v2-scrim")}
            >
              <PlayIcon className="size-4" aria-hidden="true" />
              이벤트 영상 {videos.length}개
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

// The type, name, and period over the bottom of the artwork, on a scrim so they read on any illustration.
function HeroCaption({
  name,
  typeLabel,
  period,
}: {
  name: string;
  typeLabel: string;
  period: EventOverviewHeroPeriod;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-v2-scrim via-v2-scrim/80 via-70% to-transparent px-4 pt-10 pb-4 text-v2-on-media md:px-5 md:pb-5">
      <p className="text-xs font-medium text-v2-on-media/80 md:text-sm">{typeLabel}</p>
      <h2 className="mt-1 text-xl font-bold md:text-2xl">{name}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs tabular-nums md:text-sm">
        <span className="mr-1 text-v2-on-media/85">{period.period}</span>
        {period.runType ? <HeroBadge>{period.runType}</HeroBadge> : null}
        <HeroBadge>
          {period.status.kind === "ongoing" ? (
            <span className="size-[7px] shrink-0 rounded-full bg-v2-success" aria-hidden="true" />
          ) : null}
          {period.status.text}
        </HeroBadge>
      </div>
    </div>
  );
}

function HeroBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-v2-on-media/20 bg-v2-scrim px-2.5 text-xs font-medium text-v2-on-media backdrop-blur-sm">
      {children}
    </span>
  );
}
