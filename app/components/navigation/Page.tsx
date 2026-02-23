import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "~/components/atoms/layout";
import PageScreenSelector, { type PageScreenSelectorProps, type PageScreenSelectorItemProps } from "./PageScreenSelector";
import PagePanel, { type PagePanelProps } from "./PagePanel";
import PageLink, { type PageLinkProps } from "./PageLink";
import { sanitizeClassName } from "~/prophandlers";
import { Link } from "react-router";
import { ArrowLeftIcon } from "@heroicons/react/16/solid";

type PageProps = {
  title: string;
  description?: string;
  belowTitle?: React.ReactNode;
  screens?: PageScreenSelectorProps["screens"];
  panels?: PagePanelProps[];
  links?: PageLinkProps[];
  contentArea?: "3xl" | "4xl" | "full";

  backward?: {
    title: string;
    to: string;
  };

  children: React.ReactNode;
};

export default function Page({ title, description, belowTitle, screens, panels, links, contentArea = "3xl", backward, children }: PageProps) {
  const [openPanelIndex, setOpenPanelIndex] = useState<number | null>(null);
  const tabBarSentinelRef = useRef<HTMLDivElement>(null);
  const [isTabBarSticky, setIsTabBarSticky] = useState(false);

  useEffect(() => {
    const sentinel = tabBarSentinelRef.current;
    if (!sentinel) return;
    const scrollContainer = document.querySelector(".mllg-content-area");
    const observer = new IntersectionObserver(
      ([entry]) => setIsTabBarSticky(!entry.isIntersecting),
      { root: scrollContainer ?? null, threshold: 1.0 },
    );
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
      <div className="flex flex-col xl:flex-row">
        <div className="shrink-0 w-full xl:h-screen xl:max-w-sm xl:mr-8 xl:sticky xl:top-6 xl:self-start xl:overflow-y-scroll overflow-x-hidden no-scrollbar">
          <div className="mt-8 mb-4">
            {backward && (
              <Link to={backward.to} className="mb-4 block group">
                <div className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400 hover:underline">
                  <ArrowLeftIcon className="size-4" />
                  <span className="text-sm">{backward.title}</span>
                </div>
              </Link>
            )}
            <h1 className="font-black text-3xl md:text-4xl drop-shadow-xl drop-shadow-neutral-300/50 dark:drop-shadow-neutral-700/50">
              {title}
            </h1>
            {description && <p className="mt-2 xl:mt-4 text-neutral-500 dark:text-neutral-400">{description}</p>}
          </div>
          {belowTitle && <div className="my-4">{belowTitle}</div>}
          {screens && <PageScreenSelector screens={screens} />}
          <div className="my-8 hidden xl:block">
            {panels?.map((panel) => (
              <PagePanel key={panel.title} {...panel} />
            ))}
            {links && links.length > 0 && (
              <div className="xl:mt-8">
                {links.map((link) => (
                  <PageLink key={link.title} {...link} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sentinel: sticky 상태 감지용 */}
        {screens && screens.length > 0 && (
          <div ref={tabBarSentinelRef} className="xl:hidden h-px" />
        )}

        {/* Mobile sticky icon tab bar */}
        {screens && screens.length > 0 && (
          <div className={sanitizeClassName(`
            xl:hidden sticky top-0 z-100 -mx-4 md:-mx-8 px-4 md:px-8 pt-3 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm border-neutral-200 dark:border-neutral-700
            ${isTabBarSticky ? "border-b" : ""}
          `)}>
            <div className="flex items-center gap-2 py-2 overflow-x-auto no-scrollbar">
              {screens.map((screen, index) => (
                <MobileTabItem key={index} {...screen} />
              ))}
            </div>
          </div>
        )}

        <div className={`grow xl:p-4 ${contentAreaClass}`}>
          {children}
        </div>
      </div>

      {/* Mobile floating navigation bar */}
      {(links && links.length > 0 || panels && panels.length > 0) && (
        <div className="xl:hidden fixed w-fit bottom-4 right-4 z-20 flex gap-x-2">
          <div className="flex px-2 py-1 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-full shadow-lg">
            {links?.map((link) => (
              <Link key={link.title} to={link.to} className="w-20 flex flex-col justify-center items-center p-2 text-neutral-700 dark:text-neutral-300 rounded-full transition-colors cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800">
                <link.Icon className="mb-1 size-5 shrink-0" strokeWidth={2} />
                <span className="text-xs font-medium whitespace-nowrap">{link.title}</span>
              </Link>
            ))}
            {panels?.map((panel, index) => (
              <div
                key={panel.title}
                onClick={() => panel.disabled ? undefined : setOpenPanelIndex(index)}
                className={sanitizeClassName(`
                  w-20 flex flex-col justify-center items-center p-2 text-neutral-700 dark:text-neutral-300 rounded-full transition-colors cursor-pointer
                  ${panel.disabled ? "opacity-50 cursor-default" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}
                `)}
              >
                <panel.Icon className="mb-1 size-5 shrink-0" strokeWidth={2} />
                <span className="text-xs font-medium whitespace-nowrap">{panel.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mobile bottom sheet */}
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

function MobileTabItem({ text, Icon, active, disabled, link, onClick }: PageScreenSelectorItemProps) {
  const handleClick = disabled ? undefined : onClick;
  const inner = active ? (
    <div
      className={sanitizeClassName(`
        flex items-center gap-2 h-10 px-4 rounded-full shrink-0 transition-all duration-200
        ${disabled
          ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-400 dark:text-neutral-500 opacity-50 cursor-not-allowed"
          : "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 cursor-pointer"
        }
      `)}
      onClick={handleClick}
    >
      <Icon className="size-5 shrink-0" strokeWidth={2} />
      <span className="text-sm font-semibold whitespace-nowrap">{text}</span>
    </div>
  ) : (
    <div
      className={sanitizeClassName(`
        flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-all duration-200
        ${disabled
          ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 opacity-50 cursor-not-allowed"
          : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700"
        }
      `)}
      onClick={handleClick}
    >
      <Icon className="size-5 shrink-0" strokeWidth={2} />
    </div>
  );

  return (!disabled && link) ? <Link to={link}>{inner}</Link> : inner;
}
