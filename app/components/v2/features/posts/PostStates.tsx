import { ArrowPathIcon } from "@heroicons/react/20/solid";
import { Button } from "../../primitives/Button";

// Shown in place of the list when no post is registered. The pagination is hidden with it.
export function PostListEmpty() {
  return <div className="rounded-lg bg-v2-surface p-v2-block-p text-sm text-v2-fg-secondary">등록된 소식이 없어요</div>;
}

export function PostListFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg bg-v2-surface p-v2-block-p">
      <p className="text-base leading-6 font-semibold text-v2-fg">업데이트 소식을 불러오지 못했어요</p>
      <div className="mt-3">
        <Button variant="secondary" onClick={onRetry}>
          <ArrowPathIcon className="size-4" aria-hidden="true" />
          다시 시도
        </Button>
      </div>
    </div>
  );
}

// The header carries the title. This block holds the explanation only.
export function PostNotFound() {
  return (
    <div className="rounded-lg bg-v2-surface p-v2-block-p">
      <p className="text-sm leading-5 text-v2-fg-secondary">주소가 바뀌었거나 삭제된 글일 수 있어요.</p>
    </div>
  );
}

export function PostDetailFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-lg bg-v2-surface p-v2-block-p">
      <Button variant="secondary" onClick={onRetry}>
        <ArrowPathIcon className="size-4" aria-hidden="true" />
        다시 시도
      </Button>
    </div>
  );
}

// Replaces only the recent-news rows. The body above stays readable.
export function RecentPostsFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-v2-surface px-v2-block-p py-3"
    >
      <p className="text-sm leading-5 text-v2-fg">최근 소식을 불러오지 못했어요</p>
      <Button variant="text" onClick={onRetry}>
        <ArrowPathIcon className="size-4" aria-hidden="true" />
        다시 시도
      </Button>
    </div>
  );
}
