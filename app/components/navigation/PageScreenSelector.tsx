import { Link } from "react-router";

export type PageScreenSelectorProps = {
  screens: PageScreenSelectorItemProps[];
}

export type PageScreenSelectorItemProps = {
  text: string;
  description?: string;
  Icon: React.ElementType;
  active?: boolean;
  disabled?: boolean;

  onClick?: () => void;
  link?: string;
}

export default function PageScreenSelector({ screens }: PageScreenSelectorProps) {
  return (
    <div className="hidden xl:block my-4">
      {screens.map((screen, index) => <PageScreenSelectorItem key={index} {...screen} />)}
    </div>
  );
}

function PageScreenSelectorItem({ text, description, Icon, active, disabled, onClick, link }: PageScreenSelectorItemProps) {
  const classNames = ["flex items-center justify-between gap-x-3 my-2 w-full py-3 px-4 rounded-lg transition-all duration-200 border"];
  if (disabled) {
    classNames.push("bg-neutral-100 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 cursor-not-allowed opacity-60");
  } else if (active) {
    classNames.push("bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 cursor-pointer");
  } else {
    classNames.push("bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer");
  }

  const Inner = (
    <div className={classNames.join(" ")} onClick={disabled ? undefined : onClick}>
      <Icon className={`size-5 shrink-0 ${active ? "text-blue-500 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`} strokeWidth={2} />
      <div className="grow">
        <p className={`font-semibold transition-colors ${disabled ? "text-neutral-400 dark:text-neutral-500" : active ? "text-blue-700 dark:text-blue-300" : "text-neutral-700 dark:text-neutral-300"}`}>
          {text}
        </p>
        {description && (
          <p className={`text-sm ${disabled ? "text-neutral-400 dark:text-neutral-500" : active ? "text-blue-500 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`}>
            {description}
          </p>
        )}
      </div>
    </div>
  );

  return (!disabled && link) ? <Link to={link}>{Inner}</Link> : Inner;
}
