import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Link } from "react-router";
import type { NavigationItem } from "./navigation-menu";
import { cn } from "~/lib/utils";

type NavigationMenuRowProps = NavigationItem & {
  isFavorite?: boolean;
  onFavoriteToggle?: (favoriteId: string) => void;
  compact?: boolean;
};

export function NavigationMenuRow({
  to,
  name,
  OutlineIcon,
  SolidIcon,
  isActive,
  isFavorite = false,
  onFavoriteToggle,
  showRedDot,
  badgeLabel,
  favoriteId,
  disabled,
  compact = false,
}: NavigationMenuRowProps) {
  const Icon = isActive ? SolidIcon : OutlineIcon;
  const favoriteAction = favoriteId && onFavoriteToggle && !disabled ? { favoriteId, onFavoriteToggle } : null;
  const hasFavoriteStar = favoriteAction !== null;
  const accessibleName = [name, badgeLabel, showRedDot ? "새 항목 있음" : null].filter(Boolean).join(", ");
  const rowClassName = cn(
    "group relative flex min-h-6.5 min-w-0 items-center rounded-md px-2 text-xs transition-colors",
    isActive ? "bg-background font-semibold text-foreground" : "font-normal text-foreground/75 hover:bg-background hover:text-foreground",
    compact && "min-h-9",
    disabled && "cursor-default opacity-50",
  );

  const content = (
    <span className="pointer-events-none relative z-[1] flex min-w-0 flex-1 items-center gap-3 pr-1">
      <Icon className="size-4 shrink-0 text-current" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span
        className={cn(
          "flex shrink-0 items-center gap-1.5",
          hasFavoriteStar && "transition-opacity group-hover:opacity-0 group-has-[button:focus-visible]:opacity-0",
        )}
      >
        {badgeLabel ? <span className="whitespace-nowrap text-xs font-normal text-muted-foreground">{badgeLabel}</span> : null}
        {showRedDot ? <span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" /> : null}
      </span>
    </span>
  );

  if (disabled) {
    return <div className={rowClassName}>{content}</div>;
  }

  return (
    <div className={rowClassName}>
      <Link
        to={to}
        aria-current={isActive ? "page" : undefined}
        aria-label={accessibleName}
        className="absolute inset-0 z-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      {content}
      {hasFavoriteStar ? (
        <button
          type="button"
          className={cn(
            "absolute right-1 top-1/2 z-10 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
            isFavorite ? "text-yellow-600 dark:text-yellow-400" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            favoriteAction?.onFavoriteToggle(favoriteAction.favoriteId);
          }}
          aria-label={isFavorite ? `${name} 즐겨찾기에서 제거` : `${name} 즐겨찾기에 추가`}
          aria-pressed={isFavorite}
          title={isFavorite ? "즐겨찾기에서 제거" : "즐겨찾기에 추가"}
        >
          {isFavorite ? <StarSolidIcon className="size-4" aria-hidden="true" /> : <StarOutlineIcon className="size-4" aria-hidden="true" />}
        </button>
      ) : null}
    </div>
  );
}

export function NavigationFavoriteMenuRow(props: NavigationMenuRowProps) {
  return <NavigationMenuRow {...props} isActive={false} />;
}
