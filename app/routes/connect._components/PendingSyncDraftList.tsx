import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router";
import { v2ButtonClassName } from "~/components/v2/primitives/Button";
import type { SyncDraftSummary } from "~/models/sync-draft";
import { ConnectStateMessage } from "./ConnectStateMessage";
import { formatDraftTimestamp, syncDraftCountLabel, syncDraftTypeLabel } from "./sync-draft-labels";

export type PendingSyncDraft = SyncDraftSummary & { entryCount: number };

export default function PendingSyncDraftList({ drafts }: { drafts: PendingSyncDraft[] }) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-lg bg-v2-surface">
        <ConnectStateMessage
          Icon={ArchiveBoxIcon}
          title="대기 중인 데이터가 없어요"
          description="외부 데이터를 가져오면 여기에서 검토할 수 있어요."
        />
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-v2-list-gap">
      {drafts.map((draft) => {
        const title = draft.toolName ?? syncDraftTypeLabel(draft.type);
        return (
          <li
            key={draft.uid}
            className="flex items-center justify-between gap-3 rounded-lg bg-v2-surface px-v2-row-x py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-v2-fg">{title}</p>
              <p className="mt-0.5 text-xs text-v2-fg-tertiary tabular-nums">
                {[
                  formatDraftTimestamp(draft.createdAt),
                  syncDraftTypeLabel(draft.type),
                  syncDraftCountLabel(draft.type, draft.entryCount),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Link
              to={`/connect/import/${draft.uid}`}
              aria-label={`${title} 검토하기`}
              className={v2ButtonClassName({ variant: "secondary", size: "sm", className: "shrink-0" })}
            >
              검토하기
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
