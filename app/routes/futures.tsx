import { useEffect, useMemo, useState } from "react";
import { LoaderFunctionArgs, MetaFunction, useFetcher, useLoaderData } from "react-router";
import { FunnelIcon } from "@heroicons/react/24/outline";
import { getAuthenticator } from "~/auth/authenticator.server";
import { ContentTimeline } from "~/components/contents";
import type { ContentFilterState, ContentTimelineProps } from "~/components/contents";
import { ContentFilterPanel } from "~/components/futures";
import { getUserComments, getContentsComments, getFutureContents } from "~/models/content";
import { getUserFavoritedStudents, getFavoritedCounts } from "~/models/favorite-students";
import { ActionData as ContentsActionData } from "./api.contents";
import { ActionData as CommentActionData } from "./api.contents.$uid.comments";
import { Page } from "~/components/navigation";

export const meta: MetaFunction = () => {
  const title = "블루 아카이브 이벤트, 픽업 미래시";
  const description = "블루 아카이브 한국 서버의 이벤트 및 총력전, 픽업 미래시 정보 모음";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const contents = await getFutureContents(env);

  const allStudentUids = contents.flatMap((content) => {
    if (content.__typename === "Event") {
      return content.pickups?.map((pickup) => pickup.student?.uid ?? null) ?? [];
    }
    return [];
  }).filter((studentUid) => studentUid !== null);

  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  const signedIn = currentUser !== null;
  const flatComments = await getContentsComments(env, contents.map((content) => content.uid), currentUser?.id);
  
  // Transform flat comments to nested structure with sensei.me property
  const allComments: Record<string, {
    uid: string;
    body: string;
    visibility: "private" | "public";
    createdAt: string;
    sensei: {
      me: boolean;
      username: string;
      profileStudentId: string | null;
    };
    subcomments?: {
      uid: string;
      body: string;
      visibility: "private" | "public";
      createdAt: string;
      sensei: {
        me: boolean;
        username: string;
        profileStudentId: string | null;
      };
    }[];
  }[]> = {};
  
  contents.forEach((content) => {
    const contentComments = flatComments[content.uid] ?? [];
    const topLevelComments = contentComments.filter(c => !c.parentCommentId);
    const subcomments = contentComments.filter(c => c.parentCommentId);
    
    allComments[content.uid] = topLevelComments.map(comment => {
      const commentSubcomments = subcomments.filter(sc => sc.parentCommentId === comment.id);
      return {
        uid: comment.uid,
        body: comment.body,
        visibility: comment.visibility,
        createdAt: comment.createdAt,
        sensei: {
          me: currentUser?.username === comment.sensei.username,
          username: comment.sensei.username,
          profileStudentId: comment.sensei.profileStudentId,
        },
        subcomments: commentSubcomments.map(sc => ({
          uid: sc.uid,
          body: sc.body,
          visibility: sc.visibility,
          createdAt: sc.createdAt,
          sensei: {
            me: currentUser?.username === sc.sensei.username,
            username: sc.sensei.username,
            profileStudentId: sc.sensei.profileStudentId,
          },
        })),
      };
    });
  });
  
  return {
    signedIn,
    contents,
    favoritedStudents: signedIn ? await getUserFavoritedStudents(env, currentUser.id) : null,
    favoritedCounts: await getFavoritedCounts(env, allStudentUids),
    allComments,
  };
};

function equalFavorites(a: { contentUid: string, studentUid: string }, b: { contentUid: string, studentUid: string }): boolean {
  return a.contentUid === b.contentUid && a.studentUid === b.studentUid;
}

const futuresContentFilterKey = "futures::content-filter";

