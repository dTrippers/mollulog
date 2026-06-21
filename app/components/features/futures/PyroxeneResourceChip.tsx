import { ResourceCard } from "~/components/primitives";
import type { ResourceTypeEnum } from "~/graphql/graphql";
import { cn } from "~/lib/utils";

type PyroxeneResourceChipTone = "positive" | "negative" | "neutral" | "muted";

type PyroxeneResourceChipProps = {
  resourceType: ResourceTypeEnum;
  itemUid: string;
  value: number | string;
  caption?: string;
  tone?: PyroxeneResourceChipTone;
  variant?: "solid" | "plain";
  className?: string;
};

export default function PyroxeneResourceChip({
  resourceType,
  itemUid,
  value,
  caption,
  tone = "neutral",
  variant = "solid",
  className,
}: PyroxeneResourceChipProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-xs",
        variant === "solid" &&
          "rounded-md border border-neutral-200 bg-white/70 px-1.5 py-1 dark:border-neutral-700 dark:bg-neutral-950/40",
        variant === "plain" && "py-0.5",
        tone === "positive" && "text-green-600 dark:text-green-400",
        tone === "negative" && "text-red-500 dark:text-red-400",
        tone === "neutral" && "text-neutral-900 dark:text-neutral-100",
        tone === "muted" && "text-neutral-500 dark:text-neutral-400",
        className,
      )}
    >
      <ResourceCard resourceType={resourceType} itemUid={itemUid} size="sm" />
      <span className={cn("min-w-0 leading-tight", variant === "plain" && "inline-flex items-baseline gap-1")}>
        <span className="block truncate font-semibold">{value}</span>
        {caption && <span className="block truncate text-neutral-500 dark:text-neutral-400">{caption}</span>}
      </span>
    </span>
  );
}
