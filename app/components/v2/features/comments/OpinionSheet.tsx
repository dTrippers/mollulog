import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { type ReactNode, type RefObject, useState } from "react";
import type { UtcIsoString } from "~/lib/date-time";
import type { NestedComment } from "~/models/content";
import { Button } from "../../primitives/Button";
import { Sheet } from "../../primitives/Sheet";
import { Skeleton } from "../../primitives/Skeleton";
import { CommentComposer, type CommentDraft, type CommentVisibility } from "./CommentComposer";
import { CommentThread, type CommentThreadActions } from "./CommentThread";
import { OpinionTutorial } from "./OpinionTutorial";

export type OpinionSheetProps = {
  open: boolean;
  // The content the thread belongs to. A footer draft is kept for this content only.
  contentUid: string | null;
  isLive: boolean;
  contentName: string;
  commentCount: number;
  comments: NestedComment[] | undefined;
  loading: boolean;
  unavailable: boolean;
  now: UtcIsoString;
  signedIn: boolean;
  hideRecruitmentOpinions: boolean;
  submitting: boolean;
  tutorial: {
    onOpenSettings: () => void;
    onDismiss: () => void;
    dismissRef?: RefObject<HTMLButtonElement | null>;
  } | null;
  actions: CommentThreadActions & { onCreate: (body: string, visibility: CommentVisibility) => void };
  onRetry: () => void;
  onRequestSignIn: () => void;
  onClose: () => void;
  onExited?: () => void;
  // The editor's textarea, for focus handoff from the tutorial.
  composerRef?: RefObject<HTMLTextAreaElement | null>;
};

const EMPTY_DRAFT: CommentDraft = { body: "", visibility: "public" };

// Opinion thread for one content, in a bottom sheet on every width. The thread scrolls in the body. The new-opinion
// composer stays fixed in the footer, and it hides while an inline reply or edit composer is open in the thread.
export function OpinionSheet({
  open,
  contentUid,
  isLive,
  contentName,
  commentCount,
  comments,
  loading,
  unavailable,
  now,
  signedIn,
  hideRecruitmentOpinions,
  submitting,
  tutorial,
  actions,
  onRetry,
  onRequestSignIn,
  onClose,
  onExited,
  composerRef,
}: OpinionSheetProps) {
  const [inlineComposerOpen, setInlineComposerOpen] = useState(false);
  // The footer composer unmounts while an inline reply or edit is open. Its draft lives here, so it comes back as typed.
  // The draft is tagged with its content, so another content's sheet starts empty.
  const [footerDraftState, setFooterDraftState] = useState<{ contentUid: string | null; draft: CommentDraft }>({
    contentUid,
    draft: EMPTY_DRAFT,
  });
  const footerDraft = footerDraftState.contentUid === contentUid ? footerDraftState.draft : EMPTY_DRAFT;
  const setFooterDraft = (draft: CommentDraft) => setFooterDraftState({ contentUid, draft });
  const title = isLive ? "공식 방송 의견" : "이벤트 의견";

  let footer: ReactNode;
  if (!signedIn) {
    footer = (
      <div className="flex min-h-v2-row-min items-center gap-2 rounded-md bg-v2-inset py-1.5 pr-1.5 pl-3 pointer-coarse:py-0">
        <InformationCircleIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-v2-fg-secondary">로그인하면 의견을 남길 수 있어요</p>
        <Button variant="primary" className="min-h-0 h-8 pointer-coarse:h-11" onClick={onRequestSignIn}>
          로그인
        </Button>
      </div>
    );
  } else if (!inlineComposerOpen) {
    footer = (
      <CommentComposer
        // A new content gets a new composer, so the text typed for the previous content is not shown.
        key={contentUid ?? ""}
        label="의견 작성"
        textareaRef={composerRef}
        placeholder="의견을 남겨보세요 (Enter로 등록, Shift+Enter 줄바꿈)"
        submitLabel="등록"
        disabled={submitting}
        onSubmit={actions.onCreate}
        initialBody={footerDraft.body}
        initialVisibility={footerDraft.visibility}
        onDraftChange={setFooterDraft}
      />
    );
  }

  return (
    <Sheet
      open={open}
      title={title}
      description={`${contentName} · 의견 ${commentCount}`}
      onClose={onClose}
      onExited={onExited}
      footer={footer}
    >
      <div className="flex flex-col gap-v2-group-gap pb-2">
        {tutorial ? <OpinionTutorial {...tutorial} /> : null}

        {loading ? (
          <div role="status" aria-busy="true" className="flex flex-col gap-v2-group-gap">
            <span className="sr-only">의견을 불러오는 중</span>
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex gap-3">
                <Skeleton className="size-8 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>
            ))}
          </div>
        ) : unavailable ? (
          <div className="rounded-md bg-v2-inset p-3">
            <p className="text-sm text-v2-fg">의견을 불러오지 못했어요.</p>
            <Button className="mt-2" onClick={onRetry}>
              다시 시도
            </Button>
          </div>
        ) : comments === undefined ? null : comments.length === 0 ? (
          <p className="py-6 text-sm text-v2-fg-tertiary">
            {hideRecruitmentOpinions ? "표시할 의견이 없어요." : "작성된 의견이 없어요."}
          </p>
        ) : (
          <CommentThread
            comments={comments}
            now={now}
            submitting={submitting}
            actions={actions}
            onInlineComposerChange={setInlineComposerOpen}
          />
        )}
      </div>
    </Sheet>
  );
}
