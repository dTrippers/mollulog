import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useLocation, useNavigate, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { PageHeader, PageMain, V2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { MarkdownContent } from "~/components/v2/primitives/MarkdownContent";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import BlurhashPlaceholder from "~/components/media/BlurhashPlaceholder";
import HaloModeNotice from "~/components/media/HaloModeNotice";
import { useHaloMode } from "~/contexts/HaloModeContext";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { formatInstant, isInstantAfter, nowUtcIso } from "~/lib/date-time";
import { renderMarkdownToSafeHtml } from "~/lib/markdown.server";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { canonicalLink, DEFAULT_OPEN_GRAPH_IMAGE_URL } from "~/lib/seo";
import { uploadedImageProps } from "~/models/assets";
import { getNestedContentComments } from "~/models/content.server";
import { getPostByTimelineContentUid } from "~/models/post";
import { getTimelineContent } from "~/models/timeline-content.server";
import { EventOpinions } from "./events.$uid._components/EventOpinions";
import { useFutureDetailReturn } from "./futures._components/use-futures-navigation";

export async function loader({ params, context, request }: LoaderFunctionArgs) {
  const uid = params.uid;
  if (!uid) throw new Response("Not Found", { status: 404 });
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "lives.$uid.loader", contentUid: uid });
  let content: Awaited<ReturnType<typeof getTimelineContent>> | null;
  try {
    content = await getTimelineContent(env, uid, { ctx });
  } catch {
    return { status: "unavailable" as const, uid };
  }
  if (content?.contentType !== "live") throw new Response("Not Found", { status: 404 });

  const currentUser = await getActiveSensei(env, request);
  let comments: Awaited<ReturnType<typeof getNestedContentComments>> = [];
  let commentsUnavailable = false;
  try {
    comments = await getNestedContentComments(env, uid, currentUser, { ctx });
  } catch (error) {
    commentsUnavailable = true;
    const errorContext = { route: "lives.$uid.loader", operation: "comments", contentUid: uid };
    logger.error("Failed to load live comments", error, errorContext);
    captureServerError(error, errorContext);
  }

  let livePost: Awaited<ReturnType<typeof getPostByTimelineContentUid>> = null;
  let livePostUnavailable = false;
  try {
    livePost = await getPostByTimelineContentUid(env, uid, { ctx });
  } catch (error) {
    livePostUnavailable = true;
    const errorContext = { route: "lives.$uid.loader", operation: "post", contentUid: uid };
    logger.error("Failed to load live post", error, errorContext);
    captureServerError(error, errorContext);
  }

  return {
    status: "ready" as const,
    uid,
    content: {
      name: content.name,
      since: content.startAt,
      until: content.endAt,
      imageUrl: content.imageUrl,
      imageBlurhash: content.imageBlurhash,
      videos: content.videos,
    },
    livePost: livePost ? { title: livePost.title, contentHtml: renderMarkdownToSafeHtml(livePost.content) } : null,
    livePostUnavailable,
    comments,
    commentsUnavailable,
    signedIn: currentUser !== null,
  };
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  if (!data || data.status === "unavailable") return [{ title: "공식 방송 | 몰루로그" }];
  const title = `${data.content.name} - 공식 방송`;
  const description = `블루 아카이브 "${data.content.name}" 공식 방송 정보와 선생님들의 의견을 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:image", content: data.content.imageUrl ?? DEFAULT_OPEN_GRAPH_IMAGE_URL },
    { property: "og:description", content: description },
    { property: "og:url", content: `https://mollulog.net/lives/${data.uid}` },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:card", content: "summary_large_image" },
    canonicalLink(location.pathname),
  ];
};

export const handle = { ownsOpenGraphImage: true, v2Width: "reading" } as const;

