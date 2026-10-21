import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useSignIn } from "~/contexts/SignInProvider";
import type { NestedComment } from "~/models/content";
import type { ActionData as CommentActionData, CommentResponse } from "~/routes/api.contents.$uid.comments";
import { useRecruitmentOpinionSetting } from "../futures._components/recruitment-opinion-setting";
import { OpinionPreview } from "~/components/v2/features/comments/OpinionPreview";
import { OpinionSheet } from "~/components/v2/features/comments/OpinionSheet";
import { RecruitmentOpinionToggle } from "~/components/v2/features/comments/RecruitmentOpinionToggle";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { Popover } from "~/components/v2/primitives/Popover";
import type { UtcIsoString } from "~/lib/date-time";
import type { CommentVisibility } from "~/components/v2/features/comments/CommentComposer";

export function EventOpinions({
  eventUid,
  eventName,
  isLive,
  initialComments,
  initialUnavailable,
  signedIn,
  initialHideRecruitmentOpinions,
  canFilterRecruitmentOpinions,
  now,
}: {
  eventUid: string;
  eventName: string;
  isLive: boolean;
  initialComments: NestedComment[];
  initialUnavailable: boolean;
  signedIn: boolean;
  initialHideRecruitmentOpinions: boolean;
  canFilterRecruitmentOpinions: boolean;
  now: UtcIsoString;
}) {
  const { showSignIn } = useSignIn();
  const [comments, setComments] = useState(initialComments);
  const [unavailable, setUnavailable] = useState(initialUnavailable);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const justUpdatedRef = useRef(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const commentsFetcher = useFetcher<CommentResponse>();
  const refreshFetcher = useFetcher<CommentResponse>();

  const refreshComments = useCallback((_value?: boolean) => {
    refreshFetcher.load(`/api/contents/${eventUid}/comments`);
  }, [eventUid, refreshFetcher]);
  const setting = useRecruitmentOpinionSetting({
    initialValue: initialHideRecruitmentOpinions,
    signedIn,
    onSaved: refreshComments,
    onSignedOut: () => {
      setSettingsOpen(false);
      showSignIn();
    },
  });

  useEffect(() => {
    if (commentsFetcher.state !== "idle" || !hasPendingUpdate || !commentsFetcher.data) return;
    if (Array.isArray(commentsFetcher.data.comments)) {
      setComments(commentsFetcher.data.comments);
      setUnavailable(commentsFetcher.data.unavailable === true);
      justUpdatedRef.current = true;
    }
    setHasPendingUpdate(false);
  }, [commentsFetcher.data, commentsFetcher.state, hasPendingUpdate]);

  useEffect(() => {
    if (refreshFetcher.state !== "idle" || !refreshFetcher.data) return;
    setComments(refreshFetcher.data.comments);
    setUnavailable(refreshFetcher.data.unavailable === true);
  }, [refreshFetcher.data, refreshFetcher.state]);

  useEffect(() => {
    if (!hasPendingUpdate && !justUpdatedRef.current) {
      setComments(initialComments);
      setUnavailable(initialUnavailable);
    }
    justUpdatedRef.current = false;
  }, [initialComments, initialUnavailable, hasPendingUpdate]);

  const submit = (data: CommentActionData) => {
    setHasPendingUpdate(true);
    justUpdatedRef.current = false;
    commentsFetcher.submit(data, {
      action: `/api/contents/${eventUid}/comments`,
      method: "post",
      encType: "application/json",
    });
  };

  const headerAction = canFilterRecruitmentOpinions ? (
    <>
      <IconButton
        ref={settingsButtonRef}
        icon={AdjustmentsHorizontalIcon}
        label="모집 의견 표시 설정"
        pressed={settingsOpen}
        onClick={() => setSettingsOpen((value) => !value)}
      />
      <Popover
        open={settingsOpen}
        label="모집 의견 표시 설정"
        onClose={() => setSettingsOpen(false)}
        returnFocusRef={settingsButtonRef}
        className="w-72"
      >
        <RecruitmentOpinionToggle id="event-opinion-hide-recruitment" setting={setting} />
      </Popover>
    </>
  ) : undefined;

  const actions = {
    canReply: signedIn,
    onCreate: (body: string, visibility: CommentVisibility) => submit({ action: "create", body, visibility }),
    onReply: (parentCommentUid: string, body: string, visibility: CommentVisibility) =>
      submit({ action: "createSubcomment", parentCommentUid, body, visibility }),
    onUpdate: (commentUid: string, body: string, visibility: CommentVisibility) =>
      submit({ action: "update", commentUid, body, visibility }),
    onDelete: (commentUid: string) => submit({ action: "delete", commentUid }),
    onPin: (commentUid: string) => submit({ action: "pin", commentUid }),
    onUnpin: () => submit({ action: "unpin" }),
  };
  const title = isLive ? "공식 방송 의견" : "이벤트 의견";
  const loading = refreshFetcher.state === "loading";

  return (
    <>
      <OpinionPreview
        title={title}
        comments={comments}
        count={unavailable ? null : comments.length}
        now={now}
        loading={loading}
        unavailable={unavailable}
        hidden={setting.value}
        onOpen={() => setOpen(true)}
        onRetry={() => refreshComments()}
      />
      <OpinionSheet
        open={open}
        contentUid={eventUid}
        isLive={isLive}
        contentName={eventName.replaceAll("\n", " ")}
        commentCount={unavailable ? null : comments.length}
        comments={comments}
        loading={loading}
        unavailable={unavailable}
        now={now}
        signedIn={signedIn}
        hideRecruitmentOpinions={setting.value}
        submitting={commentsFetcher.state === "submitting"}
        tutorial={null}
        actions={actions}
        onRetry={() => refreshComments()}
        onRequestSignIn={showSignIn}
        onClose={() => setOpen(false)}
        headerAction={headerAction}
      />
    </>
  );
}
