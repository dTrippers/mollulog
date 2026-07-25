import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { Button, SectionCard } from "~/components/primitives";

type ScannerCompletionStateProps = {
  title: string;
  description: string;
  actionLabel: string;
  onStartNew: () => void;
};

export default function ScannerCompletionState({
  title,
  description,
  actionLabel,
  onStartNew,
}: ScannerCompletionStateProps) {
  return (
    <SectionCard>
      <div className="flex flex-col items-center py-6 text-center">
        <span className="flex size-11 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
          <CheckCircleIcon className="size-6" aria-hidden="true" />
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
