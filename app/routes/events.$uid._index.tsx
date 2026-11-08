import {
  ChevronRightIcon,
  ClockIcon,
  MapIcon,
  RectangleStackIcon,
  ShoppingCartIcon,
  SparklesIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/16/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, redirect, useFetcher, useLoaderData, useLocation, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EventHero } from "~/components/v2/features/events/EventHero";
import { RecruitmentStudentCard } from "~/components/v2/features/students/RecruitmentStudentCard";
import { RecruitmentStudentCardRail } from "~/components/v2/features/students/RecruitmentStudentCardRail";
import { AsideLinks, PageMain } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { HintChip } from "~/components/v2/primitives/HintChip";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { filterRecruitmentsByStudentUids, getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import {
  getAvailableFreeRecruitmentPulls,
  getFreeRecruitmentNotice,
  isPickupUnavailableRecruitment,
  PICKUP_UNAVAILABLE_NOTICE,
} from "~/domain/recruitment-notice";
import { getRecruitmentPeriodNotice, getRecruitmentPeriodNoticeKind } from "~/domain/recruitment-period-notice";
import { formatInstant, formatInstantDateKey, nowUtcIso, toUtcIso } from "~/lib/date-time";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { canonicalLink, DEFAULT_OPEN_GRAPH_IMAGE_URL } from "~/lib/seo";
import { cardFlipLocale, recruitmentLabelLocale, roadPuzzleLocale, treasureHuntLocale } from "~/locales/ko";
import { getNestedContentComments } from "~/models/content.server";
import { getEventMetadata, getEventMinigameType } from "~/models/event-content";
import { useVerifiedFutureDetailReturn } from "./futures._components/use-futures-navigation";
import {
  favoriteStudent,
  getFavoritedCounts,
  getUserFavoritedStudents,
  unfavoriteStudent,
} from "~/models/favorite-students";
import { getRecruitmentGroupByUidStrict, normalizeRecruitmentGroupPeriod } from "~/models/recruitment";
import { getHideRecruitmentOpinions } from "~/models/sensei";
import { getTimelineContent, getTimelineContentsByRecruitmentGroupUids } from "~/models/timeline-content.server";
import { EventOpinions } from "./events.$uid._components/EventOpinions";
import { type EventShopPortalData, getEventShopPortalData } from "./events.$uid._components/event-shop-availability";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const timelineUid = params.uid;
  if (!timelineUid) throw new Response("Not Found", { status: 404 });
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "events.$uid._index.loader", contentUid: timelineUid });
  const content = await getTimelineContent(env, timelineUid, { ctx });
  if (!content) throw new Response("Not Found", { status: 404 });
  if (content.contentType === "live")
    return redirect(`/lives/${timelineUid}${new URL(request.url).search}`, { status: 301 });

  let recruitmentGroup = null;
  let recruitmentUnavailable = false;
  if (content.recruitmentGroupUid) {
    try {
      const group = await getRecruitmentGroupByUidStrict(env, content.recruitmentGroupUid);
      recruitmentGroup = group;
    } catch (error) {
      recruitmentUnavailable = true;
      logger.error("Failed to load event recruitment data", error, {
        route: "events.$uid._index.loader",
        operation: "recruitment",
        contentUid: timelineUid,
      });
      captureServerError(error, {
        route: "events.$uid._index.loader",
        operation: "recruitment",
        contentUid: timelineUid,
      });
    }
  }

  const recruitments = filterRecruitmentsByStudentUids(
    recruitmentGroup?.recruitments ?? [],
    content.recruitmentStudentUids,
  );
  const siblingEvents = content.recruitmentGroupUid
    ? (await getTimelineContentsByRecruitmentGroupUids(env, [content.recruitmentGroupUid], { ctx })).filter(
        (sibling) => sibling.uid !== content.uid,
      )
    : [];
  const currentUser = await getActiveSensei(env, request);
  const canFilterRecruitmentOpinions = recruitmentGroup !== null;
  const recruitmentPeriod = recruitmentGroup ? normalizeRecruitmentGroupPeriod(recruitmentGroup) : null;
  const hideRecruitmentOpinions =
    canFilterRecruitmentOpinions && (await getHideRecruitmentOpinions(env, currentUser, { ctx }));
  const studentUids = recruitments.map(getRecruitmentFavoriteKey);
  const commentsPromise = getNestedContentComments(env, timelineUid, currentUser, {
    hideRecruitmentOpinions,
    ctx,
  })
    .then((comments) => ({ comments, unavailable: false }))
    .catch((error) => {
      const errorContext = {
        route: "events.$uid._index.loader",
        operation: "comments",
        contentUid: timelineUid,
        signedIn: currentUser !== null,
      };
      logger.error("Failed to load event comments", error, errorContext);
      captureServerError(error, errorContext);
      return { comments: [], unavailable: true };
    });

  const [favoritedStudents, favoritedCounts, commentResult, metadata] = await Promise.all([
    currentUser ? getUserFavoritedStudents(env, currentUser.id, timelineUid, { ctx }) : [],
    getFavoritedCounts(env, studentUids, { ctx }),
    commentsPromise,
    getEventMetadata(env, timelineUid, ctx).catch(() => null),
  ]);
  let shopPortal: EventShopPortalData;
  let minigameType: Awaited<ReturnType<typeof getEventMinigameType>> = null;
  let minigameUnavailable = false;
  if (metadata) {
    [shopPortal, minigameType] = await Promise.all([
      getEventShopPortalData(env, metadata),
      getEventMinigameType(env, metadata).catch(() => {
        minigameUnavailable = true;
        return null;
      }),
    ]);
  } else {
    shopPortal = {
      status: "unavailable",
      since: content.startAt,
      until: content.endAt,
      currencies: [],
    };
  }

  const recruitmentsWithFavorites = recruitments.map((recruitment) => {
    const studentUid = recruitment.student?.uid ?? null;
    const favoriteKey = getRecruitmentFavoriteKey(recruitment);
    return {
      ...recruitment,
      since: toUtcIso(recruitment.since),
      until: recruitment.until ? toUtcIso(recruitment.until) : null,
      favoriteKey,
      favorited: favoritedStudents.some((favorite) => favorite.studentId === favoriteKey),
      favoritedCount:
        favoritedCounts.find((favorite) => favorite.studentId === favoriteKey && favorite.contentId === timelineUid)
          ?.count ?? 0,
      studentUid,
    };
  });

  return {
    eventContent: {
      name: content.name,
      since: content.startAt,
      until: content.endAt,
      endless: content.endless,
      imageUrl: content.imageUrl,
      imageBlurhash: content.imageBlurhash,
      type: content.contentType,
      runType: content.runType,
      recruitmentGroupUid: content.recruitmentGroupUid,
      recruitmentPeriod,
      recruitments: recruitmentsWithFavorites,
      videos: content.videos,
    },
    freeRecruitmentPulls: getAvailableFreeRecruitmentPulls({
      tags: content.tags,
      recruitments: recruitmentsWithFavorites,
      now: nowUtcIso(),
    }),
    signedIn: currentUser !== null,
    hideRecruitmentOpinions,
    canFilterRecruitmentOpinions,
    allComments: commentResult.comments,
    commentsUnavailable: commentResult.unavailable,
    eventUid: timelineUid,
    siblingEvents: siblingEvents.map((sibling) => ({ uid: sibling.uid, name: sibling.name })),
    shopPortal,
    recruitmentUnavailable,
    minigameType,
    minigameUnavailable,
  };
};

