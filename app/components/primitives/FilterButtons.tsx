import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { type AttributeBadgeColor, semanticColorStripeClass } from "./AttributeBadge";

// === FilterButtons
export type FilterButtonsProps = {
  Icon?: React.ElementType;
  buttonProps: FilterButtonProps[];
  exclusive?: boolean;
  atLeastOne?: boolean;
  size?: "sm" | "md";
  surface?: "page" | "panel";
  className?: string;
  buttonGroupClassName?: string;
};

export default function FilterButtons({
  Icon,
  buttonProps,
  exclusive,
  atLeastOne,
  size = "md",
  surface = "panel",
  className,
  buttonGroupClassName,
}: FilterButtonsProps) {
  const [actives, setActives] = useState(() => getActiveStates(buttonProps));

  useEffect(() => {
    setActives(getActiveStates(buttonProps));
  }, [buttonProps]);

  return (
    <div className={cn("my-2 flex items-start gap-x-1 md:gap-x-1.5", className)}>
      {Icon && <Icon className="h-5 w-5 mt-2 shrink-0" strokeWidth={2} />}
      <div className={cn("flex flex-wrap items-center gap-x-1 gap-y-1.5 md:gap-x-1.5", buttonGroupClassName)}>
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
            surface={surface}
          />
        ))}
      </div>
    </div>
  );
}

// === FilterButton
export type FilterButtonProps = {
  text: string;
  subText?: string;
  color?: AttributeBadgeColor;
  active?: boolean;
  onToggle: (activated: boolean) => void;
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
  surface,
}: FilterButtonProps & { size: "sm" | "md"; surface: NonNullable<FilterButtonsProps["surface"]> }) {
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
          active
            ? "bg-foreground text-background hover:bg-foreground/90"
            : surface === "page"
              ? "bg-card text-foreground shadow-sm shadow-black/5 hover:bg-foreground/10 dark:bg-muted dark:shadow-none"
              : "bg-muted text-foreground hover:bg-foreground/10"
        }
        ${color ? `relative overflow-hidden pl-2.5 before:absolute before:inset-y-0 before:left-0 before:w-1 ${semanticColorStripeClass[color]}` : ""}
      `)}
      data-colored={color ? "true" : undefined}
      onClick={() => {
        onToggle(!active);
      }}
    >
      <span className={`${textSizeClass} tracking-tighter shrink-0`}>{text}</span>
      {subText && (
        <span className={`text-xs ${active ? "text-background/70" : "text-muted-foreground"}`}>{subText}</span>
      )}
    </button>
  );
}
