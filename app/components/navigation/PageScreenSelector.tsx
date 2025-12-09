import { Link } from "react-router";
import { useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { Transition } from "@headlessui/react";

export type PageScreenSelectorProps = {
  screens: PageScreenSelectorItemProps[];
}

export default function PageScreenSelector({ screens }: PageScreenSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const activeScreen = screens.find((screen) => screen.active);

  return (
    <div className="relative my-4">
      {/* Desktop: Show all screens */}
      <div className="hidden xl:block">
        {screens.map((screen, index) => <PageScreenSelectorItem key={index} {...screen} />)}
      </div>

      {/* Mobile: Show only active screen, click to show dropdown */}
      <div className="xl:hidden">
        {activeScreen && (
          <div className="cursor-pointer" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
            <PageScreenSelectorItem {...activeScreen} showChevron rotateChevron={isDropdownOpen} link={undefined} />
          </div>
        )}

        {/* Dropdown menu */}
        <Transition
          show={isDropdownOpen}
          as="div"
          enter="transition duration-200 ease-out"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="transition duration-100 ease-in"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
          className="absolute top-full left-0 w-full mt-2 z-10"
        >
          <div className="max-h-96 overflow-y-auto no-scrollbar bg-white/90 dark:bg-black/80 backdrop-blur-sm border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg">
            {screens.map((screen, index) => (
              <DropdownItem
                key={index}
                text={screen.text}
                Icon={screen.Icon}
                description={screen.description}
                active={screen.active}
                disabled={screen.disabled}
                link={screen.link}
                onClick={() => {
                  setIsDropdownOpen(false);
                  screen.onClick?.();
                }}
              />
            ))}
          </div>
        </Transition>
      </div>
    </div>
  );
}

type PageScreenSelectorItemProps = {
  text: string;
  description?: string;
  Icon?: React.ElementType;
  active?: boolean;
  disabled?: boolean;

  onClick?: () => void;
  link?: string;

  showChevron?: boolean;
  rotateChevron?: boolean;
}

function PageScreenSelectorItem({ text, description, Icon, active, disabled, onClick, link, showChevron, rotateChevron }: PageScreenSelectorItemProps) {
  const classNames = ["flex items-center justify-between gap-x-3 my-2 w-full py-3 px-4 rounded-lg transition-all duration-200 border"];
  if (disabled) {
    classNames.push("bg-neutral-100 dark:bg-neutral-800/50 border-neutral-200 dark:border-neutral-700 cursor-not-allowed opacity-60");
  } else if (active) {
    classNames.push("bg-white xl:bg-blue-50 dark:bg-neutral-900 xl:dark:bg-blue-900/20 border-neutral-200 xl:border-blue-200 dark:border-neutral-700 xl:dark:border-blue-700 cursor-pointer");
  } else {
    classNames.push("bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700 cursor-pointer");
  }

  const Inner = (
    <div className={classNames.join(" ")} onClick={disabled ? undefined : onClick}>
      {Icon && <Icon className={`size-5 shrink-0 ${active ? "xl:text-blue-500 xl:dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`} strokeWidth={2} />}
      <div className="grow">
        <p className={`font-semibold transition-colors ${disabled ? "text-neutral-400 dark:text-neutral-500" : active ? "xl:text-blue-700 xl:dark:text-blue-300" : "text-neutral-700 dark:text-neutral-300"}`}>
          {text}
        </p>
        {description && (
          <p className={`text-sm ${disabled ? "text-neutral-400 dark:text-neutral-500" : active ? "xl:text-blue-500 xl:dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`}>
            {description}
          </p>
        )}
      </div>
      {showChevron && (
        <ChevronDownIcon className={`size-5 shrink-0 transition-transform duration-200 ${rotateChevron ? "rotate-180" : ""}`} />
      )}
    </div>
  );

  return (!disabled && link) ? <Link to={link}>{Inner}</Link> : Inner;
}

type DropdownItemProps = {
  text: string;
  description?: string;
  Icon?: React.ElementType;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  link?: string;
};

function DropdownItem({ text, description, Icon, active, disabled, onClick, link }: DropdownItemProps) {
  const classNames = ["flex items-center gap-x-3 px-4 py-3 cursor-pointer transition-colors duration-100"];
  if (disabled) {
    classNames.push("text-neutral-400 dark:text-neutral-500 cursor-not-allowed opacity-60");
  } else if (active) {
    classNames.push("bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300");
  } else {
    classNames.push("text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800");
  }

  const content = (
    <div className={classNames.join(" ")} onClick={disabled ? undefined : onClick}>
      {Icon && <Icon className={`size-5 shrink-0 ${active ? "text-blue-500 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`} strokeWidth={2} />}
      <div>
        <p className="font-bold transition-colors">{text}</p>
        {description && (
          <p className={`text-sm ${disabled ? "text-neutral-400 dark:text-neutral-500" : active ? "text-blue-500 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}`}>
            {description}
          </p>
        )}
      </div>
    </div>
  );

  return link ? <Link to={link}>{content}</Link> : content;
}

