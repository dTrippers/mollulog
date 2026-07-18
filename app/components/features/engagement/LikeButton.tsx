import { HeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as SolidHeartIcon } from "@heroicons/react/24/solid";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import type { LikeChangedActionResult } from "~/domain/like";

export default function LikeButton({
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

  const toggleLike = () => {
    if (!signedIn) {
      showSignIn();
      return;
    }

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((currentCount) => Math.max(0, currentCount + (nextLiked ? 1 : -1)));
    fetcher.submit(
      { liked: nextLiked },
      {
        action,
        method: "post",
        encType: "application/json",
      },
    );
  };

  const baseClassName =
    "group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all";
  const stateClassName = liked
    ? "bg-gradient-to-r from-red-500 to-pink-500 text-white shadow shadow-red-500/25 hover:brightness-110 hover:shadow-red-500/40"
    : "bg-card text-muted-foreground shadow-xs shadow-black/5 hover:bg-muted hover:text-foreground dark:bg-muted dark:shadow-none";

  return (
    <button
      type="button"
      className={`${baseClassName} ${stateClassName}`}
      onClick={toggleLike}
      aria-label={`좋아요 ${likeCount}개`}
      aria-pressed={liked}
      disabled={fetcher.state === "submitting"}
    >
      {liked ? <SolidHeartIcon className="size-4" /> : <HeartIcon className="size-4" />}
      <span>{likeCount}</span>
    </button>
  );
}
