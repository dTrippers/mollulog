import { FunnelIcon, QueueListIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { type LoaderFunctionArgs, type MetaFunction, useFetcher, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { ContentTimeline } from "~/components/features/contents";
import type { ContentTimelineProps } from "~/components/features/contents";
import { ContentFilterPanel } from "~/components/features/futures";
import type { ContentFilterState } from "~/components/features/futures/content-filter-state";
import { Page } from "~/components/features/layout";
import { useSignIn } from "~/contexts/SignInProvider";
import { futuresRevealedSpoilerKey, parseRevealedSpoilerContentUids } from "~/lib/future-spoilers";
import {
  type FutureContent,
  type NestedComment,
  getContentsComments,
  getFutureContents,
  nestComments,
} from "~/models/content";
import type { EventType, RaidType } from "~/models/content.d";
import { getFavoritedCounts, getUserFavoritedStudents } from "~/models/favorite-students";
import { raidTypeToParam } from "~/models/raid";
import type { ActionData as ContentsActionData } from "./api.contents";
import type { ActionData as CommentActionData } from "./api.contents.$uid.comments";
import FutureRecruitmentTable from "./futures._components/FutureRecruitmentTable";
import type { FutureRecruitmentTableContent } from "./futures._components/future-recruitment-table-model";

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

export const loader = async ({ request, context }: LoaderFunctionArgs): Promise<FutureContentsLoaderData> => {
  const { env } = context.cloudflare;
  const rawContents = await getFutureContents(env);
  const contents: FutureContentsLoaderContent[] = rawContents.map((content: FutureContent) => ({
    uid: content.uid,
    name: content.name,
    startAt: content.startAt,
    endAt: content.endAt,
    endless: content.endless,
    contentType: content.contentType,
    runType: content.runType,
    contentUid: content.contentUid,
    imageUrl: content.imageUrl,
    confirmed: content.confirmed,
    isSpoiler: content.isSpoiler,
    tags: content.tags,
    recruitments: content.recruitments,
    raidInfo: content.raidInfo,
  }));

  const allStudentUids = contents
    .flatMap((content: FutureContentsLoaderContent) =>
      content.recruitments.map((recruitment: FutureRecruitment) => recruitment.student?.uid ?? null),
    )
    .filter((uid): uid is string => uid !== null);

  const currentUser = await getActiveSensei(env, request);
  const signedIn = currentUser !== null;
  const flatComments = await getContentsComments(
    env,
    contents.map((content: FutureContentsLoaderContent) => content.uid),
    currentUser?.id,
  );

  const allComments: AllCommentsState = {};
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
const futuresContentViewKey = "futures::content-view";

type FutureContentView = "timeline" | "table";
type CommentVisibility = "private" | "public";
type FavoritedStudentState = { contentUid: string; studentUid: string };
type FavoritedCountState = FavoritedStudentState & { count: number };
type FutureContentForView = Pick<
  FutureContent,
  | "uid"
  | "name"
  | "startAt"
  | "endAt"
  | "endless"
  | "contentType"
  | "runType"
  | "imageUrl"
  | "confirmed"
  | "isSpoiler"
  | "tags"
  | "recruitments"
  | "raidInfo"
>;
type FutureContentsLoaderContent = FutureContentForView & Pick<FutureContent, "contentUid">;
type FavoriteStudentLoaderData = { contentId: string; studentId: string };
type FavoritedCountLoaderData = FavoriteStudentLoaderData & { count: number };
type FutureContentsLoaderData = {
  signedIn: boolean;
  contents: FutureContentsLoaderContent[];
  favoritedStudents: FavoriteStudentLoaderData[] | null;
  favoritedCounts: FavoritedCountLoaderData[];
  allComments: Record<string, NestedComment[]>;
};
type AllCommentsState = FutureContentsLoaderData["allComments"];
type FutureRecruitment = FutureContent["recruitments"][number];

function getContentLink(content: {
  contentType: EventType | RaidType;
  raidInfo?: { raidType: RaidType; seasonIndex?: number } | undefined;
  uid: string;
}) {
  if (content.contentType !== "raid") {
    return `/events/${content.uid}`;
  }

  return content.raidInfo?.seasonIndex != null
    ? `/raids/${raidTypeToParam(content.raidInfo.raidType)}/${content.raidInfo.seasonIndex}`
    : "/raids";
}

function getCommonContentFields(content: FutureContentForView) {
  const raidInfo = content.raidInfo;
  return {
    uid: content.uid,
    runType: content.runType,
    since: content.startAt,
    until: content.endAt,
    startAt: content.startAt,
    endAt: content.endAt,
    endless: content.endless,
    confirmed: content.confirmed,
    isSpoiler: content.isSpoiler,
    tags: content.tags,
    link: getContentLink(content),
    raidInfo,
    contentType: raidInfo?.raidType ?? content.contentType,
  };
}

export default function FutureContents() {
  const [filter, setFilter] = useState<ContentFilterState>({ types: [], onlyPickups: false });
  const [view, setView] = useState<FutureContentView>("timeline");
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
    const parsedSpoilers = parseRevealedSpoilerContentUids(savedSpoilers);
    if (parsedSpoilers.length > 0) {
      setRevealedSpoilerContentUids(parsedSpoilers);
    }

    const savedView = localStorage.getItem(futuresContentViewKey);
    if (savedView === "timeline" || savedView === "table") {
      setView(savedView);
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

  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(futuresContentViewKey, view);
    }
  }, [isHydrated, view]);

  const loaderData = useLoaderData() as FutureContentsLoaderData;
  const { contents, allComments: initialComments, signedIn } = loaderData;

  const [favoritedStudents, setFavoritedStudents] = useState<FavoritedStudentState[] | undefined>(
    loaderData.favoritedStudents?.map(
      (favorite: { contentId: string; studentId: string }): FavoritedStudentState => ({
        contentUid: favorite.contentId,
        studentUid: favorite.studentId,
      }),
    ) ?? undefined,
  );
  const [favoritedCounts, setFavoritedCounts] = useState<FavoritedCountState[]>(
    loaderData.favoritedCounts.map(
      (favorite: { contentId: string; count: number; studentId: string }): FavoritedCountState => ({
        contentUid: favorite.contentId,
        studentUid: favorite.studentId,
        count: favorite.count,
      }),
    ),
  );
  const [allComments, setAllComments] = useState<AllCommentsState>(initialComments);

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
      setAllComments(
        (prev: AllCommentsState): AllCommentsState => ({
          ...prev,
          [pendingContentUid]: commentFetcher.data as (typeof initialComments)[string],
        }),
      );
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

    setFavoritedStudents((prev: FavoritedStudentState[] | undefined): FavoritedStudentState[] | undefined => {
      const currentFavorites = prev ?? [];
      const alreadyFavorited = currentFavorites.some((favorite: FavoritedStudentState) =>
        equalFavorites(favorite, { contentUid, studentUid }),
      );
      if (favorited && !alreadyFavorited) {
        return [...currentFavorites, { contentUid, studentUid }];
      }
      if (!favorited && alreadyFavorited) {
        return currentFavorites.filter(
          (favorite: FavoritedStudentState) => !equalFavorites(favorite, { contentUid, studentUid }),
        );
      }
      return prev;
    });

    setFavoritedCounts((prev: FavoritedCountState[]): FavoritedCountState[] => {
      let found = false;
      const newCounts = prev.map((favorite: FavoritedCountState): FavoritedCountState => {
        if (equalFavorites(favorite, { contentUid, studentUid })) {
          found = true;
          return { ...favorite, count: favorite.count + (favorited ? 1 : -1) };
        }
        return favorite;
      });
      if (!found && favorited) {
        newCounts.push({ contentUid, studentUid, count: 1 });
      }
      return newCounts.filter((favorite: FavoritedCountState) => favorite.count > 0);
    });
  };

  const filteredContents = useMemo<FutureContentsLoaderContent[]>(
    () =>
      contents.filter((content: FutureContentsLoaderContent): boolean => {
        const effectiveType = content.raidInfo?.raidType ?? content.contentType;
        if (filter.types.length > 0 && !filter.types.includes(effectiveType)) {
          return false;
        }
        if (
          filter.onlyPickups &&
          content.recruitments.filter((recruitment: FutureRecruitment) => recruitment.pickup).length === 0
        ) {
          return false;
        }
        return true;
      }),
    [contents, filter],
  );

  const timelineContents = useMemo<ContentTimelineProps["contents"]>(
    () =>
      filteredContents.map((content: FutureContentsLoaderContent): ContentTimelineProps["contents"][number] => {
        const common = getCommonContentFields(content);
        return {
          ...common,
          name: common.raidInfo ? common.raidInfo.name : content.name,
          recruitments: content.recruitments.length > 0 ? content.recruitments : undefined,
          allComments: allComments[content.uid] ?? [],
        };
      }),
    [allComments, filteredContents],
  );

  const tableContents = useMemo<FutureRecruitmentTableContent[]>(
    () =>
      filteredContents.map(
        (content: FutureContentsLoaderContent): FutureRecruitmentTableContent => ({
          ...getCommonContentFields(content),
          name: content.name,
          imageUrl: content.imageUrl,
          recruitments: content.recruitments,
        }),
      ),
    [filteredContents],
  );

  return (
    <Page
      title="미래시"
      description="일본 서버를 바탕으로 추정된 일정으로 추후 변경될 수 있어요"
      contentArea="3xl"
      layout="horizontal"
      showMobileScreens={false}
      screens={[
        {
          text: "타임라인",
          Icon: QueueListIcon,
          active: view === "timeline",
          onClick: () => setView("timeline"),
        },
        {
          text: "일정표",
          Icon: TableCellsIcon,
          active: view === "table",
          onClick: () => setView("table"),
        },
      ]}
      panels={[
        {
          title: "컨텐츠 필터",
          Icon: FunnelIcon,
          children: <ContentFilterPanel filter={filter} onFilterChange={setFilter} />,
        },
      ]}
    >
      <div className={view === "table" ? "lg:hidden" : ""}>
        <ContentTimeline
          contents={timelineContents}
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
          onCommentCreateSubcomment={(contentUid, parentCommentUid, body, visibility) => {
            setPendingContentUid(contentUid);
            submitComment(contentUid, { action: "createSubcomment", parentCommentUid, body, visibility });
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
      </div>
      {view === "table" && (
        <div className="hidden lg:block">
          <FutureRecruitmentTable
            contents={tableContents}
            favoritedStudents={favoritedStudents ?? []}
            favoritedCounts={favoritedCounts}
            revealedSpoilerContentUids={revealedSpoilerContentUids}
            onFavorite={toggleFavorite}
          />
        </div>
      )}
    </Page>
  );
}
