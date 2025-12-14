import { ArrowRightIcon } from "@heroicons/react/16/solid";

type EventInfoCardProps = {
  Icon: React.ElementType;
  title: string;
  description: string;

  color?: "default" | "yellow";
  onClick?: () => void;
  showArrow?: boolean;
};

export default function EventInfoCard({ Icon, title, description, color, onClick, showArrow = false }: EventInfoCardProps) {
  let bgColorClass = "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700";
  let iconBgColorClass = "bg-neutral-100 dark:bg-neutral-700";
  let titleColorClass = "text-neutral-900 dark:text-neutral-100";
  let textColorClass = "text-neutral-700 dark:text-neutral-300";
  if (color === "yellow") {
    bgColorClass = "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700";
    iconBgColorClass = "bg-amber-100 dark:bg-amber-900";
    titleColorClass = "text-amber-700 dark:text-amber-300";
    textColorClass = "text-amber-700 dark:text-amber-300";
  }

  return (
    <div
      onClick={onClick}
      className={`my-2 flex items-center gap-3 px-4 py-3 md:py-4 rounded-lg border ${bgColorClass} ${onClick ? "cursor-pointer hover:opacity-50 transition-opacity" : ""}`}
    >
      <div className={`flex-shrink-0 p-2 rounded-lg ${iconBgColorClass}`}>
        <Icon className={`size-5 ${textColorClass}`} />
      </div>
      <div className="grow">
        <h4 className={`font-semibold ${titleColorClass} mb-1`}>{title}</h4>
        <p className={`text-sm ${textColorClass}`}>{description}</p>
      </div>
      {showArrow && (
        <ArrowRightIcon className="size-4 text-neutral-600 dark:text-neutral-300" />
      )}
    </div>
  );
}
