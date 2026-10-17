import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { ChatBubbleOvalLeftEllipsisIcon } from "@heroicons/react/24/outline";
import { cn } from "~/lib/utils";
import { v2FocusRing } from "../../layout/styles";
import { Skeleton } from "../../primitives/Skeleton";
import type { FutureOpinionState } from "./types";

const PREVIEW_LENGTH = 50;

// Inset opinion row, limited to a readable width on desktop. Count, a live dot for an opinion from the last three days,
// and the pinned opinion's preview or a prompt to write one. Pressing it opens the opinion sheet. A failed summary is disabled, so the row cannot
// open an empty thread. While the summary loads, the row is a skeleton of the same size.
export function OpinionRow({ opinion, onOpen }: { opinion: FutureOpinionState; onOpen: () => void }) {
  const summary = opinion.summary;
  if (summary === undefined) {
    return (
      <div
        aria-busy="true"
        className="flex min-h-v2-row-min w-full max-w-[40rem] items-center gap-2 rounded-md bg-v2-inset px-3 py-2"
      >
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  if (summary === null) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "flex min-h-v2-row-min w-full max-w-[40rem] cursor-not-allowed items-center gap-2 rounded-md bg-v2-inset px-3 py-2 text-left text-sm text-v2-fg-disabled",
          v2FocusRing,
        )}
      >
        <ChatBubbleOvalLeftEllipsisIcon className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">의견을 불러오지 못했습니다</span>
      </button>
    );
  }

  const preview = summary.pinnedPreviewBody
    ? summary.pinnedPreviewBody.length > PREVIEW_LENGTH
      ? `${summary.pinnedPreviewBody.slice(0, PREVIEW_LENGTH)}…`
      : summary.pinnedPreviewBody
    : null;

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className={cn(
        "flex min-h-v2-row-min w-full max-w-[40rem] cursor-pointer items-center gap-2 rounded-md bg-v2-inset px-3 py-2 text-left text-sm text-v2-fg hover:bg-v2-filled-hover",
        v2FocusRing,
      )}
    >
      <ChatBubbleOvalLeftEllipsisIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-v2-fg-tertiary tabular-nums" aria-hidden="true">
          {summary.count}
        </span>
        <span className="sr-only">의견 {summary.count}개</span>
        {summary.hasRecentComment ? (
          <>
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-v2-live motion-safe:animate-pulse"
            />
            <span className="sr-only">최근 3일 내 새 의견 있음</span>
          </>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-v2-fg-secondary">{preview ?? "의견을 남겨보세요"}</span>
      <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
    </button>
  );
}
