import { Suspense } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Await, useLoaderData, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getPreference } from "~/auth/preference.server";
import { V2Page } from "~/components/v2/layout/V2Page";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { DEFAULT_TIME_ZONE, normalizeTimeZone, nowUtcIso } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import {
  canonicalLink,
  canonicalUrl,
  DEFAULT_OPEN_GRAPH_IMAGE_URL,
  HOME_DESCRIPTION,
  HOME_TITLE,
  SITE_NAME,
} from "~/lib/seo";
import { getCommunityFeedPage } from "~/models/community.server";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getRecruitmentResultsByRecruitmentGroupUids } from "~/models/recruitment-result.server";
import { getHomeYoutubeChannelLinks, getHomeYoutubeSections } from "~/models/youtube";
import { settleViewerPair, settleViewerState } from "~/routes/futures._components/viewer-state";
import { enrichCommunityFeedPosts } from "~/views/community.server";
import { getHomeBirthdaySource, getHomeFavoritedCounts, getIndexContents, type HomeIndexContents } from "~/views/home";
import {
  HomeChannelLinks,
  HomeFeedBlock,
  type HomeFeedState,
  HomeYoutubeBlock,
  type HomeYoutubeState,
} from "./_index._components/HomeAside";
import { HomeAccountLeftNotice, HomeHeader } from "./_index._components/HomeHeader";
import { HomeMain } from "./_index._components/HomeMain";
import { HomeAsideSkeleton, HomeMainSkeleton } from "./_index._components/HomeSkeleton";
import { type HomeViewerData, useHomeViewerState } from "./_index._components/home-viewer-state";

export const meta: MetaFunction = ({ location }) => {
  return [
    { title: HOME_TITLE },
    { name: "description", content: HOME_DESCRIPTION },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "ko_KR" },
    { property: "og:title", content: HOME_TITLE },
    { property: "og:description", content: HOME_DESCRIPTION },
    { property: "og:url", content: canonicalUrl(location.pathname) },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: HOME_TITLE },
    { name: "twitter:description", content: HOME_DESCRIPTION },
    { name: "twitter:image", content: DEFAULT_OPEN_GRAPH_IMAGE_URL },
    canonicalLink(location.pathname),
  ];
};

// Every public source failed. Each section then shows its own failure, so the page keeps its structure.
function unavailableHomeContents(): HomeIndexContents {
  const failed = { status: "error" as const };
  return {
    events: failed,
    recruitmentGroups: failed,
    raids: failed,
    overview: { campaigns: failed, jointFiringDrills: failed, mainStoryContent: failed },
    news: failed,
  };
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const ctx: ExecutionContext = context.cloudflare.ctx;
  const logger = getLogger(env, ctx, { route: "_index.loader" });
  const accountLeft = new URL(request.url).searchParams.get("account") === "left";

  return ctx.tracing.enterSpan("_index.loader", async (span) => {
    const currentUser = await ctx.tracing.enterSpan("auth", () => getActiveSensei(env, request));
    const currentUserId = currentUser?.id;
    const signedIn = currentUser !== null;
    const preference = await getPreference(env, request);
    const timeZone = normalizeTimeZone(preference.timeZone ?? DEFAULT_TIME_ZONE);
    const now = nowUtcIso();

    // Public sources stream in. A rejected load becomes the explicit failure state of every section.
    const contents = getIndexContents(env, false, ctx).catch((error: unknown) => {
      logger.error("Failed to load home contents", error);
      return unavailableHomeContents();
    });
    // The favorited counts are public, and they change between requests. They are read per request, beside the cached snapshot.
    const favoritedCounts = contents.then((loaded) => getHomeFavoritedCounts(env, loaded.recruitmentGroups, ctx));

    // Personal state, the feed, YouTube, and birthdays are deferred and fail on their own.
    const reportViewerFailure = (error: unknown, operation: string) => {
      logger.error("Failed to load home viewer state", error, { operation, signedIn });
    };
    const viewer = contents.then((loaded): Promise<HomeViewerData> => {
      if (!currentUserId) {
        return Promise.resolve({
          favorites: { status: "available", value: [] },
          results: { status: "available", value: [] },
        });
      }
      const groupUids =
        loaded.recruitmentGroups.status === "success"
          ? loaded.recruitmentGroups.data.map((group) => group.groupUid)
          : [];
      return settleViewerPair(
        settleViewerState(
          ctx.tracing.enterSpan("favorited_students", () =>
            getUserFavoritedStudents(env, currentUserId, undefined, { ctx }),
          ),
          "favorited_students",
          reportViewerFailure,
        ),
        settleViewerState(
          getRecruitmentResultsByRecruitmentGroupUids(env, currentUserId, groupUids),
          "recruitment_results",
          reportViewerFailure,
        ),
      );
    });

    const feed = ctx.tracing
      .enterSpan("community", () =>
        getCommunityFeedPage(env, {
          currentUserId,
          postTypes: ["student_review", "event_opinion", "walkthrough_timeline"],
          pageSize: 4,
          includeEngagement: false,
          ctx,
        }),
      )
      .then((page) => enrichCommunityFeedPosts(env, page.items, { ctx, includeEngagement: false }))
      .then((enriched): HomeFeedState => ({ status: "success", posts: enriched.posts }))
      .catch((error: unknown): HomeFeedState => {
        logger.error("Failed to load home feed", error);
        return { status: "error" };
      });

    const youtube = ctx.tracing
      .enterSpan("youtube", () => getHomeYoutubeSections(env, ctx))
      .then((sections): HomeYoutubeState => ({ status: "success", sections }))
      .catch((error: unknown): HomeYoutubeState => {
        logger.error("Failed to load home youtube sections", error);
        return { status: "error" };
      });

    const birthdays = getHomeBirthdaySource(env, { now, timeZone, ctx });
    const youtubeChannels = getHomeYoutubeChannelLinks();

    span.setAttribute("signedIn", signedIn);

    return {
      accountLeft,
      signedIn,
      now,
      contents,
      viewer,
      favoritedCounts,
      birthdays,
      feed,
      youtube,
      youtubeChannels,
    };
  });
};

