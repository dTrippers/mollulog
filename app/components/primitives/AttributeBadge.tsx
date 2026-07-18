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
  color?: AttributeBadgeColor | null;
};

export default function AttributeBadge({ text, color = "grey" }: AttributeBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex w-fit shrink-0 justify-self-start rounded-md bg-muted px-2 py-1 text-xs leading-none text-foreground",
        color &&
          `relative overflow-hidden pl-2.5 before:absolute before:inset-y-0 before:left-0 before:w-1 ${semanticColorStripeClass[color]}`,
      )}
    >
      {text}
    </div>
  );
}
