import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Button, SectionCard } from "~/components/primitives";
import { cn } from "~/lib/utils";

type ScannerCompletionStateProps = {
  title: string;
  description: string;
  actionLabel: string;
  onStartNew: () => void;
  tone?: "success" | "destructive";
};

export default function ScannerCompletionState({
  title,
  description,
  actionLabel,
  onStartNew,
  tone = "success",
}: ScannerCompletionStateProps) {
  const Icon = tone === "success" ? CheckCircleIcon : ExclamationTriangleIcon;

  return (
    <SectionCard>
      <div className="flex flex-col items-center py-6 text-center">
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full",
            tone === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
              : "bg-destructive/10 text-destructive",
          )}
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <Button variant="primary" className="mt-5" onClick={onStartNew}>
          {actionLabel}
        </Button>
      </div>
    </SectionCard>
  );
}
