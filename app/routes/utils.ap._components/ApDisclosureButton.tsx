import { ChevronDownIcon } from "@heroicons/react/16/solid";
import { cn } from "~/lib/utils";

export default function ApDisclosureButton({
  children,
  expanded,
  controls,
  onClick,
  className,
}: {
  children: React.ReactNode;
  expanded: boolean;
  controls: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
      )}
      onClick={onClick}
    >
      {children}
      <ChevronDownIcon
        aria-hidden="true"
        className={cn("size-4 transition-transform duration-200", expanded && "rotate-180")}
      />
    </button>
  );
}
