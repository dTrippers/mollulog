import { Link } from "react-router";
import { ExclamationTriangleIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/16/solid";
import type { ReactNode } from "react";

type TimelineItemBannerProps = {
  title?: ReactNode;
  message: ReactNode;
  link?: string;
  linkText?: string;
  onLinkClick?: () => void;
  onDismiss?: () => void;
  icon?: "exclamation" | "info";
  color?: "amber" | "green";
};

const colorClasses = {
  amber: {
    container: "from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20",
    icon: "text-amber-600 dark:text-amber-400",
    text: "text-amber-700 dark:text-amber-300",
    link: "text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300",
    action: "bg-amber-600/10 text-amber-700 hover:bg-amber-600/15 dark:bg-amber-400/10 dark:text-amber-300 dark:hover:bg-amber-400/15",
    close: "text-amber-700/70 hover:bg-amber-600/10 hover:text-amber-800 dark:text-amber-300/70 dark:hover:bg-amber-400/10 dark:hover:text-amber-200",
  },
  green: {
    container: "from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20",
    icon: "text-green-600 dark:text-green-400",
    text: "text-green-700 dark:text-green-300",
    link: "text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300",
    action: "bg-green-600/10 text-green-700 hover:bg-green-600/15 dark:bg-green-400/10 dark:text-green-300 dark:hover:bg-green-400/15",
    close: "text-green-700/70 hover:bg-green-600/10 hover:text-green-800 dark:text-green-300/70 dark:hover:bg-green-400/10 dark:hover:text-green-200",
  },
};

export function TimelineItemBanner({
  title,
  message,
  link,
  linkText = "자세히 보기",
  onLinkClick,
  onDismiss,
  icon = "exclamation",
  color = "amber",
}: TimelineItemBannerProps) {
  const IconComponent = icon === "info" ? SparklesIcon : ExclamationTriangleIcon;
  const classes = colorClasses[color];
  const structured = Boolean(title || onDismiss);
  const linkClassName = structured
    ? `inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold leading-4 transition ${classes.action}`
    : `inline-flex flex-shrink-0 items-center underline cursor-pointer ${classes.link}`;
  const renderAction = (className = "") => {
    const actionClassName = className ? `${linkClassName} ${className}` : linkClassName;
    if (link) {
      return (
        <Link to={link} className={actionClassName}>
          {linkText}
        </Link>
      );
    }
    if (onLinkClick) {
      return (
        <button type="button" className={actionClassName} onClick={onLinkClick}>
          {linkText}
        </button>
      );
    }
    return null;
  };
  const action = renderAction();
  const mobileAction = structured ? renderAction("sm:hidden") : null;

  return (
    <div
      className={`my-2 px-2 py-2 flex items-start gap-x-2 bg-gradient-to-r ${classes.container} rounded-xl text-sm sm:items-center`}
    >
      <IconComponent className={`mt-0.5 shrink-0 size-5 ${classes.icon} sm:mt-0`} />
      <div className={`min-w-0 flex-1 ${structured ? "sm:flex sm:min-h-6 sm:items-center" : ""}`}>
        {title && <p className={`text-xs font-semibold leading-none ${classes.icon}`}>{title}</p>}
        <p className={`min-w-0 ${structured ? "text-sm leading-normal" : ""} ${classes.text}`}>{message}</p>
        {mobileAction && <div className="mt-2">{mobileAction}</div>}
      </div>
      <div className="ml-auto flex shrink-0 items-start gap-1 sm:items-center">
        {structured ? action && <div className="hidden items-center sm:flex">{action}</div> : action}
        {onDismiss && (
          <button
            type="button"
            className={`inline-flex items-center justify-center rounded-md p-1 transition ${classes.close}`}
            onClick={onDismiss}
            aria-label="배너 닫기"
          >
            <XMarkIcon className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default TimelineItemBanner;