export default function Index() {
  const { accountLeft, signedIn, now, contents, viewer, favoritedCounts, birthdays, feed, youtube, youtubeChannels } =
    useLoaderData<typeof loader>();
  // The display timezone of the root context, as /futures reads it. The birthday window is counted on the server.
  const timeZone = useDisplayTimeZone();
  const revalidator = useRevalidator();
  const viewerState = useHomeViewerState({ signedIn, viewer, favoritedCounts });
  const retry = () => revalidator.revalidate();

  return (
    <V2Page width="full">
      <main className="flex w-full min-w-0 flex-col gap-2.5 pt-2 md:gap-6 md:pt-4">
        <HomeHeader now={now} timeZone={timeZone} />
        {accountLeft ? <HomeAccountLeftNotice /> : null}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="min-w-0 flex-1">
            <Suspense fallback={<HomeMainSkeleton />}>
              {/* A public load that never settles fails on its own: every main section then shows its failure state. */}
              <Await
                resolve={contents}
                errorElement={
                  <HomeMain
                    contents={unavailableHomeContents()}
                    birthdays={birthdays}
                    viewer={viewerState}
                    now={now}
                    timeZone={timeZone}
                    onRetry={retry}
                  />
                }
              >
                {(loaded) => (
                  <HomeMain
                    contents={loaded}
                    birthdays={birthdays}
                    viewer={viewerState}
                    now={now}
                    timeZone={timeZone}
                    onRetry={retry}
                  />
                )}
              </Await>
            </Suspense>
          </div>
          <aside className="flex w-full min-w-0 flex-col gap-4 lg:sticky lg:top-24 lg:w-72 lg:flex-none">
            <Suspense fallback={<HomeAsideSkeleton title="최근 피드" variant="feed" />}>
              <Await
                resolve={feed}
                errorElement={<HomeFeedBlock feed={{ status: "error" }} timeZone={timeZone} onRetry={retry} />}
              >
                {(state) => <HomeFeedBlock feed={state} timeZone={timeZone} onRetry={retry} />}
              </Await>
            </Suspense>
            <Suspense fallback={<HomeAsideSkeleton title="공식 유튜브 최근 영상" variant="video" />}>
              <Await
                resolve={youtube}
                errorElement={<HomeYoutubeBlock youtube={{ status: "error" }} timeZone={timeZone} onRetry={retry} />}
              >
                {(state) => <HomeYoutubeBlock youtube={state} timeZone={timeZone} onRetry={retry} />}
              </Await>
            </Suspense>
            <HomeChannelLinks channels={youtubeChannels} />
          </aside>
        </div>
      </main>
    </V2Page>
  );
}
