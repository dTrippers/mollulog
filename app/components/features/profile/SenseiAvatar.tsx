import { CheckBadgeIcon } from "@heroicons/react/20/solid";
import { ProfileImage } from "~/components/primitives";
import { ACCOUNT_LABEL_PRESENTATIONS, type AccountLabel, getPrimaryAccountLabel } from "~/domain/account-label";

type SenseiAvatarProps = {
  profileStudentId: string | null;
  labels?: AccountLabel[];
  imageSize?: 16 | 12 | 10 | 8 | 6;
};

function getBadgeSize(imageSize: SenseiAvatarProps["imageSize"]): string {
  switch (imageSize) {
    case 16:
      return "size-5";
    case 12:
    case 10:
      return "size-4";
    case 6:
      return "size-3";
    default:
      return "size-3.5";
  }
}

export default function SenseiAvatar({ profileStudentId, labels, imageSize = 8 }: SenseiAvatarProps) {
  const primaryLabel = getPrimaryAccountLabel(labels);
  const presentation = primaryLabel ? ACCOUNT_LABEL_PRESENTATIONS[primaryLabel] : null;
  const avatar = presentation?.profileImageUrl ? (
    <ProfileImage
      studentUid={profileStudentId}
      imageUrl={presentation.profileImageUrl}
      alt={presentation.profileImageAlt ?? ""}
      imageSize={imageSize}
    />
  ) : (
    <ProfileImage studentUid={profileStudentId} imageSize={imageSize} />
  );

  if (!presentation) return avatar;

  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <span
        className={`absolute -right-0.5 -bottom-0.5 inline-flex ${getBadgeSize(imageSize)}`}
        role="img"
        aria-label={presentation.name}
        title={presentation.name}
      >
        <span aria-hidden className="absolute inset-[26%] rounded-full bg-white" />
        <CheckBadgeIcon className="relative size-full text-primary" />
      </span>
    </span>
  );
}
