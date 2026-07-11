import { ArrowLeftIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { BottomSheet } from "~/components/primitives";
import { cn } from "~/lib/utils";
import PageLink, { type PageLinkProps } from "./PageLink";
import PagePanel, { type PagePanelProps } from "./PagePanel";
import PageScreenSelector, {
  type PageScreenSelectorItemProps,
  type PageScreenSelectorProps,
} from "./PageScreenSelector";

type PageProps = {
  title: string;
  description?: string;
  belowTitle?: React.ReactNode;
  screens?: PageScreenSelectorProps["screens"];
  showMobileScreens?: boolean;
  panels?: PagePanelProps[];
  links?: PageLinkProps[];
  contentWidth?: "narrow" | "full";
  layout?: "horizontal" | "vertical";

  backward?: {
    title: string;
    to: string;
  };

  children: React.ReactNode;
};

type TabItemState = {
  active?: boolean;
  disabled?: boolean;
};

function getTabItemClassName({ active, disabled }: TabItemState) {
  if (active) {
    return cn(`
      flex items-center gap-2 h-10 px-4 rounded-full shrink-0 transition-all duration-200
      ${disabled ? "bg-muted text-muted-foreground opacity-50" : "bg-primary text-primary-foreground"}
    `);
  }

  return cn(`
    flex items-center gap-2 h-10 px-4 rounded-full shrink-0 transition-all duration-200
    ${
      disabled
        ? "bg-muted/40 text-muted-foreground opacity-50"
        : "bg-card text-muted-foreground shadow-sm shadow-black/5 hover:bg-muted hover:text-foreground dark:bg-muted dark:shadow-none"
    }
  `);
}

export default function Page({
  title,
  description,
  belowTitle,
  screens,
  showMobileScreens = true,
  panels,
  links,
  contentWidth = "narrow",
  layout = "horizontal",
  backward,
  children,
}: PageProps) {
  const [openPanelIndex, setOpenPanelIndex] = useState<number | null>(null);
  const tabBarSentinelRef = useRef<HTMLDivElement>(null);
  const [isTabBarSticky, setIsTabBarSticky] = useState(false);
  const openPanel = openPanelIndex === null ? undefined : panels?.[openPanelIndex];

  useEffect(() => {
    const sentinel = tabBarSentinelRef.current;
    if (!sentinel) return;
    const scrollContainer = document.querySelector(".mllg-content-area");
    const observer = new IntersectionObserver(([entry]) => setIsTabBarSticky(!entry.isIntersecting), {
      root: scrollContainer ?? null,
      threshold: 1.0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  const contentAreaClass = contentWidth === "full" ? "w-full" : "max-w-4xl";

  return (
    <>
      <div className={`flex flex-col ${layout === "horizontal" ? "lg:flex-row" : ""}`}>
        <PageSidebar
          title={title}
          description={description}
          backward={backward}
          belowTitle={belowTitle}
          screens={screens}
          panels={panels}
          links={links}
          layout={layout}
        />

        {(showMobileScreens || layout === "vertical") && screens && screens.length > 0 && (
          <div ref={tabBarSentinelRef} className={layout === "vertical" ? "h-px" : "lg:hidden h-px"} />
        )}

        {showMobileScreens && screens && screens.length > 0 && (
          <MobileTabBar screens={screens} isSticky={isTabBarSticky} />
        )}

        {layout === "vertical" && screens && screens.length > 0 && (
          <VerticalDesktopTabBar screens={screens} isSticky={isTabBarSticky} />
        )}

        <div className={`relative z-0 grow lg:p-4 ${contentAreaClass}`}>{children}</div>
      </div>

      {((links && links.length > 0) || (panels && panels.length > 0)) && (
        <MobileActionBar links={links} panels={panels} onOpenPanel={setOpenPanelIndex} />
      )}

      {openPanel && (
        <BottomSheet
          Icon={openPanel.Icon}
          title={openPanel.title}
          description={openPanel.description}
          onClose={() => setOpenPanelIndex(null)}
        >
          {openPanel.children}
        </BottomSheet>
      )}
    </>
  );
}

function PageSidebar({
  title,
  description,
  backward,
  belowTitle,
  screens,
  panels,
  links,
  layout = "horizontal",
}: Omit<PageProps, "children" | "contentWidth">) {
  const isVertical = layout === "vertical";
  const containerClass = isVertical
    ? "relative z-20 shrink-0 w-full overflow-x-hidden no-scrollbar"
    : "relative z-20 shrink-0 w-full overflow-x-hidden no-scrollbar lg:z-auto lg:h-screen lg:max-w-64 xl:max-w-xs lg:mr-4 xl:mr-6 lg:sticky lg:top-6 lg:self-start lg:overflow-y-scroll";

  return (
    <div className={containerClass}>
      <header className="pt-6 pb-4">
        {backward && (
          <Link
            to={backward.to}
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            <span>{backward.title}</span>
          </Link>
        )}
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">{title}</h1>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
      </header>
      {belowTitle && <div className="my-4">{belowTitle}</div>}
      {!isVertical && screens && <PageScreenSelector screens={screens} />}
      {(panels || links) && (
        <div className="my-8 hidden lg:block">
          {panels && panels.length > 0 && (
            <div className="space-y-3">
              {panels.map((panel) => (
                <PagePanel key={panel.title} {...panel} />
              ))}
            </div>
          )}
          {links && links.length > 0 && (
            <div className={cn("space-y-3", panels && panels.length > 0 && "mt-8")}>
              {links.map((link) => (
                <PageLink key={link.title} {...link} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MobileTabBar({ screens, isSticky }: { screens: PageScreenSelectorProps["screens"]; isSticky: boolean }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeScreenKey =
    screens.find((screen) => screen.active)?.link ?? screens.find((screen) => screen.active)?.text;

  useEffect(() => {
    if (!activeScreenKey) return;

    const container = scrollContainerRef.current;
    const activeItem = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !activeItem) return;

    const targetLeft = activeItem.offsetLeft - (container.clientWidth - activeItem.clientWidth) / 2;
    container.scrollTo({ left: Math.max(0, targetLeft), behavior: "auto" });
  }, [activeScreenKey]);

  return (
    <div
      className={cn(`
      lg:hidden sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 bg-background/90 backdrop-blur-sm
      ${isSticky ? "shadow-sm" : ""}
    `)}
    >
      <div ref={scrollContainerRef} className="flex items-center gap-2 py-2 overflow-x-auto no-scrollbar">
        {screens.map((screen) => (
          <MobileTabItem key={screen.link ?? screen.text} {...screen} />
        ))}
      </div>
    </div>
  );
}

function MobileActionBar({
  links,
  panels,
  onOpenPanel,
}: {
  links?: PageLinkProps[];
  panels?: PagePanelProps[];
  onOpenPanel: React.Dispatch<React.SetStateAction<number | null>>;
}) {
  return (
    <div className="lg:hidden fixed w-fit bottom-[var(--mobile-bottom-offset)] right-4 z-30 flex gap-x-2">
      <div className="flex rounded-full bg-popover/90 px-2 py-1 shadow-lg backdrop-blur-sm">
        {links?.map((link) => (
          <MobileActionLink key={link.title} {...link} />
        ))}
        {panels?.map((panel, index) => (
          <button
            key={panel.title}
            type="button"
            onClick={() => onOpenPanel(index)}
            disabled={panel.disabled}
            className={cn(`
              w-20 flex flex-col justify-center items-center p-2 text-foreground rounded-full transition-colors
              ${panel.disabled ? "opacity-50" : "hover:bg-muted"}
            `)}
          >
            <panel.Icon className="mb-1 size-5 shrink-0" strokeWidth={2} />
            <span className="text-xs font-medium whitespace-nowrap">{panel.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileActionLink({ Icon, title, to }: PageLinkProps) {
  const className =
    "w-20 flex flex-col justify-center items-center rounded-full p-2 text-foreground transition-colors hover:bg-muted";
  const inner = (
    <>
      <Icon className="mb-1 size-5 shrink-0" strokeWidth={2} />
      <span className="text-xs font-medium whitespace-nowrap">{title}</span>
    </>
  );

  if (to.startsWith("http")) {
    return (
      <a href={to} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }

  return (
    <Link to={to} className={className}>
      {inner}
    </Link>
  );
}

function VerticalDesktopTabBar({
  screens,
  isSticky,
}: {
  screens: PageScreenSelectorProps["screens"];
  isSticky: boolean;
}) {
  return (
    <div
      className={cn(`
      hidden lg:flex sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 bg-background/90 backdrop-blur-sm
      ${isSticky ? "shadow-sm" : ""}
    `)}
    >
      <div className="flex items-center gap-2 py-2 overflow-x-auto no-scrollbar">
        {screens.map((screen) => (
          <VerticalDesktopTabItem key={screen.link ?? screen.text} {...screen} />
        ))}
      </div>
    </div>
  );
}

function VerticalDesktopTabItem({ text, label, Icon, active, disabled, link, onClick }: PageScreenSelectorItemProps) {
  const className = getTabItemClassName({ active, disabled });
  const inner = (
    <>
      <Icon className="size-5 shrink-0" strokeWidth={2} />
      <span className={`text-sm whitespace-nowrap ${active ? "font-semibold" : "font-medium"}`}>{text}</span>
      {label ? (
        <span className="flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white dark:bg-rose-400 dark:text-rose-950">
          {label}
        </span>
      ) : null}
    </>
  );

  if (!disabled && link) {
    return (
      <Link
        to={link}
        className={className}
        data-active={active ? "true" : undefined}
        aria-current={active ? "page" : undefined}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      data-active={active ? "true" : undefined}
      aria-pressed={active}
      onClick={disabled ? undefined : onClick}
      disabled={disabled || !onClick}
    >
      {inner}
    </button>
  );
}

function MobileTabItem({ text, label, Icon, active, disabled, link, onClick }: PageScreenSelectorItemProps) {
  const className = getTabItemClassName({ active, disabled });
  const inner = (
    <>
      <Icon className="size-5 shrink-0" strokeWidth={2} />
      <span className={`text-sm whitespace-nowrap ${active ? "font-semibold" : "font-medium"}`}>{text}</span>
      {label ? (
        <span className="flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white dark:bg-rose-400 dark:text-rose-950">
          {label}
        </span>
      ) : null}
    </>
  );

  if (!disabled && link) {
    return (
      <Link
        to={link}
        className={className}
        data-active={active ? "true" : undefined}
        aria-current={active ? "page" : undefined}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      data-active={active ? "true" : undefined}
      aria-pressed={active}
      onClick={disabled ? undefined : onClick}
      disabled={disabled || !onClick}
    >
      {inner}
    </button>
  );
}
