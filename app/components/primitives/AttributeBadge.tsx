import { sanitizeClassName } from "~/prophandlers";

const stripeColorClass = {
  red: "before:bg-red-500",
  yellow: "before:bg-yellow-500",
  green: "before:bg-green-600",
  blue: "before:bg-blue-500",
  purple: "before:bg-purple-500",
  grey: "before:bg-neutral-500",
};

export type AttributeBadgeColor = keyof typeof stripeColorClass;

type AttributeBadgeProps = {
  text: string;
  color: AttributeBadgeColor;
};

export default function AttributeBadge({ text, color }: AttributeBadgeProps) {
  return (
    <div
      className={sanitizeClassName(`
        relative inline-flex w-fit justify-self-start flex-shrink-0 overflow-hidden rounded-l-sm rounded-r-md bg-neutral-200 py-0.5 pr-1.5 pl-2 text-xs leading-none text-neutral-800
        before:absolute before:inset-y-0 before:left-0 before:w-1 dark:bg-neutral-800 dark:text-neutral-200
        ${stripeColorClass[color]}
      `)}
    >
      {text}
    </div>
  );
}
