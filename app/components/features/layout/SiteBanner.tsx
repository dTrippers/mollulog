import { Link } from "react-router";
import {
  getSiteBannerPageScreen,
  isValidSiteBannerLink,
  type SiteBanner as SiteBannerData,
  type SiteBannerPreset,
  type SiteBannerScreen,
  shouldRenderGlobalSiteBanner,
} from "~/domain/site-banner";
import { cn } from "~/lib/utils";

export type SiteBannerSlot = SiteBannerScreen;

type SiteBannerProps = {
  banner: SiteBannerData;
  slot: SiteBannerSlot;
  className?: string;
};

const slotClassNames: Record<SiteBannerSlot, string> = {
  desktop_navigation: "w-full rounded-md px-3 py-2",
  mobile_header: "w-full px-4 py-2",
  futures_top: "mb-4 w-full rounded-lg px-3 py-2.5 sm:px-4",
  community_top: "mb-4 w-full rounded-lg px-3 py-2.5 sm:px-4",
};

const presetClassNames: Record<SiteBannerPreset, { container: string; text: string }> = {
  red: {
    container: "bg-gradient-to-r from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20",
    text: "text-rose-700 dark:text-rose-300",
  },
  green: {
    container: "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20",
    text: "text-green-700 dark:text-green-300",
  },
  blue: {
    container: "bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20",
    text: "text-sky-700 dark:text-sky-300",
  },
  black: {
    container: "bg-neutral-100 dark:bg-neutral-700/70",
    text: "text-neutral-700 dark:text-neutral-200",
  },
};

export function SiteBanner({ banner, slot, className }: SiteBannerProps) {
  if (!banner.screens.includes(slot) || !isValidSiteBannerLink(banner.link)) {
    return null;
  }

  const preset = presetClassNames[banner.colorPreset];
  const linkClassName = cn(
    "block text-sm font-normal leading-5 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
    preset.container,
    preset.text,
    slotClassNames[slot],
    className,
  );

  if (banner.link.startsWith("https://")) {
    return (
      <a href={banner.link} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {banner.message}
      </a>
    );
  }

  return <Link to={banner.link} className={linkClassName}>{banner.message}</Link>;
}

export function getPageSiteBannerSlot(pathname: string, banner: Pick<SiteBannerData, "screens"> | null | undefined) {
  const slot = getSiteBannerPageScreen(pathname);
  return slot && banner?.screens.includes(slot) ? slot : null;
}

export { shouldRenderGlobalSiteBanner };
