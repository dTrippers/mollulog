import { BoltIcon, StarIcon, HeartIcon, UserGroupIcon } from "@heroicons/react/16/solid";
import type { StudentGradingTagValue } from "~/models/student-grading-tag";

type TagIconProps = {
  tag: StudentGradingTagValue;
  size?: "sm" | "md" | "lg";
};

export default function TagIcon({ tag, size = "md" }: TagIconProps) {
  // Size classes
  const sizeClasses = {
    sm: "size-4",
    md: "size-5",
    lg: "size-6"
  };

  // Define specific colors for each icon (chart style)
  const getIconColor = (tag: StudentGradingTagValue) => {
    switch (tag) {
      case "performance":
        return "text-yellow-600 dark:text-yellow-400";
      case "universal":
        return "text-green-600 dark:text-green-400";
      case "growth":
        return "text-sky-600 dark:text-sky-400";
      case "love":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-neutral-600 dark:text-neutral-400";
    }
  };

  const baseClasses = sizeClasses[size];
  const colorClasses = getIconColor(tag);
  switch (tag) {
    case "performance":
      return <BoltIcon className={`${baseClasses} ${colorClasses}`} />;
    case "universal":
      return <UserGroupIcon className={`${baseClasses} ${colorClasses}`} />;
    case "growth":
      return <StarIcon className={`${baseClasses} ${colorClasses}`} />;
    case "love":
      return <HeartIcon className={`${baseClasses} ${colorClasses}`} />;
    default:
      return null;
  }
}
