import { useEffect, useMemo, useState } from "react";
import { LoaderFunctionArgs, MetaFunction, useFetcher, useLoaderData } from "react-router";
import { FunnelIcon, WalletIcon } from "@heroicons/react/24/outline";
import { getAuthenticator } from "~/auth/authenticator.server";
import { ContentTimeline } from "~/components/contents";
import type { ContentFilterState, ContentTimelineProps } from "~/components/contents";
import { ContentFilterPanel } from "~/components/futures";
import { getUserMemos, getContentsMemos, getFutureContents } from "~/models/content";
import { getUserFavoritedStudents, getFavoritedCounts } from "~/models/favorite-students";
import { ActionData as ContentsActionData } from "./api.contents";
import { ActionData as MemoActionData } from "./api.contents.$uid.memos";
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
  return {
    signedIn,
    contents,
    favoritedStudents: signedIn ? await getUserFavoritedStudents(env, currentUser.id) : null,
    favoritedCounts: await getFavoritedCounts(env, allStudentUids),
    myMemos: signedIn ? await getUserMemos(env, currentUser.id) : [],
    allMemos: await getContentsMemos(env, contents.map((content) => content.uid), currentUser?.id),
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
  const { contents, myMemos, allMemos, signedIn } = loaderData;

  const [favoritedStudents, setFavoritedStudents] = useState<{ contentUid: string, studentUid: string }[] | undefined>(
    loaderData.favoritedStudents?.map((f) => ({ contentUid: f.contentId, studentUid: f.studentId })) ?? undefined
  );
  const [favoritedCounts, setFavoritedCounts] = useState(
    loaderData.favoritedCounts.map((f) => ({ contentUid: f.contentId, studentUid: f.studentId, count: f.count }))
  );

  const fetcher = useFetcher();
  const submit = (data: ContentsActionData) => fetcher.submit(data, { action: "/api/contents", method: "post", encType: "application/json" });

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
      links={signedIn ? [
        {
          Icon: WalletIcon,
          title: "청휘석 플래너",
          description: "학생 모집 시점의 재화 수량을 계산해보세요",
          to: "/utils/pyroxene",
        }
      ] : []}
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
            myMemo: myMemos.find((memo) => memo.contentId === content.uid) ?? undefined,
            allMemos: allMemos[content.uid] ?? [],
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
        onMemoUpdate={(contentUid, body, visibility) => {
          const actionData: MemoActionData = { body, visibility };
          fetcher.submit(actionData, { action: `/api/contents/${contentUid}/memos`, method: "post", encType: "application/json" });
        }}
        onFavorite={toggleFavorite}
        isSubmittingMemo={false}
      />
    </Page>
  );
}
