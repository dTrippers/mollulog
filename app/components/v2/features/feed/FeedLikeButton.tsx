import { HeartIcon } from "@heroicons/react/16/solid";
import { HeartIcon as HeartOutlineIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import type { LikeChangedActionResult } from "~/domain/like";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";

// The like toggle of a feed post. It counts at once and the server answer corrects it.
export function FeedLikeButton({
  targetUid,
  action,
  liked: initialLiked,
  likeCount: initialLikeCount,
  signedIn,
}: {
  targetUid: string;
  action: string;
  liked: boolean;
  likeCount: number;
  signedIn: boolean;
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
    if (fetcher.data?.kind === "likeChanged" && fetcher.data.targetUid === targetUid) {
      setLiked(fetcher.data.liked);
      setLikeCount(fetcher.data.likeCount);
    }
  }, [fetcher.data, targetUid]);

  const toggle = () => {
    if (!signedIn) {
      showSignIn();
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikeCount((count) => Math.max(0, count + (next ? 1 : -1)));
    fetcher.submit({ liked: next }, { action, method: "post", encType: "application/json" });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={fetcher.state === "submitting"}
      aria-label={`좋아요 ${likeCount}개`}
      aria-pressed={liked}
      className={cn(
        "-ml-1.5 inline-flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[0.8125rem] tabular-nums hover:bg-v2-hover",
        liked ? "text-v2-fg" : "text-v2-fg-tertiary hover:text-v2-fg",
        v2FocusRing,
      )}
    >
      {liked ? (
        <HeartIcon className="size-4" aria-hidden="true" />
      ) : (
        <HeartOutlineIcon className="size-4 opacity-60" aria-hidden="true" />
      )}
      {likeCount}
    </button>
  );
}
