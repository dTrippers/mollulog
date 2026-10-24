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
import { v2FocusRing } from "../styles";

export type SiteBannerSlot = SiteBannerScreen;

type SiteBannerProps = {
  banner: SiteBannerData;
  slot: SiteBannerSlot;
  className?: string;
};

const slotClassNames: Record<SiteBannerSlot, string> = {
  desktop_navigation: "w-full rounded-md px-3 py-2 text-xs leading-4",
  mobile_header: "w-full px-4 py-2 text-sm leading-5",
  futures_top: "mb-4 w-full rounded-lg px-3 py-2.5 text-sm leading-5 sm:px-4",
  community_top: "mb-4 w-full rounded-lg px-3 py-2.5 text-sm leading-5 sm:px-4",
};

const presetClassNames: Record<SiteBannerPreset, string> = {
  red: "bg-v2-banner-red text-v2-banner-red-fg",
  green: "bg-v2-banner-green text-v2-banner-green-fg",
  blue: "bg-v2-banner-blue text-v2-banner-blue-fg",
  pink: "bg-v2-banner-pink text-v2-banner-pink-fg",
  black: "bg-v2-banner-black text-v2-banner-black-fg",
};

export function SiteBanner({ banner, slot, className }: SiteBannerProps) {
  if (!banner.screens.includes(slot) || !isValidSiteBannerLink(banner.link)) {
    return null;
  }

  const linkClassName = cn(
    "block font-normal transition-opacity duration-v2-fast ease-v2-standard hover:opacity-90",
    presetClassNames[banner.colorPreset],
    slotClassNames[slot],
    v2FocusRing,
    className,
  );

  if (banner.link.startsWith("https://")) {
    return (
      <a href={banner.link} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {banner.message}
      </a>
    );
  }

  return (
    <Link to={banner.link} className={linkClassName}>
      {banner.message}
    </Link>
  );
}

export function getPageSiteBannerSlot(pathname: string, banner: Pick<SiteBannerData, "screens"> | null | undefined) {
  const slot = getSiteBannerPageScreen(pathname);
  return slot && banner?.screens.includes(slot) ? slot : null;
}

export { shouldRenderGlobalSiteBanner };
