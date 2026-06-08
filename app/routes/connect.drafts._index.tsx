import { ArchiveBoxIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EmptyView, Title } from "~/components/primitives";
import {
  type SyncDraftSource,
  type SyncDraftType,
  getSyncDraftEntryCounts,
  listPendingSyncDrafts,
} from "~/models/sync-draft";

export const meta: MetaFunction = () => [{ title: "연동 변경안 | 몰루로그" }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const drafts = await listPendingSyncDrafts(env, currentUser.id);
  const entryCounts = await getSyncDraftEntryCounts(
    env,
    drafts.map((draft) => draft.uid),
  );
  const draftsWithEntryCounts = drafts.map((draft) => ({
    ...draft,
    entryCount: entryCounts[draft.uid] ?? 0,
  }));

  return { drafts: draftsWithEntryCounts };
};

export default function ConnectDraftsIndexPage() {
  const { drafts } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6 pb-12">
      <Title
        text="연동 변경안"
        description="외부 도구가 제출한 변경안을 확인하고 직접 수정한 뒤 프로필에 반영할 수 있어요."
      />

      {drafts.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8">
          <EmptyView
            Icon={ArchiveBoxIcon}
            text="대기 중인 변경안이 없어요"
            description="MolluConnect 도구가 데이터를 제출하면 여기에서 확인할 수 있어요."
            className="my-8"
          />
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {drafts.map((draft) => (
            <Link
              key={draft.uid}
              to={`/connect/drafts/${draft.uid}`}
              className="block p-4 transition-colors hover:bg-muted/60"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                      {syncDraftTypeLabel(draft.type)}
                    </span>
                    <span className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground">
                      {syncDraftSourceLabel(draft.source)}
                    </span>
                  </div>
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
      )}
    </div>
  );
}

function syncDraftTypeLabel(type: SyncDraftType): string {
  switch (type) {
    case "student_tier":
      return "학생 보유 등급";
    default:
      return "아이템 보유 수량";
  }
}

function syncDraftSourceLabel(source: SyncDraftSource): string {
  switch (source) {
    case "first_party_ocr":
      return "몰루로그 OCR";
    case "web":
      return "몰루로그";
    default:
      return "MolluConnect";
  }
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
