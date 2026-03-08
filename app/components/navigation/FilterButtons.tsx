import { useState, useEffect } from "react";
import { sanitizeClassName } from "~/prophandlers";

// === FilterButtons
type FilterButtonsProps = {
  Icon?: React.ElementType,
  buttonProps: FilterButtonProps[],
  exclusive?: boolean;
  atLeastOne?: boolean;
  size?: "sm" | "md";
};

export default function FilterButtons({ Icon, buttonProps, exclusive, atLeastOne, size = "md" }: FilterButtonsProps) {
  const [actives, setActives] = useState(() => buttonProps.map((prop) => prop.active ?? false));
  useEffect(() => {
    setActives(buttonProps.map((prop) => prop.active ?? false));
  }, [buttonProps]);

  return (
    <div className="my-2 flex items-start gap-x-1 md:gap-x-1.5">
      {Icon && <Icon className="h-5 w-5 mt-2 shrink-0" strokeWidth={2} />}
      <div className="flex flex-wrap items-center gap-x-1 md:gap-x-1.5 gap-y-1.5">
        {buttonProps.map((prop, index) => (
          <FilterButton
            key={`${prop.text}-${index}`}
            text={prop.text}
            subText={prop.subText}
            color={prop.color}
            active={actives[index]}
            onToggle={(activated) => {
              if (atLeastOne && !activated && actives.filter((active) => active).length <= 1) {
                return;
              } else if (exclusive) {
                const newActives = new Array(buttonProps.length).fill(false);
                newActives[index] = activated;
                setActives(newActives);
              } else {
                setActives((prev) => { const newActives = [...prev]; newActives[index] = activated; return newActives; })
              }
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

function FilterButton({ text, subText, color, active, onToggle, size = "md" }: FilterButtonProps & { size: "sm" | "md" }) {
  let textSizeClass = "text-sm";
  if (size === "md") {
    textSizeClass = "text-base";
  }

  return (
    <div
      className={sanitizeClassName(`
        flex items-center px-2 py-1 rounded-lg cursor-pointer transition-colors border border-neutral-200 dark:border-neutral-700 gap-x-1
        ${active ?
          "bg-neutral-800 hover:bg-neutral-700 dark:bg-neutral-200 dark:hover:bg-neutral-300 text-neutral-200 dark:text-neutral-700" :
          "bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-neutral-700 dark:text-neutral-200"}
      `)}
      onClick={() => { onToggle(!active); }}
    >
      {color && <div className={`size-2.5 rounded-full ` + buttonColors[color]} />}
      <span className={`${textSizeClass} tracking-tighter shrink-0`}>{text}</span>
      {subText && <span className={`text-xs ${active ? "text-neutral-300 dark:text-neutral-700" : "text-neutral-500 dark:text-neutral-400"}`}>{subText}</span>}
    </div>
  );
}