type EventLoaderData = Exclude<Awaited<ReturnType<typeof loader>>, Response>;
type EventRecruitment = EventLoaderData["eventContent"]["recruitments"][number];

type ActionData = { favorite?: { favoriteKey: string; favorited: boolean } };

export const action = async ({ params, context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return new Response(null, { status: 401 });
  const eventUid = params.uid;
  if (!eventUid) throw new Response("Not Found", { status: 404 });
  const actionData = (await request.json()) as ActionData;
  if (actionData.favorite) {
    const { favoriteKey, favorited } = actionData.favorite;
    const run = favorited ? favoriteStudent : unfavoriteStudent;
    await run(env, currentUser.id, favoriteKey, eventUid, { ctx });
  }
  return {};
};

export const meta: MetaFunction<typeof loader> = ({ data, params, location }) => {
  if (!data) return [{ title: "이벤트 정보 | 몰루로그" }];
  const title = `${data.eventContent.name} - 이벤트 정보`;
  const description = `블루 아카이브 "${data.eventContent.name}" 이벤트의 픽업, 보상 정보를 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:image", content: data.eventContent.imageUrl || DEFAULT_OPEN_GRAPH_IMAGE_URL },
    { property: "og:description", content: description },
    { property: "og:url", content: `https://mollulog.net/events/${params.uid}` },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:card", content: "summary_large_image" },
    canonicalLink(location.pathname),
  ];
};

