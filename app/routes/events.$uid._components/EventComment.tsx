import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import ContentCommentEditor from "~/components/features/contents/ContentCommentEditor";
import { SubTitle } from "~/components/primitives";
import type { NestedComment } from "~/models/content";
import type { ActionData as CommentActionData } from "~/routes/api.contents.$uid.comments";

type EventCommentProps = {
  allComments: NestedComment[];
  me: { username: string } | null;
  eventUid: string;
  title?: string;
};

export default function EventComment({
  allComments: initialComments,
  me,
  eventUid,
  title = "이벤트 의견",
}: EventCommentProps) {
  const [allComments, setAllComments] = useState(initialComments);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const justUpdatedRef = useRef(false);

  const fetcher = useFetcher<NestedComment[]>();
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
      Array.isArray(fetcher.data)
    ) {
      setAllComments(fetcher.data);
      justUpdatedRef.current = true;
      setHasPendingUpdate(false);
    }
  }, [fetcher.state, fetcher.data, hasPendingUpdate]);

  useEffect(() => {
    if (!hasPendingUpdate && !justUpdatedRef.current) {
      setAllComments(initialComments);
    }
    justUpdatedRef.current = false;
  }, [initialComments, hasPendingUpdate]);

  return (
    <>
      <SubTitle text={title} />
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
      />
    </>
  );
}
