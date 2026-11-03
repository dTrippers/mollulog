import { ArrowPathIcon } from "@heroicons/react/16/solid";
import { Button } from "../../primitives/Button";

export function LoadFailureState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex justify-center py-16">
      <div role="alert" className="w-full max-w-xl rounded-lg bg-v2-surface p-v2-block-p">
        <p className="text-base font-semibold text-v2-fg">학생 목록을 불러오지 못했어요</p>
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          다시 시도
        </Button>
      </div>
    </div>
  );
}
