import { CheckIcon } from "@heroicons/react/16/solid";
import { HeartIcon as OutlineHeartIcon } from "@heroicons/react/24/outline";
import { HeartIcon as SolidHeartIcon } from "@heroicons/react/24/solid";
import type { FavoriteLabelState } from "~/domain/futures/futures-view-model";
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
  const backgroundClassName = personalStatePending
    ? "bg-v2-scrim"
    : state.icon === "completed"
      ? "bg-v2-completed-badge"
      : state.icon === "favorited"
        ? "bg-v2-favorite-badge"
        : "bg-v2-scrim";
  const HeartGlyph = state.icon === "favorited" ? SolidHeartIcon : OutlineHeartIcon;
  return (
    <span
      role="img"
      aria-label={state.accessibleName}
      className={`absolute top-0.5 right-0.5 flex max-w-[calc(100%-0.25rem)] items-center gap-px rounded-full px-[3px] text-[0.6875rem] leading-4 font-medium text-v2-on-media tabular-nums ${backgroundClassName}`}
    >
      {personalStatePending ? (
        <Skeleton className="size-2.5 rounded-full bg-v2-hover" />
      ) : state.icon === "completed" ? (
        <CheckIcon className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <HeartGlyph className="size-3 shrink-0" aria-hidden="true" />
      )}
      {state.countText ? <span aria-hidden="true">{state.countText}</span> : null}
    </span>
  );
}
