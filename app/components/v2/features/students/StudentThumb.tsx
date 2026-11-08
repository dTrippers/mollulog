import { CheckIcon } from "@heroicons/react/16/solid";
import { forwardRef, type ReactNode } from "react";
import { Link } from "react-router";
import type { FavoriteLabelState } from "~/domain/futures/futures-view-model";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { FavoriteLabel } from "./FavoriteLabel";
import StudentPortrait from "./StudentPortrait";

export type StudentThumbProps = {
  // Null while the student data is still being prepared. The thumbnail then shows the in-game placeholder icon.
  studentUid: string | null;
  name: string;
  variant: string | null;
  recruitmentLabel?: string;
  // True for a new (non-rerun) recruitment, which the label marks in the accent color.
  isNew?: boolean;
  favorite?: FavoriteLabelState;
  personalStatePending?: boolean;
  // Clicking opens the quick panel. Hover and focus styling belong to the button. Without it the thumbnail is not interactive:
  // it has no button role and cannot take focus.
  onOpen?: () => void;
  // Selection is opt-in. It turns the thumbnail into a pressed button without changing passive and quick-panel uses.
  onSelect?: () => void;
  selected?: boolean;
  // Replaces the detail action in the accessible name for selection controls.
  selectionActionLabel?: string;
  // Mobile-only alternative for compact grids with another top-edge badge.
  selectedIndicatorPosition?: "top-left" | "mobile-bottom-left";
  // Off when another badge (such as the favorite heart) already shows the selection.
  showSelectedIndicator?: boolean;
  mutedWhenUnselected?: boolean;
  grayscaleWhenUnselected?: boolean;
  // Shows the quick panel as the popover anchor.
  expanded?: boolean;
  compact?: boolean;
  // A portrait beside its name, such as a completion list row (24px wide).
  small?: boolean;
  // The home's portraits: 70px wide (84px tall) on mobile and 88px from the md breakpoint. The default is 56px wide on mobile and 64px from the sm breakpoint.
  large?: boolean;
  // One step above the default on wider screens for a browsing grid: the default 56px on mobile and 80px from the sm breakpoint.
  relaxed?: boolean;
  // Scales the linked or clickable thumbnail to 105% on hover with a fine pointer, as the 1.x student cards did.
  hoverScale?: boolean;
  // False hides the name and variant below the image, for layouts that show the name beside the portrait.
  showCaption?: boolean;
  showRecruitmentLabel?: boolean;
  // The student detail header portrait keeps the 60px width of its approved layout.
  headerPortrait?: boolean;
  // Internal route link for a directory card. Links prefetch on intent and use the forward transition.
  linkTo?: string;
  // A directory's sort or display value replaces the recruitment label in the scrim.
  scrimLabel?: ReactNode;
  scrimAriaLabel?: string;
  fluid?: boolean;
  captionPlacement?: "below" | "overlay";
  // Shows an overlay caption on compact layouts when the image itself carries the student name.
  overlayOnMobile?: boolean;
};

// Student thumbnail: a 5:6 image with a label band at the bottom, a favorite label on the top edge, and the name below.
const hoverScaleClassName =
  "motion-safe:transition-transform motion-safe:duration-v2-fast motion-safe:ease-v2-standard [@media(hover:hover)_and_(pointer:fine)]:hover:scale-105";

