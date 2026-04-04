import { FunnelIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { type LoaderFunctionArgs, type MetaFunction, useFetcher, useLoaderData } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { ContentTimeline } from "~/components/features/contents";
import type { ContentTimelineProps } from "~/components/features/contents";
import { ContentFilterPanel } from "~/components/features/futures";
import type { ContentFilterState } from "~/components/features/futures/ContentFilterPanel";
import { Page } from "~/components/features/layout";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  type NestedComment,
  RAID_CONTENT_TYPES,
  getContentsComments,
  getFutureContents,
  nestComments,
} from "~/models/content";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import { raidTypeToParam } from "~/models/raid";
import type { ActionData as ContentsActionData } from "./api.contents";
import type { ActionData as CommentActionData } from "./api.contents.$uid.comments";

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
  const rawContents = await getFutureContents(env);
  const contents = rawContents.map(({
    uid, name, startAt, endAt, endless, contentType, runType,
    contentUid, confirmed, isSpoiler, tags, recruitments, raidInfo,
  }) => ({ uid, name, startAt, endAt, endless, contentType, runType, contentUid, confirmed, isSpoiler, tags, recruitments, raidInfo }));

  const allStudentUids = contents
    .flatMap((content) => content.recruitments.map((r) => r.student?.uid ?? null))
    .filter((uid): uid is string => uid !== null);

  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  const signedIn = currentUser !== null;
  const flatComments = await getContentsComments(
    env,
    contents.map((c) => c.uid),
    currentUser?.id,
  );

  const allComments: Record<string, NestedComment[]> = {};
  for (const content of contents) {
    const contentComments = flatComments[content.uid] ?? [];
    allComments[content.uid] = nestComments(contentComments, currentUser);
  }

  return {
    signedIn,
    contents,
    favoritedStudents: signedIn ? await getUserFavoritedStudents(env, currentUser.id) : null,
    favoritedCounts: await getFavoritedCounts(env, allStudentUids),
    allComments,
  };
};

function equalFavorites(
  a: { contentUid: string; studentUid: string },
  b: { contentUid: string; studentUid: string },
): boolean {
  return a.contentUid === b.contentUid && a.studentUid === b.studentUid;
}

const futuresContentFilterKey = "futures::content-filter";
const futuresRevealedSpoilerKey = "futures::revealed-spoilers";

