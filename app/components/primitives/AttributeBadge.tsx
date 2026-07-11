import { cn } from "~/lib/utils";

export const semanticColorStripeClass = {
  red: "before:bg-red-500",
  yellow: "before:bg-yellow-500",
  green: "before:bg-green-600",
  blue: "before:bg-blue-500",
  purple: "before:bg-purple-500",
  grey: "before:bg-neutral-500",
};

export type AttributeBadgeColor = keyof typeof semanticColorStripeClass;

type AttributeBadgeProps = {
  text: string;
  color?: AttributeBadgeColor;
};

export default function AttributeBadge({ text, color = "grey" }: AttributeBadgeProps) {
  return (
    <div
      className={cn(`
        relative inline-flex w-fit shrink-0 justify-self-start overflow-hidden rounded-md bg-muted py-1 pr-2 pl-2.5 text-xs leading-none text-foreground
        before:absolute before:inset-y-0 before:left-0 before:w-1
        ${semanticColorStripeClass[color]}
      `)}
    >
      {text}
    </div>
  );
}
