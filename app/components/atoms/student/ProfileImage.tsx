import { UserIcon } from "@heroicons/react/24/outline";
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
    case 8:
    default:
      [imageSizeClass, iconSizeClass] = ["size-8", "size-6"];
  }

  return studentUid ?
    <img className={`${imageSizeClass} inline rounded-full object-cover`} src={studentImageUrl(studentUid)} alt="학생 프로필" /> :
    (
      <div className={`${imageSizeClass} flex items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300`}>
        <UserIcon className={iconSizeClass} />
      </div>
    );
}
