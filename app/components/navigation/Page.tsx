import { useState } from "react";
import { BottomSheet } from "~/components/atoms/layout";
import PageScreenSelector, { type PageScreenSelectorProps } from "./PageScreenSelector";
import PagePanel, { type PagePanelProps } from "./PagePanel";
import PageLink, { type PageLinkProps } from "./PageLink";
import { sanitizeClassName } from "~/prophandlers";
import { Link } from "react-router";

type PageProps = {
  title: string;
  description?: string;
  belowTitle?: React.ReactNode;
  screens?: PageScreenSelectorProps["screens"];
  panels?: PagePanelProps[];
  links?: PageLinkProps[];
  contentArea?: "3xl" | "4xl";

  children: React.ReactNode;
};

export default function Page({ title, description, belowTitle, screens, panels, links, contentArea = "3xl", children }: PageProps) {
  const [openPanelIndex, setOpenPanelIndex] = useState<number | null>(null);
  const contentAreaClass = contentArea === "4xl" ? "max-w-4xl" : "max-w-3xl";
  return (
    <>
      <div className="flex flex-col xl:flex-row">
        <div className="shrink-0 w-full xl:h-screen xl:max-w-86 xl:mr-8 xl:sticky xl:top-6 xl:self-start xl:overflow-y-scroll overflow-x-hidden no-scrollbar">
          <div className="mt-8 mb-4">
            <h1 className="font-black text-3xl md:text-4xl drop-shadow-xl drop-shadow-neutral-300/50 dark:drop-shadow-neutral-700/50">
              {title}
            </h1>
            {description && <p className="mt-4 text-neutral-500 dark:text-neutral-400">{description}</p>}
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
