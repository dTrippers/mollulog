import { Link } from "react-router";
import { sanitizeClassName } from "~/prophandlers";

export type PageScreenSelectorProps = {
  screens: PageScreenSelectorItemProps[];
};

export type PageScreenSelectorItemProps = {
  text: string;
  description?: string;
  Icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;

  onClick?: () => void;
  link?: string;
};

export default function PageScreenSelector({ screens }: PageScreenSelectorProps) {
  return (
    <div className="hidden lg:block my-4">
      {screens.map((screen) => <PageScreenSelectorItem key={screen.link ?? screen.text} {...screen} />)}
    </div>
  );
}

function PageScreenSelectorItem({ text, description, Icon, active, disabled, onClick, link }: PageScreenSelectorItemProps) {
  const classNames = ["flex items-center justify-between gap-x-3 my-2 w-full py-3 px-4 rounded-lg transition-all duration-200 border text-left"];
  if (disabled) {
    classNames.push("bg-neutral-100 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 cursor-not-allowed opacity-60");
  } else if (active) {
    classNames.push("bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 cursor-pointer");
  } else {
    classNames.push("bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer");
  }

  const inner = (
    <>
      <Icon className={`size-5 shrink-0 ${active ? "text-blue-500 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`} strokeWidth={2} />
      <div className="grow">
        <p className={`text-sm font-semibold transition-colors ${disabled ? "text-neutral-400 dark:text-neutral-500" : active ? "text-blue-700 dark:text-blue-300" : "text-neutral-700 dark:text-neutral-300"}`}>
          {text}
        </p>
        {description && (
          <p className={`text-xs ${disabled ? "text-neutral-400 dark:text-neutral-500" : active ? "text-blue-500 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`}>
            {description}
          </p>
        )}
      </div>
    </>
  );

  if (!disabled && link) {
    return (
      <Link to={link} className={classNames.join(" ")}>
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={sanitizeClassName(classNames.join(" "))}
      onClick={disabled ? undefined : onClick}
      disabled={disabled || !onClick}
    >
      {inner}
    </button>
  );
}
