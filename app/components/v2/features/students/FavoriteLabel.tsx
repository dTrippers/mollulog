import { CheckIcon } from "@heroicons/react/16/solid";
import { HeartIcon as OutlineHeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as SolidHeartIcon } from "@heroicons/react/24/solid";
import type { FavoriteLabelState } from "~/domain/futures/futures-view-model";
import { cn } from "~/lib/utils";
import { Skeleton } from "../../primitives/Skeleton";

// Favorite label on a thumbnail's top-right edge. The icon shape carries the state, and the accessible name carries the
// count and the viewer's own state. While the viewer's own state is loading, only the count shows, and the state icon is
// a skeleton, so the state is never read before it resolves.
export function FavoriteLabel({
  state,
  personalStatePending = false,
}: {
  state: FavoriteLabelState;
  personalStatePending?: boolean;
}) {
  if (!state.visible && !personalStatePending) {
    return null;
  }
  const iconClassName =
    state.icon === "completed"
      ? "text-v2-success"
      : state.icon === "favorited"
        ? "text-v2-favorite"
        : "text-v2-on-media";
  const HeartGlyph = state.icon === "favorited" ? SolidHeartIcon : OutlineHeartIcon;
  return (
    <span
      role="img"
      aria-label={state.accessibleName}
      className="absolute top-0.5 right-0.5 flex max-w-[calc(100%-0.25rem)] items-center gap-0.5 rounded-full bg-v2-scrim px-1 py-px text-[0.6875rem] leading-4 font-semibold text-v2-on-media tabular-nums"
    >
      {personalStatePending ? (
        <Skeleton className="size-2.5 rounded-full bg-v2-hover" />
      ) : state.icon === "completed" ? (
        <CheckIcon className={cn("size-3 shrink-0", iconClassName)} aria-hidden="true" />
      ) : (
        <HeartGlyph className={cn("size-3 shrink-0", iconClassName)} aria-hidden="true" />
      )}
      {state.countText ? <span aria-hidden="true">{state.countText}</span> : null}
    </span>
  );
}
