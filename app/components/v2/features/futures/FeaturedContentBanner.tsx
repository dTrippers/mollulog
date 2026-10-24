import { ArrowDownIcon, XMarkIcon } from "@heroicons/react/16/solid";
import { cn } from "~/lib/utils";
import { selectFutureMediaSource } from "~/domain/futures/futures-view-model";
import { v2FocusRing } from "../../layout/styles";
import { ContentMedia } from "./ContentMedia";
import { getFutureMediaTypeLabel } from "./labels";
import type { FutureViewContent } from "./types";

type FeaturedContentBannerProps = {
  content: FutureViewContent;
  onJump: () => void;
};

function FeaturedContentText({ content }: { content: FutureViewContent }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm leading-5 font-semibold text-v2-fg">새로운 컨텐츠가 추가됐어요</span>
      <span className="block truncate text-xs leading-4 text-v2-fg-secondary">
        {content.name.replace(/\r?\n/g, " ")}
      </span>
    </span>
  );
}

function FeaturedContentMedia({ content }: { content: FutureViewContent }) {
  return (
    <ContentMedia
      source={
        selectFutureMediaSource({
          hidden: content.isSpoiler,
          isRaid: content.raid !== null,
          boss: content.raid?.boss ?? null,
          logoContentUid: content.logoContentUid,
        })
      }
      contentType={content.contentType}
      typeLabel={getFutureMediaTypeLabel(content)}
      size="row"
    />
  );
}

export function ScrollDownCue({ size }: { size: "desktop" | "mobile" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "v2-featured-cue inline-flex shrink-0 items-center justify-center rounded-md bg-v2-accent text-v2-on-accent",
        size === "desktop" ? "-ml-2 size-5" : "size-7",
      )}
    >
      <ArrowDownIcon className={size === "desktop" ? "size-3.5" : "size-4"} />
    </span>
  );
}

export function FeaturedContentAsideBlock({ content, onJump }: FeaturedContentBannerProps) {
  return (
    <div className="rounded-lg bg-v2-accent-subtle p-2">
      <button
        type="button"
        onClick={onJump}
        className={cn(
          "v2-featured-banner flex min-h-v2-row-min w-full items-center gap-v2-media-gap rounded-md pl-v2-row-x pr-1 py-v2-row-y text-left hover:bg-v2-hover",
          v2FocusRing,
        )}
      >
        <FeaturedContentMedia content={content} />
        <FeaturedContentText content={content} />
        <ScrollDownCue size="desktop" />
      </button>
    </div>
  );
}

export function FeaturedContentFloatingBanner({
  content,
  onJump,
  onDismiss,
}: FeaturedContentBannerProps & { onDismiss: () => void }) {
  return (
    <div className="flex h-14 w-full min-w-0 items-center gap-0.5 rounded-lg bg-v2-accent-subtle p-1 shadow-lg">
      <button
        type="button"
        onClick={onJump}
        className={cn(
          "v2-featured-banner flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left hover:bg-v2-hover",
          v2FocusRing,
        )}
      >
        <ScrollDownCue size="mobile" />
        <FeaturedContentText content={content} />
      </button>
      <button
        type="button"
        aria-label="닫기"
        onClick={onDismiss}
        className={cn(
          "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md text-v2-fg-tertiary before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] hover:bg-v2-hover hover:text-v2-fg",
          v2FocusRing,
        )}
      >
        <XMarkIcon className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ContentHighlightOverlay({ animationKey }: { animationKey: number }) {
  return (
    <span
      key={animationKey}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-v2-highlight opacity-0 v2-panel-highlight"
    />
  );
}