export default function LiveDetail() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const timeZone = useDisplayTimeZone();
  const { haloMode } = useHaloMode();
  const [selectedVideoUid, setSelectedVideoUid] = useState<string | null>(null);
  const { verifiedFutureReturn, returnToFutures } = useFutureDetailReturn(data.uid, location.state, (delta) =>
    navigate(delta),
  );
  const now = nowUtcIso();
  const back = verifiedFutureReturn
    ? { title: "미래시", onClick: returnToFutures }
    : { title: "미래시", to: "/futures" };

  useEffect(() => {
    if (data.status === "ready") setSelectedVideoUid(data.content.videos[0]?.youtube ?? null);
  }, [data]);

  if (data.status === "unavailable") {
    return (
      <V2Page width="reading">
        <PageHeader title="공식 방송" back={back} />
        <PageMain>
          <StatusNotice
            tone="danger"
            action={
              <Button size="sm" onClick={() => revalidator.revalidate()}>
                다시 시도
              </Button>
            }
          >
            정보를 불러오지 못했어요.
          </StatusNotice>
        </PageMain>
      </V2Page>
    );
  }

  const selectedVideo =
    data.content.videos.find((video) => video.youtube === selectedVideoUid) ?? data.content.videos[0] ?? null;
  const future = isInstantAfter(data.content.since, now);
  const ended = !future && data.content.until !== null && !isInstantAfter(data.content.until, now);
  const stateLabel = future
    ? `${Math.max(1, Math.ceil((Date.parse(data.content.since) - Date.parse(now)) / 86_400_000))}일 후 시작`
    : ended
      ? "종료"
      : "방송 중";
  const meta = ["공식 방송", formatInstant(data.content.since, { timeZone, format: "MM/DD HH:mm" }), stateLabel].join(
    " · ",
  );

  return (
    <V2Page width="reading">
      <PageHeader title={data.content.name} meta={meta} back={back} />
      <PageMain>
        <div className="space-y-v2-block-gap">
          {selectedVideo ? (
            <div className="aspect-video overflow-hidden rounded-lg bg-v2-inset">
              <iframe
                key={selectedVideo.youtube}
                className="size-full"
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selectedVideo.youtube)}?controls=1&rel=0${selectedVideo.start ? `&start=${selectedVideo.start}` : ""}`}
                title={selectedVideo.title}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          ) : data.content.imageUrl ? (
            <div className="relative aspect-[2/1] overflow-hidden rounded-lg bg-v2-inset">
              {haloMode ? (
                <>
                  <BlurhashPlaceholder blurhash={data.content.imageBlurhash} />
                  <HaloModeNotice />
                </>
              ) : (
                <img
                  {...uploadedImageProps(data.content.imageUrl, "(min-width: 768px) 768px, 100vw")}
                  alt=""
                  className="size-full object-cover"
                />
              )}
            </div>
          ) : null}
          {data.content.videos.length > 1 ? (
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">방송 영상 선택</legend>
              {data.content.videos.map((video, index) => (
                <ToggleChip
                  key={video.youtube}
                  pressed={video.youtube === selectedVideoUid}
                  onPressedChange={() => setSelectedVideoUid(video.youtube)}
                >
                  {video.title || `영상 ${index + 1}`}
                </ToggleChip>
              ))}
            </fieldset>
          ) : null}
          <section className="rounded-lg bg-v2-surface p-v2-block-p">
            {data.livePostUnavailable ? (
              <StatusNotice
                tone="danger"
                action={
                  <Button size="sm" onClick={() => revalidator.revalidate()}>
                    다시 시도
                  </Button>
                }
              >
                정보를 불러오지 못했어요.
              </StatusNotice>
            ) : data.livePost ? (
              <div className="space-y-v2-group-gap">
                <h2 className="text-base font-semibold text-v2-fg">{data.livePost.title}</h2>
                <MarkdownContent html={data.livePost.contentHtml} headingLevel={2} />
              </div>
            ) : (
              <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-sm text-v2-fg-tertiary">
                <InformationCircleIcon className="size-6" aria-hidden="true" />
                <p>공개 정보 업데이트 예정</p>
              </div>
            )}
          </section>
          <EventOpinions
            eventUid={data.uid}
            eventName={data.content.name}
            isLive
            initialComments={data.comments}
            initialUnavailable={data.commentsUnavailable}
            signedIn={data.signedIn}
            initialHideRecruitmentOpinions={false}
            canFilterRecruitmentOpinions={false}
            now={now}
          />
        </div>
      </PageMain>
    </V2Page>
  );
}
