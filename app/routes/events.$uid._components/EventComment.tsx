import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useFetcher } from "react-router";
import RecruitmentOpinionSetting from "~/components/features/account/RecruitmentOpinionSetting";
import ContentCommentEditor from "~/components/features/contents/ContentCommentEditor";
import { BottomSheet } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { cn } from "~/lib/utils";
import type { NestedComment } from "~/models/content";
import type { ActionData as CommentActionData, CommentResponse } from "~/routes/api.contents.$uid.comments";

type EventCommentProps = {
  allComments: NestedComment[];
  me: { username: string } | null;
  eventUid: string;
  title?: string;
  hideRecruitmentOpinions?: boolean;
  canFilterRecruitmentOpinions?: boolean;
  commentsUnavailable?: boolean;
};

export default function EventComment({
  allComments: initialComments,
  me,
  eventUid,
  title = "이벤트 의견",
  hideRecruitmentOpinions: initialHideRecruitmentOpinions = false,
  canFilterRecruitmentOpinions = false,
  commentsUnavailable: initialCommentsUnavailable = false,
}: EventCommentProps) {
  const [allComments, setAllComments] = useState(initialComments);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const [commentsUnavailable, setCommentsUnavailable] = useState(initialCommentsUnavailable);
  const [hideRecruitmentOpinions, setHideRecruitmentOpinions] = useState(me !== null && initialHideRecruitmentOpinions);
  const justUpdatedRef = useRef(false);

  const fetcher = useFetcher<CommentResponse>();
  const commentsRefreshFetcher = useFetcher<CommentResponse>();
  const submit = (data: CommentActionData) => {
    setHasPendingUpdate(true);
    justUpdatedRef.current = false;
    fetcher.submit(data, { action: `/api/contents/${eventUid}/comments`, method: "post", encType: "application/json" });
  };

  useEffect(() => {
    if (
      (fetcher.state === "loading" || fetcher.state === "idle") &&
      hasPendingUpdate &&
      fetcher.data &&
      Array.isArray(fetcher.data.comments)
    ) {
      setAllComments(fetcher.data.comments);
      setCommentsUnavailable(fetcher.data.unavailable === true);
      justUpdatedRef.current = true;
      setHasPendingUpdate(false);
    }
  }, [fetcher.state, fetcher.data, hasPendingUpdate]);

  useEffect(() => {
    if (!hasPendingUpdate && !justUpdatedRef.current) {
      setAllComments(initialComments);
      setCommentsUnavailable(initialCommentsUnavailable);
    }
    justUpdatedRef.current = false;
  }, [initialComments, initialCommentsUnavailable, hasPendingUpdate]);

  useEffect(() => {
    if (commentsRefreshFetcher.state !== "idle" || !commentsRefreshFetcher.data) return;
    setAllComments(commentsRefreshFetcher.data.comments);
    setCommentsUnavailable(commentsRefreshFetcher.data.unavailable === true);
  }, [commentsRefreshFetcher.data, commentsRefreshFetcher.state]);

  useEffect(() => {
    setHideRecruitmentOpinions(me !== null && initialHideRecruitmentOpinions);
  }, [initialHideRecruitmentOpinions, me]);

  return (
    <>
      <header className="flex items-center justify-between gap-3 pt-6 pb-3 first:pt-0">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {canFilterRecruitmentOpinions ? (
          <EventCommentOpinionFilter
            signedIn={me !== null}
            hideRecruitmentOpinions={hideRecruitmentOpinions}
            onValueChange={setHideRecruitmentOpinions}
            onSaved={() => commentsRefreshFetcher.load(`/api/contents/${eventUid}/comments`)}
          />
        ) : null}
      </header>
      {commentsRefreshFetcher.state === "loading" ? (
        <ContentCommentEditor
          comments={allComments}
          onCreateComment={(body, visibility) => submit({ action: "create", body, visibility })}
          onCreateSubcomment={(parentCommentUid, body, visibility) =>
            submit({ action: "createSubcomment", parentCommentUid, body, visibility })
          }
          onUpdateComment={(commentUid, body, visibility) => submit({ action: "update", commentUid, body, visibility })}
          onDeleteComment={(commentUid) => submit({ action: "delete", commentUid })}
          signedIn={me !== null}
          isLoading
          isSubmitting={fetcher.state === "submitting"}
          hideRecruitmentOpinions={hideRecruitmentOpinions}
        />
      ) : commentsUnavailable ? (
        <p role="alert" className="my-16 text-center text-sm text-destructive">
          의견을 불러오지 못했어요.
        </p>
      ) : (
        <ContentCommentEditor
          comments={allComments}
          onCreateComment={(body, visibility) => submit({ action: "create", body, visibility })}
          onCreateSubcomment={(parentCommentUid, body, visibility) =>
            submit({ action: "createSubcomment", parentCommentUid, body, visibility })
          }
          onUpdateComment={(commentUid, body, visibility) => submit({ action: "update", commentUid, body, visibility })}
          onDeleteComment={(commentUid) => submit({ action: "delete", commentUid })}
          signedIn={me !== null}
          isSubmitting={fetcher.state === "submitting"}
          hideRecruitmentOpinions={hideRecruitmentOpinions}
        />
      )}
    </>
  );
}

