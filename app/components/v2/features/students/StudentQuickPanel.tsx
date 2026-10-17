import { ChevronRightIcon } from "@heroicons/react/16/solid";
import {
  CheckCircleIcon,
  IdentificationIcon,
  HeartIcon as OutlineHeartIcon,
  PencilSquareIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as SolidHeartIcon } from "@heroicons/react/24/solid";
import { Link } from "react-router";
import { formatThousands } from "~/domain/futures/futures-view-model";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { v2FocusRing } from "../../layout/styles";
import { AttributeStripes } from "./AttributeStripes";
import type { FutureStudentEntry } from "./types";

const rowClassName = cn(
  "flex min-h-v2-row-min w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-v2-fg hover:bg-v2-hover disabled:cursor-not-allowed disabled:text-v2-fg-disabled",
  v2FocusRing,
);

// Quick panel content for one student. The popover shows the name and attributes as its header. The sheet carries the name
// and attributes in its own header, so its body shows only the rows. Rows: the detail link, favorite, completion, and the
// result edit link. The action rows wait for the viewer's own state. Guests get a sign-in note, and their actions open
// the sign-in flow.
export function StudentQuickPanelBody({
  entry,
  name,
  variant,
  signedIn,
  detailHref,
  showHeader,
}: {
  entry: FutureStudentEntry;
  name: string;
  variant: string | null;
  signedIn: boolean;
  detailHref: string | null;
  showHeader: boolean;
}) {
  // Own-state actions wait for the viewer's own state, and stay off when it failed to load.
  const pending = entry.viewerPending || entry.viewerUnavailable;
  const favoriteLabel = entry.favorited ? "관심 학생에서 해제" : "관심 학생에 등록";
  const FavoriteIcon = entry.favorited ? SolidHeartIcon : OutlineHeartIcon;
  const completeLabel = entry.completed ? "모집 기록 삭제" : "모집 완료로 표시";
  return (
    <div className="space-y-2">
      <div>
        {showHeader ? (
          <p className="text-sm font-semibold text-v2-fg">{variant ? `${name}(${variant})` : name}</p>
        ) : null}
        {entry.studentUid === null ? <p className="text-xs text-v2-fg-tertiary">정보 준비 중</p> : null}
        {showHeader ? (
          <AttributeStripes
            className="mt-1"
            attackType={entry.attackType}
            defenseType={entry.defenseType}
            role={entry.role}
          />
        ) : null}
      </div>
      <div className="-mx-2 space-y-0.5">
        {detailHref ? (
          <Link to={detailHref} prefetch="intent" className={rowClassName} {...getV2LinkTransitionProps("forward")}>
            <IdentificationIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            <span className="min-w-0 flex-1">학생부 보기 (평가·통계)</span>
            <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
          </Link>
        ) : null}
        {detailHref ? <div aria-hidden="true" className="mx-2 my-1 border-t border-v2-popover-divider" /> : null}
        <button
          type="button"
          className={rowClassName}
          disabled={pending}
          onClick={() => entry.onToggleFavorite(!entry.favorited)}
        >
          <FavoriteIcon
            className={cn("size-4 shrink-0", entry.favorited && !pending ? "text-v2-favorite" : "text-v2-fg-tertiary")}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">{favoriteLabel}</span>
          {entry.favoritedCount === null ? null : (
            <span className="shrink-0 text-xs text-v2-fg-secondary tabular-nums">
              {formatThousands(entry.favoritedCount)}명 등록
            </span>
          )}
        </button>
        {entry.canComplete && entry.studentUid ? (
          <button
            type="button"
            className={rowClassName}
            disabled={pending}
            onClick={() => entry.onToggleComplete(!entry.completed)}
          >
            {entry.completed && !pending ? (
              <XCircleIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            ) : (
              <CheckCircleIcon className="size-4 shrink-0 text-v2-success" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">{completeLabel}</span>
          </button>
        ) : null}
        {entry.resultEditLink ? (
          <Link
            to={entry.resultEditLink}
            prefetch="intent"
            className={rowClassName}
            {...getV2LinkTransitionProps("forward")}
          >
            <PencilSquareIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            <span className="min-w-0 flex-1">모집 결과 상세 입력</span>
            <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {!signedIn ? (
        <p className="px-2 pt-1 text-xs text-v2-fg-tertiary">로그인하면 관심 학생과 모집 결과를 기록할 수 있어요</p>
      ) : null}
    </div>
  );
}
