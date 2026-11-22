import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "../../primitives/Button";

export function LoadFailureState({
  onRetry,
  title = "학생 목록을 불러오지 못했어요",
}: {
  onRetry: () => void;
  title?: string;
}) {
  return (
    <div className="flex justify-center py-16">
      <div role="alert" className="w-full max-w-xl rounded-lg bg-v2-surface p-v2-block-p">
        <p className="text-base leading-[1.4] font-semibold text-v2-fg">{title}</p>
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          다시 시도
        </Button>
      </div>
    </div>
  );
}