export const StudentThumb = forwardRef<HTMLButtonElement, StudentThumbProps>(function StudentThumb(
  {
    studentUid,
    name,
    variant,
    recruitmentLabel,
    isNew,
    favorite,
    personalStatePending = false,
    onOpen,
    onSelect,
    selected = false,
    selectionActionLabel,
    selectedIndicatorPosition = "top-left",
    showSelectedIndicator = true,
    mutedWhenUnselected = false,
    grayscaleWhenUnselected = false,
    expanded = false,
    compact = false,
    small = false,
    large = false,
    relaxed = false,
    hoverScale = false,
    showCaption = true,
    showRecruitmentLabel = true,
    headerPortrait = false,
    linkTo,
    scrimLabel,
    scrimAriaLabel,
    fluid = false,
    captionPlacement = "below",
    overlayOnMobile = false,
  },
  ref,
) {
  // The button's aria-label replaces the names of its children, so the favorite label's count and own state join the
  // button's own name. A hidden label (no count, no own state) adds nothing.
  const actionLabel = onSelect ? (selectionActionLabel ?? "상세") : "상세";
  const detailName = `${name}${variant ? `(${variant})` : ""} ${actionLabel}`;
  const selectionName = onSelect ? (selected ? "선택됨" : "선택 안 됨") : null;
  const accessibleName = [detailName, scrimAriaLabel, favorite?.visible ? favorite.accessibleName : null, selectionName]
    .filter(Boolean)
    .join(", ");
  const overlayCaption = captionPlacement === "overlay";
  const showBand = !overlayCaption && (scrimLabel != null || (showRecruitmentLabel && !!recruitmentLabel));
  const frameClassName = "relative block aspect-[5/6] w-full overflow-hidden rounded-md bg-v2-inset";
  const frame = (
    <>
      <StudentPortrait
        uid={studentUid ?? "unlisted"}
        className={cn(
          // The placeholder icon fills the width of the area above the label band (18px tall), centered vertically.
          studentUid === null && showBand
            ? "absolute inset-x-0 top-0 h-[calc(100%-1.125rem)] w-full object-cover"
            : "size-full object-cover",
          grayscaleWhenUnselected && onSelect && !selected && "grayscale",
        )}
        haloAboveBand={showBand || overlayCaption}
        haloScale="72%"
      />
      {overlayCaption ? (
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 bg-v2-scrim px-1 py-0.5 text-center text-[0.625rem] leading-tight text-v2-on-media",
            overlayOnMobile ? "block" : "hidden md:block",
          )}
        >
          <span className="block truncate font-medium">{name}</span>
          {variant ? <span className="block truncate text-[0.5625rem] text-v2-on-media/80">{variant}</span> : null}
        </span>
      ) : null}
      {overlayCaption && showRecruitmentLabel && recruitmentLabel ? (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0.5 rounded-sm bg-v2-scrim px-1 text-[0.5625rem] leading-4 font-medium text-v2-on-media"
        >
          {recruitmentLabel}
        </span>
      ) : null}
      {showBand ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-v2-scrim px-0.5 py-px text-[0.6875rem] leading-4 font-semibold whitespace-nowrap text-v2-on-media"
        >
          {scrimLabel ?? <span className={cn(isNew && "text-v2-new")}>{recruitmentLabel}</span>}
        </span>
      ) : null}
      {favorite ? <FavoriteLabel state={favorite} personalStatePending={personalStatePending} /> : null}
      {onSelect && selected && showSelectedIndicator ? (
        <span
          className={cn(
            "absolute left-1 flex size-5 items-center justify-center rounded-full bg-v2-fg text-v2-canvas",
            selectedIndicatorPosition === "mobile-bottom-left" ? "bottom-1 md:top-1 md:bottom-auto" : "top-1",
          )}
        >
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
  const caption = showCaption && !overlayCaption ? (
    <>
      <span
        className={cn(
          "block w-full truncate text-center text-xs leading-4 text-v2-fg",
          large ? "mt-0.5 md:mt-1" : "mt-1",
        )}
      >
        {name}
      </span>
      {variant ? (
        <span className="block w-full truncate text-center text-[0.6875rem] leading-4 text-v2-fg-tertiary">
          {variant}
        </span>
      ) : null}
    </>
  ) : null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center",
        fluid ? "w-full" : large ? "w-[4.375rem] md:w-[5.5rem]" : relaxed ? "w-14 sm:w-20" : small ? "w-6" : compact ? "w-9" : headerPortrait ? "w-[3.75rem]" : "w-14 sm:w-16",
      )}
    >
      {linkTo ? (
        <Link
          to={linkTo}
          prefetch="intent"
          aria-label={accessibleName}
          {...getV2LinkTransitionProps("forward")}
          className={cn("block w-full rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus", hoverScale && hoverScaleClassName)}
        >
          <span className={frameClassName}>{frame}</span>
          {caption}
        </Link>
      ) : onOpen || onSelect ? (
        <button
          ref={ref}
          type="button"
          aria-haspopup={onOpen ? "dialog" : undefined}
          aria-expanded={onOpen ? expanded : undefined}
          aria-pressed={onSelect ? selected : undefined}
          aria-label={accessibleName}
          onClick={onSelect ?? onOpen}
          className={cn(
            frameClassName,
            mutedWhenUnselected && onSelect && !selected && "opacity-50",
            "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
            hoverScale && hoverScaleClassName,
          )}
        >
          {frame}
        </button>
      ) : (
        <span className={frameClassName}>{frame}</span>
      )}
      {!linkTo ? caption : null}
    </div>
  );
});
