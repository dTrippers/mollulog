import { ShareIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
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
import { MobileActionBar, PageHeader, type PageHeaderBack, PageMain, V2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { MarkdownContent } from "~/components/v2/primitives/MarkdownContent";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { captureClientError } from "~/lib/observability.client";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { canonicalLink, DEFAULT_OPEN_GRAPH_IMAGE_URL } from "~/lib/seo";
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

async function copyPostUrl(url: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return;
    }
  } catch {
    // Try the selection-based copy method if Clipboard API access is blocked.
  }

  const textarea = document.createElement("textarea");
  textarea.value = url;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("clipboard unavailable");
    }
  } finally {
    textarea.remove();
  }
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
  const imageUrl = data.post.thumbnailImageUrl ?? DEFAULT_OPEN_GRAPH_IMAGE_URL;
  return [
    { title },
    { name: "description", content: description },
    { property: "og:image", content: imageUrl },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: imageUrl },
    canonicalLink(location.pathname),
  ];
};

export const handle = { ownsOpenGraphImage: true } as const;

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
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "error">("idle");

  const handleShare = async () => {
    const url = window.location.href;
    setShareStatus("idle");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: post.title, url });
        trackGoogleAnalyticsEvent("share", { content_type: "post", method: "native" });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setShareStatus("error");
        }
      }
      return;
    }
    try {
      await copyPostUrl(url);
      setShareStatus("copied");
      trackGoogleAnalyticsEvent("share", { content_type: "post", method: "copy" });
    } catch {
      setShareStatus("error");
    }
  };

  const shareLabel =
    shareStatus === "copied" ? "링크 복사됨" : shareStatus === "error" ? "공유 실패 · 다시 시도" : "공유하기";

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
      <MobileActionBar
        links={[
          {
            key: "share",
            title: shareLabel,
            shortTitle: shareStatus === "copied" ? "복사됨" : shareStatus === "error" ? "재시도" : "공유",
            Icon: ShareIcon,
            onClick: () => void handleShare(),
          },
        ]}
      />
      <PageMain>
        <article className="rounded-lg bg-v2-surface p-v2-block-p">
          <MarkdownContent text={post.content} headingLevel={2} />
          <span className="sr-only" role="status">
            {shareStatus === "error"
              ? "게시글 주소를 공유하지 못했어요."
              : shareStatus === "copied"
                ? "게시글 주소를 복사했어요."
                : ""}
          </span>
        </article>
        <div className="mt-v2-block-gap hidden justify-end @min-[48rem]/page-available:flex">
          <Button onClick={() => void handleShare()}>
            <ShareIcon className="size-4" aria-hidden="true" />
            {shareLabel}
          </Button>
        </div>
        {recent ? (
          <RecentPosts source={recent} timeZone={timeZone} onRetry={() => void revalidator.revalidate()} />
        ) : null}
      </PageMain>
    </V2Page>
  );
}