export default function FutureContents() {
  // Initialize with default value to ensure server/client match
  const [filter, setFilter] = useState<ContentFilterState>({ types: [], onlyPickups: false });
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    setIsHydrated(true);
    const saved = localStorage.getItem(futuresContentFilterKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFilter(parsed);
      } catch (e) {
        console.warn("Failed to parse saved content filter:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(futuresContentFilterKey, JSON.stringify(filter));
    }
  }, [filter, isHydrated]);

  const loaderData = useLoaderData<typeof loader>();
  const { contents, allComments: initialComments, signedIn } = loaderData;

  const [favoritedStudents, setFavoritedStudents] = useState<{ contentUid: string, studentUid: string }[] | undefined>(
    loaderData.favoritedStudents?.map((f) => ({ contentUid: f.contentId, studentUid: f.studentId })) ?? undefined
  );
  const [favoritedCounts, setFavoritedCounts] = useState(
    loaderData.favoritedCounts.map((f) => ({ contentUid: f.contentId, studentUid: f.studentId, count: f.count }))
  );
  const [allComments, setAllComments] = useState(initialComments);

  const fetcher = useFetcher();
  const commentFetcher = useFetcher();
  const submit = (data: ContentsActionData) => fetcher.submit(data, { action: "/api/contents", method: "post", encType: "application/json" });
  
  // Track which contentUid we're updating comments for
  const [pendingContentUid, setPendingContentUid] = useState<string | null>(null);
  
  // Track previous fetcher state to detect when submission completes
  const [prevFetcherState, setPrevFetcherState] = useState(fetcher.state);
  
  // Refresh comments after successful comment operations
  useEffect(() => {
    // Detect when fetcher transitions from submitting to idle
    if (prevFetcherState === "submitting" && fetcher.state === "idle" && pendingContentUid) {
      // Reload comments after successful comment operation
      const contentUid = pendingContentUid;
      commentFetcher.load(`/api/contents/${contentUid}/comments`);
    }
    setPrevFetcherState(fetcher.state);
  }, [fetcher.state, prevFetcherState, pendingContentUid, commentFetcher]);
  
  // Update comments state when commentFetcher loads new data
  useEffect(() => {
    if (commentFetcher.state === "idle" && commentFetcher.data && Array.isArray(commentFetcher.data) && pendingContentUid) {
      const contentUid = pendingContentUid;
      setAllComments((prev) => ({
        ...prev,
        [contentUid]: commentFetcher.data as typeof initialComments[string],
      }));
      setPendingContentUid(null);
    }
  }, [commentFetcher.state, commentFetcher.data, pendingContentUid, initialComments]);

  const toggleFavorite = (contentUid: string, studentUid: string, favorited: boolean) => {
    submit({ favorite: { contentUid, studentUid, favorited } });

    setFavoritedStudents((prev) => {
      const alreadyFavorited = prev && prev.some((favorite) => equalFavorites(favorite, { contentUid, studentUid }));
      if (favorited && !alreadyFavorited) {
        return prev && [...prev, { contentUid, studentUid }];
      } else if (!favorited && alreadyFavorited) {
        return prev && prev.filter((fav) => !equalFavorites(fav, { contentUid, studentUid }));
      }
    });

    setFavoritedCounts((prev) => {
      let found = false;
      const newCounts = prev.map((favorite) => {
        if (equalFavorites(favorite, { contentUid, studentUid })) {
          found = true;
          return { ...favorite, count: favorite.count + (favorited ? 1 : -1) };
        }
        return favorite;
      });
      if (!found && favorited) {
        newCounts.push({ contentUid, studentUid, count: 1 });
      }
      return newCounts.filter((favorite) => favorite.count > 0);
    });
  };

  const filteredContents = useMemo(() => contents.filter((content) => {
    if (content.__typename === "Event") {
      if (filter.types.length > 0 && !filter.types.includes(content.eventType)) {
        return false;
      } else if (filter.onlyPickups && content.pickups?.length === 0) {
        return false;
      }
      return true;
    } else if (content.__typename === "Raid") {
      if (filter.types.length > 0 && !filter.types.includes(content.raidType)) {
        return false;
      } else if (filter.onlyPickups) {
        return false;
      }
      return true;
    }
    return false;
  }), [contents, filter]);

  return (
    <Page
      title="미래시" description="컨텐츠 일정을 확인하고 계획을 세워보세요"
      panels={[
        {
          title: "컨텐츠 필터",
          Icon: FunnelIcon,
          children: <ContentFilterPanel filter={filter} onFilterChange={setFilter} />,
        },
      ]}
    >
      <ContentTimeline
        contents={filteredContents.map((content) => {
          const contentAttrs: Partial<ContentTimelineProps["contents"][number]> = {
            ...content,
            since: new Date(content.since),
            until: new Date(content.until),
            allComments: allComments[content.uid] ?? [],
          };

          if (content.__typename === "Event") {
            contentAttrs.contentType = content.eventType;
            contentAttrs.rerun = content.rerun;
            contentAttrs.pickups = content.pickups ?? undefined;
            contentAttrs.link = `/events/${content.uid}`;
            contentAttrs.hasShopData = content.shopResources?.length > 0;
          } else if (content.__typename === "Raid") {
            contentAttrs.contentType = content.raidType;
            contentAttrs.rerun = false;
            contentAttrs.link = `/raids/${content.uid}`;
            contentAttrs.raidInfo = content;
          }

          return contentAttrs as ContentTimelineProps["contents"][number];
        })}
        favoritedStudents={favoritedStudents ?? []}
        favoritedCounts={favoritedCounts}
        signedIn={signedIn}
        onCommentCreate={(contentUid, body, visibility) => {
          setPendingContentUid(contentUid);
          const actionData: CommentActionData = { action: "create", body, visibility };
          fetcher.submit(actionData, { action: `/api/contents/${contentUid}/comments`, method: "post", encType: "application/json" });
        }}
        onCommentCreateSubcomment={(contentUid, parentCommentId, body, visibility) => {
          setPendingContentUid(contentUid);
          const actionData: CommentActionData = { action: "createSubcomment", parentCommentId, body, visibility };
          fetcher.submit(actionData, { action: `/api/contents/${contentUid}/comments`, method: "post", encType: "application/json" });
        }}
        onCommentUpdate={(contentUid, commentUid, body, visibility) => {
          setPendingContentUid(contentUid);
          const actionData: CommentActionData = { action: "update", commentUid, body, visibility };
          fetcher.submit(actionData, { action: `/api/contents/${contentUid}/comments`, method: "post", encType: "application/json" });
        }}
        onCommentDelete={(contentUid, commentUid) => {
          setPendingContentUid(contentUid);
          const actionData: CommentActionData = { action: "delete", commentUid };
          fetcher.submit(actionData, { action: `/api/contents/${contentUid}/comments`, method: "post", encType: "application/json" });
        }}
        onFavorite={toggleFavorite}
        isSubmittingComment={fetcher.state === "submitting"}
      />
    </Page>
  );
}
