import {
  BookOpenIcon,
  CalendarDaysIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TvIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { FutureMediaSource } from "~/domain/futures/futures-view-model";
import { cn } from "~/lib/utils";
import { bossImageUrl, eventIconImageUrl } from "~/models/assets";
import type { EventType, RaidType } from "~/models/content.d";
import { useImageFailure } from "../../primitives/use-image-failure";

export type ContentMediaSize = "timeline" | "row" | "table";

const sizeClassName: Record<ContentMediaSize, string> = {
  timeline: "size-10 md:size-11 lg:size-12",
  row: "size-8",
  table: "size-7 lg:size-9",
};

const iconSizeClassName: Record<ContentMediaSize, string> = {
  timeline: "size-5 md:size-[1.375rem]",
  row: "size-4 lg:size-3.5",
  table: "size-3.5",
};

const typeIcon: Record<string, typeof CalendarDaysIcon> = {
  live: TvIcon,
  main_story: BookOpenIcon,
  mini_story: BookOpenIcon,
  campaign: MegaphoneIcon,
  joint_firing_drill: ViewfinderCircleIcon,
  pickup: SparklesIcon,
  fes: SparklesIcon,
  collab: SparklesIcon,
  raid: ShieldCheckIcon,
  total_assault: ShieldCheckIcon,
  elimination: ShieldCheckIcon,
  unlimit: ShieldCheckIcon,
  allied: ShieldCheckIcon,
};

export function getContentTypeIcon(contentType: EventType | RaidType) {
  return typeIcon[contentType] ?? CalendarDaysIcon;
}

// Square media. A logo falls back from kr to jp, then to the type icon. A boss image crops to a fixed focus. A hidden
// spoiler shows an empty neutral placeholder, never a blurred image. Every failure, including one that happened before
// hydration, resolves to the next source, so a broken image is never left on the page. The type icon fills the frame
// while an image loads, then disappears when the image is ready; a transparent logo never sits on a filled square.
// The image stays invisible until it loads, so a failing source never flashes the browser's broken-image mark.
export function ContentMedia({
  source,
  contentType,
  typeLabel,
  size,
}: {
  source: FutureMediaSource;
  contentType: EventType | RaidType;
  typeLabel: string;
  size: ContentMediaSize;
}) {
  const [logoLocale, setLogoLocale] = useState<"kr" | "jp">("kr");
  const [exhausted, setExhausted] = useState(false);
  const src =
    source.kind === "boss"
      ? bossImageUrl(source.boss)
      : source.kind === "logo"
        ? (eventIconImageUrl(source.contentUid, logoLocale) ?? null)
        : null;
  const image = useImageFailure(src);
  const frameClassName = cn("relative block shrink-0 overflow-hidden rounded-md", sizeClassName[size]);
  const boxClassName = cn(frameClassName, "bg-v2-inset");
  const Icon = getContentTypeIcon(contentType);

  useEffect(() => {
    if (!image.failed) return;
    if (source.kind === "logo" && logoLocale === "kr") {
      setLogoLocale("jp");
      return;
    }
    setExhausted(true);
  }, [image.failed, source.kind, logoLocale]);

  if (source.kind === "placeholder") {
    return <span aria-hidden="true" className={boxClassName} />;
  }

  if (source.kind === "type" || exhausted || src === null) {
    return (
      <span role="img" aria-label={typeLabel} className={cn(boxClassName, "flex items-center justify-center")}>
        <Icon className={cn(iconSizeClassName[size], "text-v2-fg-tertiary")} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className={image.loaded ? frameClassName : boxClassName}>
      {!image.loaded ? (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center">
          <Icon className={cn(iconSizeClassName[size], "text-v2-fg-tertiary")} />
        </span>
      ) : null}
      <img
        ref={image.ref}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={image.onError}
        onLoad={image.onLoad}
        className={cn(
          "size-full object-cover",
          source.kind === "boss" && "object-[50%_30%]",
          !image.loaded && "opacity-0",
        )}
      />
    </span>
  );
}
