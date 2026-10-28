import { useEffect, useLayoutEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useLocation, useNavigate, useNavigationType, useRouteError } from "react-router";
import { PostLatest } from "~/components/v2/features/posts/PostLatest";
import { newsListOriginState, PostRowList } from "~/components/v2/features/posts/PostRowList";
import { PostListEmpty, PostListFailure } from "~/components/v2/features/posts/PostStates";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { Pagination } from "~/components/v2/primitives/Pagination";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { renderMarkdownToSafeHtml } from "~/lib/markdown.server";
import { captureClientError } from "~/lib/observability.client";
import { canonicalLink } from "~/lib/seo";
import { getNewsPosts } from "~/models/post";
import {
  getNewsScrollContainer,
  getNewsSessionStorage,
  readNewsScrollPosition,
  saveNewsScrollPosition,
} from "./news._components/news-scroll-state";

const PAGE_SIZE = 20;

// Layout effects run before paint. Server render has no layout, so it uses useEffect there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function parsePage(request: Request) {
  const url = new URL(request.url);
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
}

// Page 1 has no query string. Out-of-range values are clamped by the model, so the URL shown is the page rendered.
function newsPageHref(page: number) {
  return page <= 1 ? "/news" : `/news?page=${page}`;
}

export const meta: MetaFunction = ({ location }) => {
  return [{ title: "업데이트 소식 | 몰루로그" }, canonicalLink(location.pathname)];
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  const page = parsePage(request);
  const postPage = await getNewsPosts(context.cloudflare.env, page, PAGE_SIZE, {
    ctx: context.cloudflare.ctx,
  });

  // Only the newest post on page 1 is shown in full, so the other bodies are not sent to the client.
  const [latest] = postPage.items;
  return {
    posts: postPage.items.map(({ uid, title, createdAt }) => ({ uid, title, createdAt })),
    latestContentHtml: postPage.page === 1 && latest ? renderMarkdownToSafeHtml(latest.content) : null,
    page: postPage.page,
    totalPages: postPage.totalPages,
  };
}

// A failed list keeps the header and shows the failure block with a retry. The retry navigates to the same URL.
export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const navigate = useNavigate();
  const pathWithSearch = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    captureClientError(error, { source: "news.error_boundary", location: location.pathname });
  }, [error, location.pathname]);

  return (
    <V2Page width="reading">
      <PageHeader title="업데이트 소식" />
      <PageMain>
        <PostListFailure onRetry={() => navigate(pathWithSearch, { replace: true })} />
      </PageMain>
    </V2Page>
  );
}

export default function News() {
  const { posts, latestContentHtml, page, totalPages } = useLoaderData<typeof loader>();
  const timeZone = useDisplayTimeZone();
  const location = useLocation();
  const navigationType = useNavigationType();
  // Page 1 shows the newest post in full. The other posts of the page follow as rows, and the page holds PAGE_SIZE posts.
  const isFirstPage = page === 1;
  const [latest] = posts;
  const rows = isFirstPage ? posts.slice(1) : posts;

  // A back navigation to this entry restores the offset saved when the user left it. Root keeps that offset.
  useIsomorphicLayoutEffect(() => {
    if (navigationType !== "POP") {
      return;
    }
    const savedScrollTop = readNewsScrollPosition(getNewsSessionStorage(), location.key);
    const container = getNewsScrollContainer();
    if (savedScrollTop !== null && container) {
      container.scrollTop = savedScrollTop;
    }
  }, [location.key, navigationType]);

  // The offset is saved on a click inside the list, before the navigation starts. Root resets the scroll container in a
  // layout effect of the next route, so the offset must be read there and not in an unmount cleanup, which runs after
  // that reset and would store 0.
  const saveScrollPosition = () => {
    saveNewsScrollPosition(getNewsSessionStorage(), location.key, getNewsScrollContainer()?.scrollTop ?? 0);
  };

  return (
    <V2Page width="reading">
      <PageHeader title="업데이트 소식" />
      <PageMain>
        <div onClickCapture={saveScrollPosition}>
          {posts.length === 0 ? <PostListEmpty /> : null}
          {isFirstPage && latest && latestContentHtml !== null ? (
            <PostLatest
              post={latest}
              contentHtml={latestContentHtml}
              timeZone={timeZone}
              linkState={newsListOriginState}
            />
          ) : null}
          {isFirstPage && rows.length > 0 ? (
            <section aria-labelledby="older-posts-title" className="mt-8">
              <h2 id="older-posts-title" className="text-base leading-6 font-semibold text-v2-fg">
                지난 소식
              </h2>
              <div className="mt-2 md:mt-3">
                <PostRowList posts={rows} timeZone={timeZone} linkState={newsListOriginState} />
              </div>
            </section>
          ) : null}
          {!isFirstPage && rows.length > 0 ? (
            <PostRowList posts={rows} timeZone={timeZone} linkState={newsListOriginState} />
          ) : null}
          <Pagination currentPage={page} totalPages={totalPages} getHref={newsPageHref} />
        </div>
      </PageMain>
    </V2Page>
  );
}
