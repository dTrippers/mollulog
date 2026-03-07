import { useEffect, useRef, useState } from "react";
import { useLoaderData, useFetcher } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { EventHeader, Recruitments } from "~/components/event";
import { SubTitle } from "~/components/atoms/typography";
import ContentCommentEditor from "~/components/contents/ContentCommentEditor";
import { getEventContentSummary } from "~/models/event-content";
import { getNestedContentComments, type NestedComment } from "~/models/content";
import { getAuthenticator } from "~/auth/authenticator.server";
import { favoriteStudent, getFavoritedCounts, getUserFavoritedStudents, unfavoriteStudent } from "~/models/favorite-students";
import type { ActionData as CommentActionData } from "~/routes/api.contents.$uid.comments";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const { uid: timelineUid } = params;
  const { env } = context.cloudflare;
  const eventContent = await getEventContentSummary(env, timelineUid!);
  if (!eventContent) {
    throw new Response("Not Found", { status: 404 });
  }

  const currentUser = await getAuthenticator(env).isAuthenticated(request);

  const studentUids = eventContent.recruitments
    .map((r) => r.student?.uid)
    .filter((uid): uid is string => uid !== undefined);

  const [favoritedStudents, favoritedCounts, allComments] = await Promise.all([
    currentUser ? getUserFavoritedStudents(env, currentUser.id, timelineUid!) : [],
    getFavoritedCounts(env, studentUids),
    getNestedContentComments(env, timelineUid!, currentUser),
  ]);

  const recruitmentsWithFavorites = eventContent.recruitments.map((recruitment) => ({
    ...recruitment,
    favorited: favoritedStudents.some((f) => f.studentId === recruitment.student?.uid),
    favoritedCount:
      favoritedCounts.find(
        (f) => f.studentId === recruitment.student?.uid && f.contentId === timelineUid,
      )?.count ?? 0,
  }));

  return {
    eventContent: { ...eventContent, recruitments: recruitmentsWithFavorites },
    signedIn: currentUser !== null,
    allComments,
    me: currentUser ? { username: currentUser.username } : null,
    eventUid: timelineUid!,
  };
};

type ActionData = {
  favorite?: {
    studentUid: string;
    favorited: boolean;
  };
};

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const { env } = context.cloudflare;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }

  const eventUid = params.uid!;
  const actionData = await request.json() as ActionData;
  if (actionData.favorite) {
    const { studentUid, favorited } = actionData.favorite;
    const run = favorited ? favoriteStudent : unfavoriteStudent;
    await run(env, currentUser.id, studentUid, eventUid);
  }

  return {};
};

export const meta: MetaFunction<typeof loader> = ({ loaderData, params }) => {
  if (!loaderData) {
    return [{ title: "이벤트 정보 | 몰루로그" }];
  }

  const { uid: timelineUid } = params;
  const { eventContent } = loaderData;
  const title = `${eventContent.name} - 이벤트 정보`;

  const description = `블루 아카이브 "${eventContent.name}" 이벤트의 픽업, 보상 정보 등을 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:image", content: eventContent.imageUrl },
    { name: "og:description", content: description },
    { name: "og:url", content: `https://mollulog.net/events/${timelineUid}` },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:card", content: "summary_large_image" },
  ];
};

export default function EventIndex() {
  const { eventContent, signedIn, allComments, me, eventUid } = useLoaderData<typeof loader>();
  return (
    <div className="w-full">
      <div className="my-2 xl:my-8">
        <EventHeader
          imageUrl={eventContent.imageUrl}
          name={eventContent.name}
          type={eventContent.type}
          runType={eventContent.runType}
          since={eventContent.since}
          until={eventContent.until}
          endless={eventContent.endless}
          videos={eventContent.videos}
        />
      </div>

      {eventContent.recruitments.length > 0 && (
        <Recruitments recruitments={eventContent.recruitments} signedIn={signedIn} />
      )}

      <EventComment allComments={allComments} me={me} eventUid={eventUid} />
    </div>
  );
}

type EventCommentProps = {
  allComments: NestedComment[];
  me: { username: string } | null;
  eventUid: string;
};

function EventComment({ allComments: initialComments, me, eventUid }: EventCommentProps) {
  const [allComments, setAllComments] = useState(initialComments);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const justUpdatedRef = useRef(false);

  const fetcher = useFetcher();
  const submit = (data: CommentActionData) => {
    setHasPendingUpdate(true);
    justUpdatedRef.current = false;
    fetcher.submit(data, { action: `/api/contents/${eventUid}/comments`, method: "post", encType: "application/json" });
  };

  useEffect(() => {
    if ((fetcher.state === "loading" || fetcher.state === "idle") && hasPendingUpdate && fetcher.data && Array.isArray(fetcher.data)) {
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
      <SubTitle text="이벤트 의견" />
      <ContentCommentEditor
        comments={allComments}
        onCreateComment={(body, visibility) => submit({ action: "create", body, visibility })}
        onCreateSubcomment={(parentCommentId, body, visibility) => submit({ action: "createSubcomment", parentCommentId, body, visibility })}
        onUpdateComment={(commentUid, body, visibility) => submit({ action: "update", commentUid, body, visibility })}
        onDeleteComment={(commentUid) => submit({ action: "delete", commentUid })}
        signedIn={me !== null}
        isSubmitting={fetcher.state === "submitting"}
      />
    </>
  );
}
