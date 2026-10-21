import { Button } from "../../primitives/Button";

export function DirectoryViewerFailureNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-v2-surface px-v2-block-p py-3">
      <p className="text-sm text-v2-fg">내 기록을 불러오지 못했어요</p>
      <Button variant="text" className="min-h-10 px-2 text-sm" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  );
}
