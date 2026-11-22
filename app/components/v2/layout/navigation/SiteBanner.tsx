import { XMarkIcon } from "@heroicons/react/16/solid";
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
  onDismiss: (uid: string) => void;
  className?: string;
};

type SlotStyle = {
  container: string;
  // Padding plus room on the right for the close button.
  link: string;
  // Keeps the close button vertically centered on the first line of text.
  close: string;
};

const slotStyles: Record<SiteBannerSlot, SlotStyle> = {
  desktop_navigation: {
    container: "w-full rounded-md",
    link: "py-2 pl-3 pr-8 text-xs leading-4",
    close: "top-1 right-1",
  },
  mobile_header: {
    container: "w-full",
    link: "py-2 pl-4 pr-10 text-sm leading-5",
    close: "top-1.5 right-2.5",
  },
  futures_top: {
    container: "mb-4 w-full rounded-lg",
    link: "py-2.5 pl-3 pr-9 text-sm leading-5 sm:pl-4",
    close: "top-2 right-2",
  },
  community_top: {
    container: "mb-4 w-full rounded-lg",
    link: "py-2.5 pl-3 pr-9 text-sm leading-5 sm:pl-4",
    close: "top-2 right-2",
  },
};

const presetClassNames: Record<SiteBannerPreset, string> = {
  red: "bg-v2-banner-red text-v2-banner-red-fg",
  green: "bg-v2-banner-green text-v2-banner-green-fg",
  blue: "bg-v2-banner-blue text-v2-banner-blue-fg",
  pink: "bg-v2-banner-pink text-v2-banner-pink-fg",
  black: "bg-v2-banner-black text-v2-banner-black-fg",
};

export function SiteBanner({ banner, slot, onDismiss, className }: SiteBannerProps) {
  if (!banner.screens.includes(slot) || !isValidSiteBannerLink(banner.link)) {
    return null;
  }

  const style = slotStyles[slot];
  const linkClassName = cn(
    "block rounded-[inherit] font-normal hover:opacity-90 v2-interaction-transition",
    style.link,
    v2FocusRing,
  );

  return (
    <div className={cn("relative", presetClassNames[banner.colorPreset], style.container, className)}>
      {banner.link.startsWith("https://") ? (
        <a href={banner.link} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          {banner.message}
        </a>
      ) : (
        <Link to={banner.link} className={linkClassName}>
          {banner.message}
        </Link>
      )}
      <button
        type="button"
        aria-label="배너 닫기"
        onClick={() => onDismiss(banner.uid)}
        className={cn(
          "absolute inline-flex size-6 cursor-pointer items-center justify-center rounded-md opacity-70 hover:bg-current/10 hover:opacity-100 v2-interaction-transition",
          style.close,
          v2FocusRing,
        )}
      >
        <XMarkIcon className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function getPageSiteBannerSlot(pathname: string, banner: Pick<SiteBannerData, "screens"> | null | undefined) {
  const slot = getSiteBannerPageScreen(pathname);
  return slot && banner?.screens.includes(slot) ? slot : null;
}

export { shouldRenderGlobalSiteBanner };
