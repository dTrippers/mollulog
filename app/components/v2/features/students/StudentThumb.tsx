import { forwardRef } from "react";
import type { FavoriteLabelState } from "~/domain/futures/futures-view-model";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";
import { useImageFailure } from "../../primitives/use-image-failure";
import { FavoriteLabel } from "./FavoriteLabel";

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
  // Clicking opens the quick panel. Hover and focus styling belong to the button.
  onOpen: () => void;
  // Shows the quick panel as the popover anchor.
  expanded?: boolean;
  compact?: boolean;
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
  },
  ref,
) {
  const imageSrc = studentUid ? studentImageUrl(studentUid) : null;
  const image = useImageFailure(imageSrc);
  // The button's aria-label replaces the names of its children, so the favorite label's count and own state join the
  // button's own name. A hidden label (no count, no own state) adds nothing.
  const detailName = `${name}${variant ? `(${variant})` : ""} 상세`;
  const accessibleName = favorite.visible ? `${detailName}, ${favorite.accessibleName}` : detailName;
  return (
    <div className={cn("flex min-w-0 flex-col items-center", compact ? "w-[3.25rem]" : "w-[3.75rem]")}>
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-label={accessibleName}
        onClick={onOpen}
        className="relative block aspect-[5/6] w-full cursor-pointer overflow-hidden rounded-md bg-v2-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
      >
        {imageSrc && !image.failed ? (
          <img
            ref={image.ref}
            src={imageSrc}
            alt=""
            loading="lazy"
            decoding="async"
            onError={image.onError}
            className="size-full object-cover"
          />
        ) : null}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-v2-scrim px-0.5 py-px text-[0.6875rem] leading-4 font-semibold whitespace-nowrap text-v2-on-media"
        >
          <span className={cn(isNew && "text-v2-new")}>{recruitmentLabel}</span>
        </span>
        <FavoriteLabel state={favorite} personalStatePending={personalStatePending} />
      </button>
      <span className="mt-1 block w-full truncate text-center text-xs leading-4 text-v2-fg">{name}</span>
      {variant ? (
        <span className="block w-full truncate text-center text-[0.6875rem] leading-4 text-v2-fg-tertiary">
          {variant}
        </span>
      ) : studentUid === null ? (
        <span className="block w-full truncate text-center text-[0.6875rem] leading-4 text-v2-fg-tertiary">
          정보 준비 중
        </span>
      ) : null}
    </div>
  );
});
