import { CheckIcon, HeartIcon, ShareIcon } from "@heroicons/react/16/solid";
import { HeartIcon as HeartOutlineIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import type { LikeChangedActionResult } from "~/domain/like";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { cn } from "~/lib/utils";
import { Button } from "../../primitives/Button";

// The like toggle of a guide. It counts at once and the server answer corrects it. An author cannot like their own
// guide, so for them it only shows the count.
export function WalkthroughLikeButton({
  timelineUid,
  liked: initialLiked,
  likeCount: initialLikeCount,
  signedIn,
  canLike,
  className,
}: {
  timelineUid: string;
  liked: boolean;
  likeCount: number;
  signedIn: boolean;
  canLike: boolean;
  className?: string;
}) {
  const { showSignIn } = useSignIn();
  const fetcher = useFetcher<LikeChangedActionResult>();
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);

  useEffect(() => {
    setLiked(initialLiked);
    setLikeCount(initialLikeCount);
  }, [initialLiked, initialLikeCount]);

  useEffect(() => {
    if (fetcher.data?.kind === "likeChanged" && fetcher.data.targetUid === timelineUid) {
      setLiked(fetcher.data.liked);
      setLikeCount(fetcher.data.likeCount);
    }
  }, [fetcher.data, timelineUid]);

  const toggle = () => {
    if (!signedIn) {
      showSignIn();
      return;
    }
    const next = !liked;
    if (next && !canLike) return;
    setLiked(next);
    setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    fetcher.submit(
      { liked: next },
      { action: `/api/timelines/${timelineUid}/likes`, method: "post", encType: "application/json" },
    );
  };

  return (
    <Button
      size="sm"
      onClick={toggle}
      disabled={fetcher.state === "submitting" || (signedIn && !liked && !canLike)}
      aria-label={`좋아요 ${likeCount}개`}
      aria-pressed={liked}
      className={cn("tabular-nums", className)}
    >
      {liked ? (
        <HeartIcon className="size-4 text-v2-favorite" aria-hidden="true" />
      ) : (
        <HeartOutlineIcon className="size-4" aria-hidden="true" />
      )}
      {likeCount}
    </Button>
  );
}

// Shares the guide's address through the system share sheet, or copies it where there is none.
export function WalkthroughShareButton({
  url,
  title,
  iconOnly = false,
  className,
}: {
  url: string;
  title: string;
  iconOnly?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const show = (next: "copied" | "error") => {
    setState(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 2000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      show("copied");
      trackGoogleAnalyticsEvent("share", { content_type: "timeline", method: "copy" });
    } catch {
      show("error");
    }
  };
  const share = async () => {
    if (typeof navigator.share !== "function") {
      await copy();
      return;
    }
    try {
      await navigator.share({ title, text: title, url });
      trackGoogleAnalyticsEvent("share", { content_type: "timeline", method: "native" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      await copy();
    }
  };
  const label = state === "copied" ? "링크 복사됨" : state === "error" ? "공유 실패 · 다시 시도" : "공유하기";
  return (
    <>
      <Button size="sm" onClick={() => void share()} aria-label={iconOnly ? label : undefined} className={className}>
        {state === "copied" ? (
          <CheckIcon className="size-4" aria-hidden="true" />
        ) : (
          <ShareIcon className="size-4" aria-hidden="true" />
        )}
        {iconOnly ? null : label}
      </Button>
      <span className="sr-only" role="status">
        {state === "copied" ? "공략 링크를 복사했어요." : state === "error" ? "공략 링크를 복사하지 못했어요." : ""}
      </span>
    </>
  );
}
