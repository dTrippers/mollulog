import { CheckBadgeIcon, UserIcon } from "@heroicons/react/16/solid";
import { ACCOUNT_LABEL_PRESENTATIONS, type AccountLabel, getPrimaryAccountLabel } from "~/domain/account-label";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";
import { useImageFailure } from "../../primitives/use-image-failure";

// The account's profile image: the profile student's image, or the account label's own mark. An official account
// shows a check badge. With no image, the neutral person placeholder shows.
export function SenseiAvatar({
  profileStudentId,
  labels,
  size = "default",
}: {
  profileStudentId: string | null;
  labels?: readonly AccountLabel[] | readonly string[];
  size?: "default" | "compact";
}) {
  const primary = getPrimaryAccountLabel(labels);
  const presentation = primary ? ACCOUNT_LABEL_PRESENTATIONS[primary] : null;
  const imageSrc = presentation?.profileImageUrl ?? (profileStudentId ? studentImageUrl(profileStudentId) : null);
  const image = useImageFailure(imageSrc);
  const showImage = imageSrc !== null && !image.failed;

  return (
    <span className="relative inline-flex shrink-0">
      <span
        className={cn(
          "flex items-center justify-center overflow-hidden rounded-full bg-v2-inset text-v2-fg-tertiary",
          size === "compact" ? "size-6" : "size-8",
        )}
      >
        {showImage ? (
          <img
            ref={image.ref}
            src={imageSrc}
            alt={presentation?.profileImageAlt ?? ""}
            loading="lazy"
            onError={image.onError}
            className="size-full object-cover"
          />
        ) : (
          <UserIcon className={size === "compact" ? "size-3.5" : "size-4"} aria-hidden="true" />
        )}
      </span>
      {presentation ? (
        <span
          role="img"
          aria-label={presentation.name}
          title={presentation.name}
          className="absolute -right-0.5 -bottom-0.5 flex size-3.5 items-center justify-center"
        >
          <span aria-hidden="true" className="absolute inset-[26%] rounded-full bg-v2-surface" />
          <CheckBadgeIcon className="relative size-full text-v2-fg" aria-hidden="true" />
        </span>
      ) : null}
    </span>
  );
}
