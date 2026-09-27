import { MagnifyingGlassIcon, MegaphoneIcon, StarIcon as StarOutlineIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolidIcon } from "@heroicons/react/24/solid";
import { Link } from "react-router";
import type { NavigationGroup, NavigationItem } from "./navigation-menu";
import { cn } from "~/lib/utils";

export type NavigationRailGroup = Omit<Pick<NavigationGroup, "name" | "shortName" | "OutlineIcon" | "SolidIcon">, "id"> & {
  id: string;
  items: NavigationItem[];
};

type NavigationRailProps = {
  darkMode: boolean;
  homeItem: NavigationItem;
  groups: NavigationRailGroup[];
  favoriteItems: NavigationItem[];
  bottomGroup: NavigationRailGroup | null;
  activeFlyoutId: string | null;
  siteBannerVisible: boolean;
  onOpenSearch: (trigger: HTMLButtonElement) => void;
  onOpenGroup: (group: NavigationRailGroup, trigger: HTMLButtonElement) => void;
  onOpenBanner: (trigger: HTMLButtonElement) => void;
  notificationControl: React.ReactNode;
  accountFooter: React.ReactNode;
};

export function NavigationRail({
  darkMode,
  homeItem,
  groups,
  favoriteItems,
  bottomGroup,
  activeFlyoutId,
  siteBannerVisible,
  onOpenSearch,
  onOpenGroup,
  onOpenBanner,
  notificationControl,
  accountFooter,
}: NavigationRailProps) {
  const homeIcon = homeItem.isActive ? homeItem.SolidIcon : homeItem.OutlineIcon;

  return (
    <div data-navigation-variant="rail" className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col items-center gap-2 px-2 pt-3 pb-2">
        <Link
          to="/"
          className="flex h-10 w-full items-center justify-center rounded-md transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label="몰루로그 홈으로 이동"
        >
          <img
            src={darkMode ? "/mollulog-rectangle-dark.png" : "/mollulog-rectangle-light.png"}
            alt="몰루로그"
            className="h-7 w-14 object-contain"
          />
        </Link>
        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          aria-label="검색 열기"
          aria-expanded={activeFlyoutId === "search"}
          aria-controls={activeFlyoutId === "search" ? "navigation-flyout-search" : undefined}
          onClick={(event) => onOpenSearch(event.currentTarget)}
        >
          <MagnifyingGlassIcon className="size-5" aria-hidden="true" />
        </button>
        {notificationControl}
        {siteBannerVisible ? (
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-label="사이트 배너 열기"
            aria-expanded={activeFlyoutId === "site-banner"}
            aria-controls={activeFlyoutId === "site-banner" ? "navigation-flyout-site-banner" : undefined}
            onClick={(event) => onOpenBanner(event.currentTarget)}
          >
            <MegaphoneIcon className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <nav aria-label="주요 메뉴" className="no-scrollbar flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto px-1.5 py-2">
        <Link
          to={homeItem.to}
          aria-current={homeItem.isActive ? "page" : undefined}
          aria-label={homeItem.name}
          className={cn(
            "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-md px-0.5 text-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
            homeItem.isActive && "bg-background font-bold text-foreground",
          )}
        >
          {(() => {
            const Icon = homeIcon;
            return <Icon className="size-5" aria-hidden="true" />;
          })()}
          <span className="whitespace-nowrap text-[11px] leading-4 tracking-tighter">홈</span>
        </Link>

        <RailGroupButton
          group={{ id: "favorites", name: "즐겨찾기", shortName: "즐겨찾기", OutlineIcon: StarOutlineIcon, SolidIcon: StarSolidIcon, items: favoriteItems }}
          active={false}
          hasRedDot={favoriteItems.some((item) => item.showRedDot)}
          expanded={activeFlyoutId === "favorites"}
          onOpen={onOpenGroup}
        />
        {groups.map((group) => (
          <RailGroupButton
            key={group.id}
            group={group}
            active={group.items.some((item) => item.isActive)}
            hasRedDot={group.items.some((item) => item.showRedDot)}
            expanded={activeFlyoutId === group.id}
            onOpen={onOpenGroup}
          />
        ))}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-1 px-1.5 pb-2">
        {bottomGroup ? (
          <RailGroupButton
            group={bottomGroup}
            active={bottomGroup.items.some((item) => item.isActive)}
            hasRedDot={bottomGroup.items.some((item) => item.showRedDot)}
            expanded={activeFlyoutId === bottomGroup.id}
            onOpen={onOpenGroup}
          />
        ) : null}
        {accountFooter}
      </div>
    </div>
  );
}

function RailGroupButton({
  group,
  active,
  hasRedDot,
  expanded,
  onOpen,
}: {
  group: NavigationRailGroup;
  active: boolean;
  hasRedDot: boolean;
  expanded: boolean;
  onOpen: (group: NavigationRailGroup, trigger: HTMLButtonElement) => void;
}) {
  const Icon = active ? group.SolidIcon : group.OutlineIcon;
  const accessibleName = `${group.name}${hasRedDot ? ", 새 항목 있음" : ""}`;

  return (
    <button
      type="button"
      className={cn(
        "relative flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-md px-0.5 text-foreground/70 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        active && "bg-background font-bold text-foreground",
      )}
      aria-label={accessibleName}
      aria-expanded={expanded}
      aria-controls={expanded ? `navigation-flyout-${group.id}` : undefined}
      onClick={(event) => onOpen(group, event.currentTarget)}
    >
      <span className="relative flex size-5 items-center justify-center">
        <Icon className="size-5" aria-hidden="true" />
        {hasRedDot ? (
          <span
            className="absolute top-0 right-0 size-1.5 translate-x-1/2 -translate-y-1/2 rounded-full bg-destructive"
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className="whitespace-nowrap text-[11px] leading-4 tracking-tighter">{group.shortName}</span>
    </button>
  );
}
