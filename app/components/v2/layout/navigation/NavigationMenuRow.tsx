import { StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Link } from "react-router";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../styles";
import type { NavigationItem } from "./navigation-menu";

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
  menuId,
  disabled,
  compact = false,
}: NavigationMenuRowProps) {
  const Icon = isActive ? SolidIcon : OutlineIcon;
  const favoriteAction = favoriteId && onFavoriteToggle && !disabled ? { favoriteId, onFavoriteToggle } : null;
  const hasFavoriteStar = favoriteAction !== null;
  const accessibleName = [name, badgeLabel, showRedDot ? "새 항목 있음" : null].filter(Boolean).join(", ");
  const rowClassName = cn(
    "group relative flex min-h-6.5 min-w-0 items-center rounded-md px-2 text-xs transition-colors duration-v2-fast ease-v2-standard",
    isActive
      ? "bg-v2-nav-active font-semibold text-v2-fg"
      : "font-normal text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg",
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
          hasFavoriteStar &&
            "transition-opacity duration-v2-fast ease-v2-standard group-hover:opacity-0 group-has-[button:focus-visible]:opacity-0",
        )}
      >
        {badgeLabel ? (
          <span
            className={cn(
              "whitespace-nowrap text-[10px] leading-4 font-normal",
              isActive ? "text-v2-fg-secondary" : "text-v2-fg-tertiary",
            )}
          >
            {badgeLabel}
          </span>
        ) : null}
        {showRedDot ? <span className="size-1.5 rounded-full bg-v2-unread" aria-hidden="true" /> : null}
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
        className={cn("absolute inset-0 z-0 rounded-md", v2FocusRing)}
        onClick={() => {
          if (menuId) trackGoogleAnalyticsEvent("nav_menu_click", { menu_id: menuId });
        }}
      />
      {content}
      {hasFavoriteStar ? (
        <button
          type="button"
          className={cn(
            "absolute top-0 right-1 bottom-0 z-10 my-auto inline-flex size-6 items-center justify-center rounded-md text-v2-fg-secondary opacity-0 transition-opacity duration-v2-fast ease-v2-standard group-hover:opacity-100 focus-visible:opacity-100",
            "hover:bg-v2-hover hover:text-v2-fg",
            v2FocusRing,
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
          {isFavorite ? (
            <StarSolidIcon className="size-4" aria-hidden="true" />
          ) : (
            <StarOutlineIcon className="size-4" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </div>
  );
}

export function NavigationFavoriteMenuRow(props: NavigationMenuRowProps) {
  return <NavigationMenuRow {...props} isActive={false} />;
}
