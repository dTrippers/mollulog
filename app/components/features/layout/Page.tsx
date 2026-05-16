import { ArrowLeftIcon } from "@heroicons/react/16/solid";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { BottomSheet } from "~/components/primitives";
import { default as PageLink, type PageLinkProps } from "~/components/primitives/PageLink";
import { default as PagePanel, type PagePanelProps } from "~/components/primitives/PagePanel";
import {
  default as PageScreenSelector,
  type PageScreenSelectorItemProps,
  type PageScreenSelectorProps,
} from "~/components/primitives/PageScreenSelector";
import { sanitizeClassName } from "~/prophandlers";

type PageProps = {
  title: string;
  description?: string;
  belowTitle?: React.ReactNode;
  screens?: PageScreenSelectorProps["screens"];
  showMobileScreens?: boolean;
  panels?: PagePanelProps[];
  links?: PageLinkProps[];
  contentArea?: "3xl" | "4xl" | "full";
  layout?: "horizontal" | "vertical";

  backward?: {
    title: string;
    to: string;
  };

  children: React.ReactNode;
};

export default function Page({
  title,
  description,
  belowTitle,
  screens,
  showMobileScreens = true,
  panels,
  links,
  contentArea = "3xl",
  layout = "horizontal",
  backward,
  children,
}: PageProps) {
  const [openPanelIndex, setOpenPanelIndex] = useState<number | null>(null);
  const tabBarSentinelRef = useRef<HTMLDivElement>(null);
  const [isTabBarSticky, setIsTabBarSticky] = useState(false);

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
  let contentAreaClass = "";
  if (contentArea === "4xl") {
    contentAreaClass = "max-w-4xl";
  } else if (contentArea === "3xl") {
    contentAreaClass = "max-w-3xl";
  } else if (contentArea === "full") {
    contentAreaClass = "w-full";
  }

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

      {openPanelIndex !== null && panels && panels[openPanelIndex] && (
        <BottomSheet
          Icon={panels[openPanelIndex].Icon}
          title={panels[openPanelIndex].title}
          description={panels[openPanelIndex].description}
          onClose={() => setOpenPanelIndex(null)}
        >
          {panels[openPanelIndex].children}
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
}: Omit<PageProps, "children" | "contentArea">) {
  const isVertical = layout === "vertical";
  const containerClass = isVertical
    ? "relative z-20 shrink-0 w-full overflow-x-hidden no-scrollbar"
    : "relative z-20 shrink-0 w-full overflow-x-hidden no-scrollbar lg:z-auto lg:h-screen lg:max-w-64 xl:max-w-xs lg:mr-4 xl:mr-6 lg:sticky lg:top-6 lg:self-start lg:overflow-y-scroll";

  return (
    <div className={containerClass}>
      <div className="mt-8 mb-4">
        {backward && (
          <Link
            to={backward.to}
            className="mb-4 inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400 hover:underline"
          >
            <ArrowLeftIcon className="size-4" />
            <span className="text-sm">{backward.title}</span>
          </Link>
        )}
        <h1 className="font-black text-3xl drop-shadow-xl drop-shadow-neutral-300/50 dark:drop-shadow-neutral-700/50">
          {title}
        </h1>
        {description && <p className="mt-2 text-sm lg:mt-4 text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
      {belowTitle && <div className="my-4">{belowTitle}</div>}
      {!isVertical && screens && <PageScreenSelector screens={screens} />}
      {(panels || links) && (
        <div className="my-8 hidden lg:block">
          {panels?.map((panel) => (
            <PagePanel key={panel.title} {...panel} />
          ))}
          {links && links.length > 0 && (
            <div className="lg:mt-8">
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

function MobileTabBar({
  screens,
  isSticky,
}: {
  screens: PageScreenSelectorProps["screens"];
  isSticky: boolean;
}) {
  return (
    <div
      className={sanitizeClassName(`
      lg:hidden sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border-neutral-200 dark:border-neutral-700
      ${isSticky ? "border-b" : ""}
    `)}
    >
      <div className="flex items-center gap-2 py-2 overflow-x-auto no-scrollbar">
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
      <div className="flex px-2 py-1 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-full shadow-lg">
        {links?.map((link) => (
          <MobileActionLink key={link.title} {...link} />
        ))}
        {panels?.map((panel, index) => (
          <button
            key={panel.title}
            type="button"
            onClick={() => onOpenPanel(index)}
            disabled={panel.disabled}
            className={sanitizeClassName(`
              w-20 flex flex-col justify-center items-center p-2 text-neutral-700 dark:text-neutral-300 rounded-full transition-colors
              ${panel.disabled ? "opacity-50" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}
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
    "w-20 flex flex-col justify-center items-center p-2 text-neutral-700 dark:text-neutral-300 rounded-full transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800";
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
      className={sanitizeClassName(`
      hidden lg:flex sticky top-0 z-10 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border-neutral-200 dark:border-neutral-700
      ${isSticky ? "border-b" : ""}
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

function VerticalDesktopTabItem({ text, Icon, active, disabled, link, onClick }: PageScreenSelectorItemProps) {
  const className = active
    ? sanitizeClassName(`
        flex items-center gap-2 h-10 px-4 rounded-full shrink-0 transition-all duration-200
        ${
          disabled
            ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500 opacity-50"
            : "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
        }
      `)
    : sanitizeClassName(`
        flex items-center gap-2 h-10 px-4 rounded-full shrink-0 transition-all duration-200
        ${
          disabled
            ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 opacity-50"
            : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        }
      `);
  const inner = (
    <>
      <Icon className="size-5 shrink-0" strokeWidth={2} />
      <span className={`text-sm whitespace-nowrap ${active ? "font-semibold" : "font-medium"}`}>{text}</span>
    </>
  );

  if (!disabled && link) {
    return (
      <Link to={link} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={disabled ? undefined : onClick}
      disabled={disabled || !onClick}
    >
      {inner}
    </button>
  );
}

function MobileTabItem({ text, Icon, active, disabled, link, onClick }: PageScreenSelectorItemProps) {
  const className = active
    ? sanitizeClassName(`
        flex items-center gap-2 h-10 px-4 rounded-full shrink-0 transition-all duration-200
        ${
          disabled
            ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500 opacity-50"
            : "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
        }
      `)
    : sanitizeClassName(`
        flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-all duration-200
        ${
          disabled
            ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 opacity-50"
            : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
        }
      `);
  const inner = (
    <>
      <Icon className="size-5 shrink-0" strokeWidth={2} />
      {active && <span className="text-sm font-semibold whitespace-nowrap">{text}</span>}
    </>
  );

  if (!disabled && link) {
    return (
      <Link to={link} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={disabled ? undefined : onClick}
      disabled={disabled || !onClick}
    >
      {inner}
    </button>
  );
}
