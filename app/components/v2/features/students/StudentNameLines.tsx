import { cn } from "~/lib/utils";

export function StudentNameLines({
  name,
  variant,
  className,
}: {
  name: string;
  variant: string | null;
  className?: string;
}) {
  return (
    <>
      <span className={cn("block w-full truncate text-center text-xs leading-4 text-v2-fg", className)}>{name}</span>
      {variant ? (
        <span className="block w-full truncate text-center text-[0.6875rem] leading-4 text-v2-fg-tertiary">
          {variant}
        </span>
      ) : null}
    </>
  );
}
