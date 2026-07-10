import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";

// === FilterButtons
type FilterButtonsProps = {
  Icon?: React.ElementType;
  buttonProps: FilterButtonProps[];
  exclusive?: boolean;
  atLeastOne?: boolean;
  size?: "sm" | "md";
};

export default function FilterButtons({ Icon, buttonProps, exclusive, atLeastOne, size = "md" }: FilterButtonsProps) {
  const [actives, setActives] = useState(() => getActiveStates(buttonProps));

  useEffect(() => {
    setActives(getActiveStates(buttonProps));
  }, [buttonProps]);

  return (
    <div className="my-2 flex items-start gap-x-1 md:gap-x-1.5">
      {Icon && <Icon className="h-5 w-5 mt-2 shrink-0" strokeWidth={2} />}
      <div className="flex flex-wrap items-center gap-x-1 md:gap-x-1.5 gap-y-1.5">
        {buttonProps.map((prop, index) => (
          <FilterButton
            key={`${prop.text}-${prop.subText ?? "none"}`}
            text={prop.text}
            subText={prop.subText}
            color={prop.color}
            active={actives[index]}
            onToggle={(activated) => {
              const nextActives = getNextActiveStates({
                actives,
                buttonCount: buttonProps.length,
                index,
                activated,
                exclusive: exclusive ?? false,
              });

              if (atLeastOne && !activated && actives.filter(Boolean).length <= 1) {
                return;
              }

              setActives(nextActives);
              prop.onToggle(activated);
            }}
            size={size}
          />
        ))}
      </div>
    </div>
  );
}

// === FilterButton
type FilterButtonProps = {
  text: string;
  subText?: string;
  color?: "red" | "yellow" | "green" | "blue" | "purple" | "grey";
  active?: boolean;
  onToggle: (activated: boolean) => void;
};

const buttonColors = {
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-green-600",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  grey: "bg-neutral-500",
};

function getActiveStates(buttonProps: FilterButtonProps[]) {
  return buttonProps.map((prop) => prop.active ?? false);
}

function getNextActiveStates({
  actives,
  buttonCount,
  index,
  activated,
  exclusive,
}: {
  actives: boolean[];
  buttonCount: number;
  index: number;
  activated: boolean;
  exclusive: boolean;
}) {
  if (exclusive) {
    const nextActives = new Array(buttonCount).fill(false);
    nextActives[index] = activated;
    return nextActives;
  }

  const nextActives = [...actives];
  nextActives[index] = activated;
  return nextActives;
}

function FilterButton({
  text,
  subText,
  color,
  active,
  onToggle,
  size = "md",
}: FilterButtonProps & { size: "sm" | "md" }) {
  let textSizeClass = "text-sm";
  if (size === "md") {
    textSizeClass = "text-base";
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(`
        inline-flex items-center gap-x-1 rounded-md px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30
        ${
          active ? "bg-foreground text-background hover:bg-foreground/90" : "bg-muted text-foreground hover:bg-muted/80"
        }
      `)}
      onClick={() => {
        onToggle(!active);
      }}
    >
      {color && <div className={`size-2.5 rounded-full ${buttonColors[color]}`} />}
      <span className={`${textSizeClass} tracking-tighter shrink-0`}>{text}</span>
      {subText && (
        <span className={`text-xs ${active ? "text-background/70" : "text-muted-foreground"}`}>{subText}</span>
      )}
    </button>
  );
}
