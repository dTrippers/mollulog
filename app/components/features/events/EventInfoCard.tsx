import { ArrowRightIcon } from "@heroicons/react/16/solid";
import { ClickableSurface } from "~/components/primitives";

type EventInfoCardProps = {
  Icon: React.ElementType;
  title: string;
  description: string;

  color?: "default" | "yellow";
  onClick?: () => void;
  showArrow?: boolean;
};

export default function EventInfoCard({
  Icon,
  title,
  description,
  color,
  onClick,
  showArrow = false,
}: EventInfoCardProps) {
  let bgColorClass = "bg-card";
  let iconBgColorClass = "bg-muted";
  let titleColorClass = "text-foreground";
  let textColorClass = "text-muted-foreground";
  if (color === "yellow") {
    bgColorClass = "bg-amber-500/10";
    iconBgColorClass = "bg-amber-100 dark:bg-amber-900";
    titleColorClass = "text-amber-700 dark:text-amber-300";
    textColorClass = "text-amber-700 dark:text-amber-300";
  }

  return (
    <ClickableSurface
      onClick={onClick}
      className={`my-3 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-shadow md:px-4 md:py-3 ${bgColorClass} ${onClick ? "cursor-pointer hover:shadow-sm" : ""}`}
    >
      <div className={`flex-shrink-0 p-2 rounded-lg ${iconBgColorClass}`}>
        <Icon className={`size-4 md:size-5 ${textColorClass}`} />
      </div>
      <div className="grow">
        <h4 className={`mb-0.5 text-sm font-semibold ${titleColorClass}`}>{title}</h4>
        <p className={`text-xs ${textColorClass}`}>{description}</p>
      </div>
      {showArrow && <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />}
    </ClickableSurface>
  );
}