export default function FutureContents() {
  const [filter, setFilter] = useState<ContentFilterState>({ types: [], onlyPickups: false });
  const [revealedSpoilerContentUids, setRevealedSpoilerContentUids] = useState<string[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  const { showSignIn } = useSignIn();

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

    const savedSpoilers = localStorage.getItem(futuresRevealedSpoilerKey);
    if (savedSpoilers) {
      try {
        const parsed = JSON.parse(savedSpoilers);
        if (Array.isArray(parsed)) {
          setRevealedSpoilerContentUids(parsed.filter((value): value is string => typeof value === "string"));
        }
      } catch (e) {
        console.warn("Failed to parse saved revealed spoilers:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(futuresContentFilterKey, JSON.stringify(filter));
    }
  }, [filter, isHydrated]);

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(futuresRevealedSpoilerKey, JSON.stringify(revealedSpoilerContentUids));
    }
  }, [isHydrated, revealedSpoilerContentUids]);

  const loaderData = useLoaderData<typeof loader>();
  const { contents, allComments: initialComments, signedIn } = loaderData;

  const [favoritedStudents, setFavoritedStudents] = useState<{ contentUid: string; studentUid: string }[] | undefined>(
    loaderData.favoritedStudents?.map((f) => ({ contentUid: f.contentId, studentUid: f.studentId })) ?? undefined,
  );
  const [favoritedCounts, setFavoritedCounts] = useState(
    loaderData.favoritedCounts.map((f) => ({ contentUid: f.contentId, studentUid: f.studentId, count: f.count })),
  );
  const [allComments, setAllComments] = useState(initialComments);

  const favoriteFetcher = useFetcher();
  const submitFavorite = (data: ContentsActionData) =>
    favoriteFetcher.submit(data, { action: "/api/contents", method: "post", encType: "application/json" });

  const commentFetcher = useFetcher();
  const submitComment = (contentUid: string, data: CommentActionData) =>
    commentFetcher.submit(data, {
      action: `/api/contents/${contentUid}/comments`,
      method: "post",
      encType: "application/json",
    });

  const [pendingContentUid, setPendingContentUid] = useState<string | null>(null);

  useEffect(() => {
    if (
      (commentFetcher.state === "idle" || commentFetcher.state === "loading") &&
      commentFetcher.data &&
      Array.isArray(commentFetcher.data) &&
      pendingContentUid
    ) {
      setAllComments((prev) => ({
        ...prev,
        [pendingContentUid]: commentFetcher.data as (typeof initialComments)[string],
      }));
      setPendingContentUid(null);
    }
  }, [commentFetcher.state, commentFetcher.data, pendingContentUid]);

  useEffect(() => {
    setAllComments(initialComments);
  }, [initialComments]);

  const revealSpoiler = (contentUid: string) => {
    setRevealedSpoilerContentUids((prev) => (prev.includes(contentUid) ? prev : [...prev, contentUid]));
  };

  const hideSpoiler = (contentUid: string) => {
    setRevealedSpoilerContentUids((prev) => prev.filter((uid) => uid !== contentUid));
  };

  const toggleFavorite = (contentUid: string, studentUid: string, favorited: boolean) => {
    if (!signedIn) {
      showSignIn();
      return;
    }

    submitFavorite({ favorite: { contentUid, studentUid, favorited } });

    setFavoritedStudents((prev) => {
      const alreadyFavorited = prev?.some((favorite) => equalFavorites(favorite, { contentUid, studentUid }));
      if (favorited && !alreadyFavorited) {
        return prev && [...prev, { contentUid, studentUid }];
      }
      if (!favorited && alreadyFavorited) {
        return prev?.filter((fav) => !equalFavorites(fav, { contentUid, studentUid }));
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

  const filteredContents = useMemo(
    () =>
      contents.filter((content) => {
        const isRaid = (RAID_CONTENT_TYPES as readonly string[]).includes(content.contentType);
        const effectiveType = isRaid && content.raidInfo ? content.raidInfo.raidType : content.contentType;
        if (filter.types.length > 0 && !filter.types.includes(effectiveType)) {
          return false;
        }
        if (filter.onlyPickups && content.recruitments.filter((r) => r.pickup).length === 0) {
          return false;
        }
        return true;
      }),
    [contents, filter],
  );

  return (
    <Page
      title="미래시"
      description="일본 서버를 바탕으로 추정된 일정으로 추후 변경될 수 있어요"
      panels={[
        {
          title: "컨텐츠 필터",
          Icon: FunnelIcon,
          children: <ContentFilterPanel filter={filter} onFilterChange={setFilter} />,
        },
      ]}
    >
      <ContentTimeline
        contents={filteredContents.map((content): ContentTimelineProps["contents"][number] => {
          const isRaid = (RAID_CONTENT_TYPES as readonly string[]).includes(content.contentType);
          const raidLink =
            content.raidInfo?.seasonIndex != null
              ? `/raids/${raidTypeToParam(content.raidInfo.raidType)}/${content.raidInfo.seasonIndex}`
              : `/raids/${content.contentUid}`;
          return {
            uid: content.uid,
            name: isRaid && content.raidInfo ? content.raidInfo.name : content.name,
            contentType: isRaid && content.raidInfo ? content.raidInfo.raidType : content.contentType,
            runType: content.runType,
            since: content.startAt,
            until: content.endAt,
            endless: content.endless,
            confirmed: content.confirmed,
            isSpoiler: content.isSpoiler,
            tags: content.tags,
            link: isRaid ? raidLink : `/events/${content.uid}`,
            recruitments: content.recruitments.length > 0 ? content.recruitments : undefined,
            raidInfo: content.raidInfo,
            allComments: allComments[content.uid] ?? [],
          };
        })}
        favoritedStudents={favoritedStudents ?? []}
        favoritedCounts={favoritedCounts}
        signedIn={signedIn}
        revealedSpoilerContentUids={revealedSpoilerContentUids}
        onRevealSpoiler={revealSpoiler}
        onHideSpoiler={hideSpoiler}
        onCommentCreate={(contentUid, body, visibility) => {
          setPendingContentUid(contentUid);
          submitComment(contentUid, { action: "create", body, visibility });
        }}
        onCommentCreateSubcomment={(contentUid, parentCommentId, body, visibility) => {
          setPendingContentUid(contentUid);
          submitComment(contentUid, { action: "createSubcomment", parentCommentId, body, visibility });
        }}
        onCommentUpdate={(contentUid, commentUid, body, visibility) => {
          setPendingContentUid(contentUid);
          submitComment(contentUid, { action: "update", commentUid, body, visibility });
        }}
        onCommentDelete={(contentUid, commentUid) => {
          setPendingContentUid(contentUid);
          submitComment(contentUid, { action: "delete", commentUid });
        }}
        onCommentPin={(contentUid, commentUid) => {
          setPendingContentUid(contentUid);
          submitComment(contentUid, { action: "pin", commentUid });
        }}
        onCommentUnpin={(contentUid) => {
          setPendingContentUid(contentUid);
          submitComment(contentUid, { action: "unpin" });
        }}
        onFavorite={toggleFavorite}
        isSubmittingComment={commentFetcher.state === "submitting"}
      />
    </Page>
  );
}
