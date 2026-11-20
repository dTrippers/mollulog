import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "../../primitives/Button";

export function RaidRecordLoadFailure({
  onRetry,
  retrying = false,
  title = "기록을 불러오지 못했어요",
}: {
  onRetry: () => void;
  retrying?: boolean;
  title?: string;
}) {
  return (
    <div role="alert" className="rounded-lg bg-v2-surface px-v2-block-p py-10 text-center">
      <p className="text-base font-semibold text-v2-fg">{title}</p>
      <p className="mt-1 text-sm text-v2-fg-tertiary">잠시 후 다시 시도해 주세요.</p>
      <Button className="mt-3" onClick={onRetry} disabled={retrying}>
        <ArrowPathIcon className="size-4" aria-hidden="true" />
        다시 시도
      </Button>
    </div>
  );
}
