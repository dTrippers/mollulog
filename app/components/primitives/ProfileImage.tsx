import { UserIcon } from "@heroicons/react/24/outline";
import { cn } from "~/lib/utils";
import { studentImageUrl } from "~/models/assets";

type ProfileImageProps = {
  studentUid: string | null;
  imageSize?: 16 | 12 | 6 | 8;
};

export default function ProfileImage({ studentUid, imageSize }: ProfileImageProps) {
  let [imageSizeClass, iconSizeClass]: string[] = [];
  switch (imageSize) {
    case 16:
      [imageSizeClass, iconSizeClass] = ["size-16", "size-12"];
      break;
    case 12:
      [imageSizeClass, iconSizeClass] = ["size-10 md:size-12", "size-8 md:size-10"];
      break;
    case 6:
      [imageSizeClass, iconSizeClass] = ["size-6", "size-4"];
      break;
    default:
      [imageSizeClass, iconSizeClass] = ["size-8", "size-6"];
  }

  return studentUid ? (
    <img
      className={cn(imageSizeClass, "inline rounded-full border border-border bg-muted object-cover dark:opacity-90")}
      src={studentImageUrl(studentUid)}
      alt="학생 프로필"
    />
  ) : (
    <div className={cn(imageSizeClass, "flex items-center justify-center rounded-full border border-border bg-muted text-muted-foreground")}>
      <UserIcon className={iconSizeClass} />
    </div>
  );
}
