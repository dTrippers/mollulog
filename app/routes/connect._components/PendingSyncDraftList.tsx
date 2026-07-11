import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { Link } from "react-router";
import { EmptyView } from "~/components/primitives";
import type { SyncDraftSummary } from "~/models/sync-draft";

type PendingSyncDraft = SyncDraftSummary & {
  entryCount: number;
};

type PendingSyncDraftListProps = {
  drafts: PendingSyncDraft[];
};

export default function PendingSyncDraftList({ drafts }: PendingSyncDraftListProps) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-lg bg-card p-8 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
        <EmptyView
          Icon={ArchiveBoxIcon}
          text="대기 중인 데이터가 없어요"
          description="외부 데이터를 가져오면 여기에서 검토할 수 있어요."
          className="my-8"
        />
      </div>
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20">
      {drafts.map((draft) => (
        <Link
          key={draft.uid}
          to={`/connect/import/${draft.uid}`}
          className="block p-4 transition-colors hover:bg-muted/60"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="space-y-1">
                <p className="truncate font-semibold text-foreground">{draft.toolName ?? "이름 없는 연동 도구"}</p>
                <p className="text-sm text-muted-foreground">
                  {draft.entryCount.toLocaleString()}개 항목 · {formatRelativePastTime(draft.createdAt)}
                </p>
              </div>
            </div>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-300">검토하기</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

function formatRelativePastTime(value: string): string {
  const at = dayjs(value);
  if (!at.isValid()) {
    return "-";
  }

  const now = dayjs();
  const minutes = now.diff(at, "minute");
  if (minutes < 1) {
    return "방금";
  }
  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = now.diff(at, "hour");
  if (hours < 24) {
    return `${hours}시간 전`;
  }

  const days = now.diff(at, "day");
  if (days < 30) {
    return `${days}일 전`;
  }

  const months = now.diff(at, "month");
  if (months < 12) {
    return `${months}개월 전`;
  }

  return `${now.diff(at, "year")}년 전`;
}