export const handle = { ownsOpenGraphImage: true, v2HeaderTitleHidden: true } as const;

export default function EventIndex() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const { navigationState, verifiedFutureReturn } = useVerifiedFutureDetailReturn(data.eventUid, location.state);
  const futureLinkState = navigationState && verifiedFutureReturn ? location.state : undefined;
  const favoriteFetcher = useFetcher();
  const revalidator = useRevalidator();
  const timeZone = useDisplayTimeZone();
  const now = nowUtcIso();
  const { eventContent } = data;
  const premiumDash = eventContent.recruitmentPeriod?.recruitmentType === "premium_dash";
  const recruitmentNoticeKind = getRecruitmentPeriodNoticeKind(
    {
      recruitmentGroupUid: eventContent.recruitmentGroupUid,
      contentType: eventContent.type,
      startAt: eventContent.since,
      endAt: eventContent.until,
      endless: eventContent.endless,
    },
    eventContent.recruitmentPeriod,
    now,
  );
  const premiumNotice = premiumDash
    ? getRecruitmentPeriodNotice(
        {
          recruitmentGroupUid: eventContent.recruitmentGroupUid,
          contentType: eventContent.type,
          startAt: eventContent.since,
          endAt: eventContent.until,
          endless: eventContent.endless,
        },
        eventContent.recruitmentPeriod,
        now,
      )
    : null;

  const pickupRecruitments = eventContent.recruitments.filter(
    (recruitment) => recruitment.pickup || recruitment.recruitmentType === "given",
  );
  const recruitmentGroups = Object.values(
    pickupRecruitments.reduce(
      (groups, recruitment) => {
        const key = `${formatInstantDateKey(recruitment.since, timeZone)}-${
          recruitment.until ? formatInstantDateKey(recruitment.until, timeZone) : "null"
        }`;
        groups[key] ??= { since: recruitment.since, until: recruitment.until, recruitments: [] };
        groups[key].recruitments.push(recruitment);
        return groups;
      },
      {} as Record<
        string,
        {
          since: EventRecruitment["since"];
          until: EventRecruitment["until"];
          recruitments: EventRecruitment[];
        }
      >,
    ),
  );
  const limitedRecruitments = eventContent.recruitments.filter(isPickupUnavailableRecruitment);
  const showRecruitmentDateLabels = recruitmentGroups.length > 1;
  const freeRecruitmentNotice = data.freeRecruitmentPulls > 0 ? (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-v2-perk">
        <StarIcon className="size-3.5" aria-hidden="true" />
        {data.freeRecruitmentPulls}회 무료
      </span>
      <HintChip {...getFreeRecruitmentNotice(data.freeRecruitmentPulls)} />
    </span>
  ) : null;
  return (
    <PageMain>
      <div className="space-y-v2-section-gap">
        <div className="space-y-v2-group-gap">
          <EventHero
            imageUrl={eventContent.imageUrl}
            imageBlurhash={eventContent.imageBlurhash}
            name={eventContent.name}
            type={eventContent.type}
            runType={eventContent.runType}
            since={eventContent.since}
            until={eventContent.until}
            endless={eventContent.endless}
            videos={eventContent.videos}
          />

          {premiumNotice ? (
            <StatusNotice tone="warning" Icon={ClockIcon}>
              {premiumNotice}
            </StatusNotice>
          ) : recruitmentNoticeKind === "differs" && eventContent.recruitmentPeriod ? (
            <StatusNotice tone="warning" Icon={ClockIcon}>
              모집 기간이 달라요 ·{" "}
              {formatInstant(eventContent.recruitmentPeriod.startAt, { timeZone, format: "MM/DD" })} ~{" "}
              {eventContent.recruitmentPeriod.endAt
                ? formatInstant(eventContent.recruitmentPeriod.endAt, { timeZone, format: "MM/DD" })
                : "—"}
            </StatusNotice>
          ) : recruitmentNoticeKind === "ended" ? (
            <StatusNotice tone="neutral" Icon={ClockIcon}>
              모집 종료
            </StatusNotice>
          ) : null}

          {data.siblingEvents.map((sibling) => (
            <Link
              key={sibling.uid}
              to={`/events/${sibling.uid}`}
              title="모집 포인트(천장)를 공유해요"
              className="flex min-h-v2-row-min items-center gap-2 rounded-lg bg-v2-surface px-v2-row-x py-v2-row-y text-sm text-v2-fg hover:bg-v2-hover"
            >
              <SparklesIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">모집 동시 개최 · {sibling.name}</span>
              <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
            </Link>
          ))}
        </div>

        {recruitmentGroups.length > 0 ? (
          <section className="space-y-v2-group-gap">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-v2-fg">모집 학생</h2>
              {freeRecruitmentNotice}
            </div>
            {eventContent.recruitments.some(({ recruitmentType }) => recruitmentType === "fes") ? (
              <StatusNotice tone="neutral" Icon={SparklesIcon}>
                모집 확률 상승 · ★3 학생 모집 확률이 6%로 상승해요. 단, 픽업 확률은 유지돼요.
              </StatusNotice>
            ) : null}
            {eventContent.recruitments.some(({ recruitmentType }) => recruitmentType === "archive") ? (
              <>
                <StatusNotice tone="neutral" Icon={SparklesIcon}>
                  아카이브 모집 · 아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 모집에서
                  등장하지 않아요.
                </StatusNotice>
                <StatusNotice tone="neutral" Icon={ClockIcon}>
                  모집 포인트 유지 · 모집 포인트(천장)은 만료되지 않고 무기한 유지돼요.
                </StatusNotice>
              </>
            ) : null}
            {eventContent.recruitments.some(({ recruitmentType }) => recruitmentType === "recollect") ? (
              <StatusNotice tone="neutral" Icon={SparklesIcon}>
                리콜렉트 모집 · 아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 페스 모집에서
                등장하지 않아요.
              </StatusNotice>
            ) : null}
            {eventContent.recruitments.some(({ recruitmentType }) => recruitmentType === "encore") ? (
              <StatusNotice tone="neutral" Icon={SparklesIcon}>
                앙코르 모집 · 아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 한정 픽업을
                진행하지 않아요.
              </StatusNotice>
            ) : null}
            {recruitmentGroups.map((group) => (
              <div key={`${group.since}-${group.until}`} className="space-y-v2-block-gap">
                {showRecruitmentDateLabels ? (
                  <h3 className="text-sm font-semibold text-v2-fg-secondary">
                    {formatInstant(group.since, { timeZone, format: "M월 D일" })}
                    {group.until ? ` ~ ${formatInstant(group.until, { timeZone, format: "M월 D일" })}` : ""}
                  </h3>
                ) : null}
                <RecruitmentCardList
                  recruitments={group.recruitments}
                  signedIn={data.signedIn}
                  onToggleFavorite={(favoriteKey, favorited) => {
                    if (!data.signedIn) return;
                    favoriteFetcher.submit(
                      { favorite: { favoriteKey, favorited } },
                      { method: "post", encType: "application/json" },
                    );
                  }}
                />
              </div>
            ))}
          </section>
        ) : null}

        {limitedRecruitments.length > 0 ? (
          <section className="space-y-v2-group-gap">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-v2-fg">픽업 외 모집 가능</h2>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {recruitmentGroups.length === 0 ? freeRecruitmentNotice : null}
                <HintChip {...PICKUP_UNAVAILABLE_NOTICE} />
              </span>
            </div>
            <StatusNotice tone="neutral" Icon={ClockIcon}>
              모집 포인트(천장) 교환 불가 · 아래 학생들은 모집 포인트(천장)로는 교환할 수 없어요
            </StatusNotice>
            <RecruitmentCardList
              recruitments={limitedRecruitments}
              signedIn={data.signedIn}
              onToggleFavorite={(favoriteKey, favorited) => {
                if (!data.signedIn) return;
                favoriteFetcher.submit(
                  { favorite: { favoriteKey, favorited } },
                  { method: "post", encType: "application/json" },
                );
              }}
            />
          </section>
        ) : null}

        <div className="space-y-v2-group-gap">
          <section aria-label="이벤트 도구">
            <AsideLinks
              items={[
                {
                  key: "shop",
                  title: "상점 계산기",
                  Icon: ShoppingCartIcon,
                  linkState: futureLinkState,
                  to:
                    data.shopPortal.status === "ready" || data.shopPortal.status === "ended"
                      ? `/events/${data.eventUid}/shop`
                      : undefined,
                  disabledReason:
                    data.shopPortal.status === "unavailable"
                      ? "정보를 불러오지 못했어요"
                      : data.shopPortal.status === "no-data"
                        ? "상점이 없거나 정보를 준비 중이에요"
                        : undefined,
                  badge: data.shopPortal.status === "ended" ? "종료" : undefined,
                },
                {
                  key: "recruitment-simulator",
                  title: "모집 시뮬레이션",
                  Icon: SparklesIcon,
                  linkState: futureLinkState,
                  to:
                    data.eventContent.recruitmentGroupUid && !data.recruitmentUnavailable
                      ? `/events/${data.eventUid}/recruitment-simulator`
                      : undefined,
                  disabledReason: data.recruitmentUnavailable
                    ? "정보를 불러오지 못했어요"
                    : data.eventContent.recruitmentGroupUid
                      ? undefined
                      : "모집 정보가 없어요",
                },
                ...(data.minigameType === "card_flip"
                  ? [
                      {
                        key: "card-flip",
                        title: cardFlipLocale.menuTitle,
                        Icon: RectangleStackIcon,
                        linkState: futureLinkState,
                        to:
                          data.shopPortal.status === "ready" || data.shopPortal.status === "ended"
                            ? `/events/${data.eventUid}/shop/card-flip`
                            : undefined,
                        disabledReason:
                          data.shopPortal.status === "unavailable"
                            ? "정보를 불러오지 못했어요"
                            : data.shopPortal.status === "no-data"
                              ? "상점이 없거나 정보를 준비 중이에요"
                              : undefined,
                        badge: data.shopPortal.status === "ended" ? "종료" : undefined,
                      },
                    ]
                  : []),
                ...(data.minigameType === "treasure_hunt"
                  ? [
                      {
                        key: "treasure-hunt",
                        title: treasureHuntLocale.simulatorTitle,
                        Icon: Squares2X2Icon,
                        linkState: futureLinkState,
                        to: `/events/${data.eventUid}/treasure-hunt`,
                      },
                    ]
                  : []),
                ...(data.minigameType === "road_puzzle"
                  ? [
                      {
                        key: "road-puzzle",
                        title: roadPuzzleLocale.menuTitle,
                        Icon: MapIcon,
                        linkState: futureLinkState,
                        to: `/events/${data.eventUid}/road-puzzle`,
                      },
                    ]
                  : []),
              ]}
            />
          </section>

          {data.shopPortal.status === "unavailable" || data.recruitmentUnavailable || data.minigameUnavailable ? (
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
          ) : null}
        </div>

        <EventOpinions
          eventUid={data.eventUid}
          eventName={eventContent.name}
          isLive={false}
          initialComments={data.allComments}
          initialUnavailable={data.commentsUnavailable}
          signedIn={data.signedIn}
          initialHideRecruitmentOpinions={data.hideRecruitmentOpinions}
          canFilterRecruitmentOpinions={data.canFilterRecruitmentOpinions}
          now={now}
        />
      </div>
    </PageMain>
  );
}

function RecruitmentCardList({
  recruitments,
  signedIn,
  onToggleFavorite,
}: {
  recruitments: EventRecruitment[];
  signedIn: boolean;
  onToggleFavorite: (favoriteKey: string, favorited: boolean) => void;
}) {
  return (
    <RecruitmentStudentCardRail className="-mx-4 md:mx-0" listClassName="px-4 md:px-0">
      {recruitments.map((recruitment) => (
        <li key={recruitment.favoriteKey} className="list-none">
          <RecruitmentStudentCard
            studentUid={recruitment.studentUid}
            favoriteKey={recruitment.favoriteKey}
            studentName={recruitment.studentName}
            label={recruitmentLabelLocale(recruitment)}
            attackType={recruitment.student?.attackType}
            defenseType={recruitment.student?.defenseType}
            role={recruitment.student?.role}
            favorited={recruitment.favorited}
            favoritedCount={recruitment.favoritedCount}
            signedIn={signedIn}
            onToggleFavorite={onToggleFavorite}
          />
        </li>
      ))}
    </RecruitmentStudentCardRail>
  );
}