type EventCommentOpinionFilterProps = {
  signedIn: boolean;
  hideRecruitmentOpinions: boolean;
  onValueChange: (value: boolean) => void;
  onSaved: () => void;
};

function EventCommentOpinionFilter({
  signedIn,
  hideRecruitmentOpinions,
  onValueChange,
  onSaved,
}: EventCommentOpinionFilterProps) {
  const { showSignIn } = useSignIn();
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `event-comment-opinion-filter-${useId()}`;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const handleSignedOutToggle = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
      showSignIn();
    });
  }, [showSignIn]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (
        isMobile ||
        panelRef.current?.contains(event.target as Node) ||
        triggerRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      close();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [close, isMobile, open]);

  useEffect(() => {
    if (isMobile === null) return;
    setOpen(false);
  }, [isMobile]);

  const triggerClassName = cn(
    "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40",
    hideRecruitmentOpinions && "bg-primary/10 text-primary hover:bg-primary/15",
  );
  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      className={triggerClassName}
      aria-label="모집 결과 숨기기 설정"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-pressed={hideRecruitmentOpinions}
      onClick={() => setOpen((current) => !current)}
    >
      <AdjustmentsHorizontalIcon className="size-5" aria-hidden="true" />
      {hideRecruitmentOpinions ? (
        <span aria-hidden="true" className="absolute top-2 right-2 size-1.5 rounded-full bg-primary" />
      ) : null}
    </button>
  );

  if (isMobile === null) {
    return trigger;
  }

  return (
    <div className="relative shrink-0">
      {trigger}
      {isMobile && open ? (
        <BottomSheet Icon={AdjustmentsHorizontalIcon} title="의견 표시" onClose={close}>
          <div id={panelId} role="dialog" aria-label="모집 결과 숨기기 설정" className="pb-4">
            <RecruitmentOpinionSetting
              initialState={hideRecruitmentOpinions}
              signedIn={signedIn}
              onValueChange={onValueChange}
              onSaved={onSaved}
              onSignedOutToggle={handleSignedOutToggle}
              autoFocus
              compact
            />
          </div>
        </BottomSheet>
      ) : null}
      {!isMobile && open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="모집 결과 숨기기 설정"
          className="absolute top-[calc(100%+0.375rem)] right-0 z-layer-navigation-menu w-[min(20rem,calc(100vw-1.5rem))] rounded-lg bg-popover p-3 shadow-xl"
        >
          <RecruitmentOpinionSetting
            initialState={hideRecruitmentOpinions}
            signedIn={signedIn}
            onValueChange={onValueChange}
            onSaved={onSaved}
            onSignedOutToggle={handleSignedOutToggle}
            autoFocus
            compact
          />
        </div>
      ) : null}
    </div>
  );
}
