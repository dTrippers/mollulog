import { forwardRef } from "react";
import type { FavoriteLabelState } from "~/domain/futures/futures-view-model";
import { cn } from "~/lib/utils";
import { FavoriteLabel } from "./FavoriteLabel";
import StudentPortrait from "./StudentPortrait";

export type StudentThumbProps = {
  // Null while the student data is still being prepared. The thumbnail then shows a neutral placeholder.
  studentUid: string | null;
  name: string;
  variant: string | null;
  recruitmentLabel: string;
  // True for a new (non-rerun) recruitment, which the label marks in the accent color.
  isNew: boolean;
  favorite: FavoriteLabelState;
  personalStatePending?: boolean;
  // Clicking opens the quick panel. Hover and focus styling belong to the button. Without it the thumbnail is not interactive:
  // it has no button role and cannot take focus.
  onOpen?: () => void;
  // Shows the quick panel as the popover anchor.
  expanded?: boolean;
  compact?: boolean;
  // A portrait beside its name, such as a completion list row (24px wide).
  small?: boolean;
  // The home's portraits: 70px wide (84px tall) on mobile and 88px from the md breakpoint. The default keeps the 60px thumbnail.
  large?: boolean;
  // False hides the name, variant, and preparing line below the image, for layouts that show the name beside the portrait.
  showCaption?: boolean;
  showRecruitmentLabel?: boolean;
};

// Student thumbnail: a 5:6 image with a label band at the bottom, a favorite label on the top edge, and the name below.
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
    expanded = false,
    compact = false,
    small = false,
    large = false,
    showCaption = true,
    showRecruitmentLabel = true,
  },
  ref,
) {
  // The button's aria-label replaces the names of its children, so the favorite label's count and own state join the
  // button's own name. A hidden label (no count, no own state) adds nothing.
  const detailName = `${name}${variant ? `(${variant})` : ""} 상세`;
  const accessibleName = favorite.visible ? `${detailName}, ${favorite.accessibleName}` : detailName;
  const frameClassName = "relative block aspect-[5/6] w-full overflow-hidden rounded-md bg-v2-inset";
  const frame = (
    <>
      <StudentPortrait
        uid={studentUid}
        className="size-full object-cover"
        haloAboveBand={showRecruitmentLabel}
        haloScale="72%"
      />
      {showRecruitmentLabel ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-v2-scrim px-0.5 py-px text-[0.6875rem] leading-4 font-semibold whitespace-nowrap text-v2-on-media"
        >
          <span className={cn(isNew && "text-v2-new")}>{recruitmentLabel}</span>
        </span>
      ) : null}
      <FavoriteLabel state={favorite} personalStatePending={personalStatePending} />
    </>
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center",
        large ? "w-[4.375rem] md:w-[5.5rem]" : small ? "w-6" : compact ? "w-9" : "w-[3.75rem]",
      )}
    >
      {onOpen ? (
        <button
          ref={ref}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={expanded}
          aria-label={accessibleName}
          onClick={onOpen}
          className={cn(
            frameClassName,
            "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
          )}
        >
          {frame}
        </button>
      ) : (
        <span className={frameClassName}>{frame}</span>
      )}
      {showCaption ? (
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
          ) : studentUid === null ? (
            <span className="block w-full truncate text-center text-[0.6875rem] leading-4 text-v2-fg-tertiary">
              정보 준비 중
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
});
