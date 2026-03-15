import { Link } from "react-router";
import { ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/16/solid";

type TimelineItemBannerProps = {
  message: string;
  link: string;
  linkText?: string;
  icon?: "exclamation" | "info";
};

export function TimelineItemBanner({ message, link, linkText = "자세히 보기", icon = "exclamation" }: TimelineItemBannerProps) {
  const IconComponent = icon === "info" ? InformationCircleIcon : ExclamationTriangleIcon;

  return (
    <div className="my-2 px-2 py-2 flex items-center gap-x-2 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-xl text-sm">
      <IconComponent className="shrink-0 size-5 text-amber-600 dark:text-amber-400" />
      <div className="flex flex-wrap gap-x-1">
        <p className="shrink-0 text-amber-700 dark:text-amber-300">
          {message}
        </p>
        <Link to={link} className="flex-shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 underline cursor-pointer">
          {linkText}
        </Link>
      </div>
    </div>
  );
}

export default TimelineItemBanner;
