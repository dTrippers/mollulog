import { useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction, NavigateFunction } from "react-router";
import {
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useNavigate,
  useRevalidator,
  useRouteError,
} from "react-router";
import { newsListOriginState } from "~/components/v2/features/posts/PostRowList";
import { PostDetailFailure, PostNotFound } from "~/components/v2/features/posts/PostStates";
import { RecentPosts } from "~/components/v2/features/posts/RecentPosts";
import { PageHeader, type PageHeaderBack, PageMain, V2Page } from "~/components/v2/layout";
import { MarkdownContent } from "~/components/v2/primitives/MarkdownContent";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { captureClientError } from "~/lib/observability.client";
import { canonicalLink } from "~/lib/seo";
import { getPostDetailView } from "~/views/post-detail";

function notFoundResponse() {
  return routeError(404, "post.not_found", "게시물을 찾을 수 없어요.");
}

// The list passes newsListOriginState when it links here. Only then does back return to that list page, with its scroll.
function isFromNewsList(state: unknown) {
  return typeof state === "object" && state !== null && (state as { from?: unknown }).from === newsListOriginState.from;
}

function newsBackLink(state: unknown, navigate: NavigateFunction): PageHeaderBack {
  if (isFromNewsList(state)) {
    return { title: "업데이트 소식", onClick: () => navigate(-1) };
  }
  return { title: "업데이트 소식", to: "/news" };
}

export const loader = async ({ context, params }: LoaderFunctionArgs) => {
  const uid = params.uid;
  if (!uid) {
    throw notFoundResponse();
  }

  const view = await getPostDetailView(context.cloudflare.env, uid, { ctx: context.cloudflare.ctx });
  if (!view) {
    throw notFoundResponse();
  }
  return view;
};

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  if (!data?.post) {
    return [
      { title: "게시물 | 몰루로그" },
      { name: "description", content: "몰루로그 게시물 내용을 확인해보세요." },
      canonicalLink(location.pathname),
    ];
  }

  const title = `${data.post.title} | 몰루로그`;
  const description = `${data.post.title} 게시물 내용을 확인해보세요.`;
  return [{ title }, { name: "description", content: description }, canonicalLink(location.pathname)];
};

// A 404 keeps its status and shows the not-found copy. Any other failure shows the failure copy, never the raw error.
export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const navigate = useNavigate();
  const pathWithSearch = `${location.pathname}${location.search}${location.hash}`;
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) {
      captureClientError(error, { source: "post.error_boundary", location: location.pathname });
    }
  }, [error, notFound, location.pathname]);

  return (
    <V2Page width="reading">
      <PageHeader
        back={newsBackLink(location.state, navigate)}
        title={notFound ? "글을 찾을 수 없어요" : "글을 불러오지 못했어요"}
      />
      <PageMain>
        {notFound ? (
          <PostNotFound />
        ) : (
          <PostDetailFailure onRetry={() => navigate(pathWithSearch, { replace: true, state: location.state })} />
        )}
      </PageMain>
    </V2Page>
  );
}

export default function PostDetailPage() {
  const { post, back, recent } = useLoaderData<typeof loader>();
  const timeZone = useDisplayTimeZone();
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();

  let backLink: PageHeaderBack | undefined;
  if (back.kind === "news") {
    backLink = newsBackLink(location.state, navigate);
  } else if (back.kind === "event") {
    backLink = { title: "이벤트 상세", to: `/events/${encodeURIComponent(back.timelineContentUid)}` };
  }

  return (
    <V2Page width="reading">
      <PageHeader
        back={backLink}
        title={post.title}
        meta={
          <time dateTime={post.createdAt} className="tabular-nums">
            {formatInstant(post.createdAt, { timeZone, format: "YYYY/MM/DD" })}
          </time>
        }
      />
      <PageMain>
        <article className="rounded-lg bg-v2-surface p-v2-block-p">
          <MarkdownContent text={post.content} headingLevel={2} />
        </article>
        {recent ? (
          <RecentPosts source={recent} timeZone={timeZone} onRetry={() => void revalidator.revalidate()} />
        ) : null}
      </PageMain>
    </V2Page>
  );
}
