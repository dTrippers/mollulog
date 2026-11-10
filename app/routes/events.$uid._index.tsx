import { ListBulletIcon } from "@heroicons/react/16/solid";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Fragment, type ReactNode } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, redirect, useFetcher, useLoaderData, useOutletContext, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { EventOverviewHero } from "~/components/v2/features/events/EventOverviewHero";
import { RecruitmentStudentCard } from "~/components/v2/features/students/RecruitmentStudentCard";
import { AsideLinks, PageAside, PageMain, PanelSheet } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { HintChip } from "~/components/v2/primitives/HintChip";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { calendarDayDifference } from "~/domain/home-portal";
import { filterRecruitmentsByStudentUids, getRecruitmentFavoriteKey } from "~/domain/recruitment-identity";
import {
  getAvailableFreeRecruitmentPulls,
  isPickupUnavailableRecruitment,
  RECRUITMENT_STACK_GUIDE_EVENT_UID,
} from "~/domain/recruitment-notice";
import { getRecruitmentPeriodNoticeKind } from "~/domain/recruitment-period-notice";
import { formatInstant, formatInstantDateKey, nowUtcIso, toUtcIso, type UtcIsoString } from "~/lib/date-time";
import { conjunctionParticle } from "~/lib/korean";
import { captureServerError, getLogger } from "~/lib/observability.server";
import { canonicalLink, DEFAULT_OPEN_GRAPH_IMAGE_URL } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { recruitmentLabelLocale, timelineContentTypeLocale } from "~/locales/ko";
import { getNestedContentComments } from "~/models/content.server";
import { getEventMetadata, getEventMinigameType } from "~/models/event-content";
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
import type { EventLayoutContext } from "./events.$uid._components/event-screens";
import { type EventShopPortalData, getEventShopPortalData } from "./events.$uid._components/event-shop-availability";
import { RecruitmentStackGuide } from "./events.$uid._components/RecruitmentStackGuide";
import { EventShopPicker } from "./events.$uid._components/shop/EventShopPicker";

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

// The artwork carries the name and period, so the page header keeps only its back link.
export const handle = { ownsOpenGraphImage: true, v2HeaderTitleHidden: true } as const;

export default function EventIndex() {
  const data = useLoaderData<typeof loader>();
  const favoriteFetcher = useFetcher();
  const revalidator = useRevalidator();
  const timeZone = useDisplayTimeZone();
  const now = nowUtcIso();
  const { eventContent } = data;
  const layout = useOutletContext<EventLayoutContext>();

  const pickupRecruitments = eventContent.recruitments.filter(
    (recruitment) => recruitment.pickup || recruitment.recruitmentType === "given",
  );
  // Pickup students first, then the students handed out by the event.
  const orderedPickupRecruitments = [
    ...pickupRecruitments.filter((recruitment) => recruitment.recruitmentType !== "given"),
    ...pickupRecruitments.filter((recruitment) => recruitment.recruitmentType === "given"),
  ];
  const recruitmentGroups = Object.values(
    orderedPickupRecruitments.reduce(
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
  ).sort((a, b) => a.since.localeCompare(b.since));
  const limitedRecruitments = eventContent.recruitments.filter(isPickupUnavailableRecruitment);
  const showRecruitmentDateLabels = recruitmentGroups.length > 1;
  const toggleFavorite = (favoriteKey: string, favorited: boolean) => {
    if (!data.signedIn) return;
    favoriteFetcher.submit({ favorite: { favoriteKey, favorited } }, { method: "post", encType: "application/json" });
  };
  const facts = <RecruitmentFacts data={data} now={now} timeZone={timeZone} />;
  const hasRecruitments = recruitmentGroups.length > 0 || limitedRecruitments.length > 0;

  return (
    <>
      <PageMain>
        {/* The overview reads as one column, as wide as the event thumbnail. */}
        <div className="flex w-full max-w-3xl flex-col gap-10">
          <EventOverviewHero
            imageUrl={eventContent.imageUrl}
            imageBlurhash={eventContent.imageBlurhash}
            name={eventContent.name}
            typeLabel={timelineContentTypeLocale[eventContent.type]}
            period={layout.period}
            videos={eventContent.videos}
          />

          {/* The aside is hidden on stacked layouts, so its selector and menu follow the artwork instead. CSS decides, as it
            does for the aside, so the server render and the first frame put them in the same place. */}
          <div className="v2-stacked-only flex flex-col gap-v2-list-gap">
            {layout.events.length > 1 ? (
              <EventShopPicker
                events={layout.events}
                currentEventUid={data.eventUid}
                variant="row"
                destination="overview"
              />
            ) : null}
            <OverviewMenu layout={layout} />
          </div>

          {data.recruitmentUnavailable ? (
            <section data-region="recruit-students" aria-labelledby="recruit-title" className="flex flex-col gap-3">
              <SectionTitle id="recruit-title">모집 학생</SectionTitle>
              <StatusNotice
                tone="danger"
                boxed
                action={
                  <Button size="sm" onClick={() => revalidator.revalidate()}>
                    <ArrowPathIcon className="size-4" aria-hidden="true" />
                    다시 시도
                  </Button>
                }
              >
                모집 정보를 불러오지 못했어요
              </StatusNotice>
            </section>
          ) : !hasRecruitments ? (
            <section data-region="recruit-empty" aria-labelledby="recruit-title" className="flex flex-col gap-3">
              <SectionTitle id="recruit-title">모집 학생</SectionTitle>
              <p className="text-sm text-v2-fg-tertiary">이 이벤트에는 모집 학생이 없어요</p>
            </section>
          ) : null}

          {recruitmentGroups.length > 0 ? (
            <section data-region="recruit-students" aria-labelledby="pickup-title" className="flex flex-col gap-3">
              <SectionTitle id="pickup-title">픽업 학생</SectionTitle>
              {facts}
              <div className="flex flex-col gap-3">
                {recruitmentGroups.map((group, index) => (
                  <div key={`${group.since}-${group.until}`} className="flex flex-col gap-2">
                    {showRecruitmentDateLabels ? (
                      <h3 className="text-sm font-normal text-v2-fg-tertiary tabular-nums">
                        {index + 1}차 픽업 · {formatInstant(group.since, { timeZone, format: "MM/DD" })}
                        {group.until ? ` ~ ${formatInstant(group.until, { timeZone, format: "MM/DD" })}` : ""}
                      </h3>
                    ) : null}
                    <RecruitmentCardList
                      recruitments={group.recruitments}
                      signedIn={data.signedIn}
                      onToggleFavorite={toggleFavorite}
                    />
                  </div>
                ))}
              </div>
              {showsRecruitmentStackGuide(data) ? <RecruitmentStackGuide /> : null}
            </section>
          ) : null}

          {limitedRecruitments.length > 0 ? (
            <section data-region="nonpickup-students" aria-labelledby="nonpickup-title" className="flex flex-col gap-3">
              <SectionTitle id="nonpickup-title">픽업 외 모집 가능</SectionTitle>
              {recruitmentGroups.length === 0 ? facts : null}
              <WarningNotice label="픽업 불가">
                아래 학생은 ‘픽뚫’로만 모집할 수 있고, 모집 포인트(천장)로는 교환할 수 없어요
              </WarningNotice>
              <RecruitmentCardList
                recruitments={limitedRecruitments}
                signedIn={data.signedIn}
                onToggleFavorite={toggleFavorite}
              />
            </section>
          ) : null}

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
            layout="inline"
          />
        </div>
      </PageMain>
      <PageAside>
        <OverviewMenu layout={layout} />
        {layout.events.length > 1 ? (
          <PanelSheet panelId="events" title="이벤트 선택" Icon={ListBulletIcon}>
            <EventShopPicker events={layout.events} currentEventUid={data.eventUid} destination="overview" />
          </PanelSheet>
        ) : null}
      </PageAside>
    </>
  );
}

// The other screens of the event, in place of the tabs the overview leaves out.
function OverviewMenu({ layout }: { layout: EventLayoutContext }) {
  return (
    <nav aria-label="이벤트 메뉴">
      <AsideLinks
        items={layout.screens
          .filter(({ key }) => key !== "overview")
          .map((screen) => ({
            key: screen.key,
            title: screen.text,
            description: screen.description,
            Icon: screen.Icon,
            to: screen.disabled ? undefined : screen.link,
            linkState: screen.linkState,
            disabledReason: screen.disabled ? screen.disabledReason : undefined,
          }))}
      />
    </nav>
  );
}

// The stack guide explains this event's free recruits, so it shows only while they can still be used.
function showsRecruitmentStackGuide(data: EventLoaderData): boolean {
  return data.eventUid === RECRUITMENT_STACK_GUIDE_EVENT_UID && data.freeRecruitmentPulls > 0;
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="flex min-h-8 items-center text-lg font-semibold tracking-[-0.2px] text-v2-fg">
      {children}
    </h2>
  );
}

const RECRUITMENT_METHODS = [
  {
    type: "archive",
    label: "아카이브",
    description:
      "아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 모집에서 등장하지 않아요. 모집 포인트(천장)는 만료되지 않고 무기한 유지돼요.",
  },
  {
    type: "recollect",
    label: "리콜렉트",
    description:
      "아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 페스 모집에서 등장하지 않아요.",
  },
  {
    type: "encore",
    label: "앙코르",
    description: "아래 학생 중 한 명을 지정하여 픽업 모집할 수 있어요. 대상 학생들은 이후 한정 픽업을 진행하지 않아요.",
  },
] as const;

const PREMIUM_DASH_DAYS = 28;

// The recruitment conditions of the event. Each row shows only when it applies to the event.
function RecruitmentFacts({ data, now, timeZone }: { data: EventLoaderData; now: UtcIsoString; timeZone: string }) {
  const { eventContent } = data;
  const period = eventContent.recruitmentPeriod;
  const premiumDash = period?.recruitmentType === "premium_dash";
  const noticeContent = {
    recruitmentGroupUid: eventContent.recruitmentGroupUid,
    contentType: eventContent.type,
    startAt: eventContent.since,
    endAt: eventContent.until,
    endless: eventContent.endless,
  };
  const periodKind = getRecruitmentPeriodNoticeKind(noticeContent, period, now);
  const recruitmentTypes = new Set<string>(eventContent.recruitments.map(({ recruitmentType }) => recruitmentType));
  const methods = RECRUITMENT_METHODS.filter(({ type }) => recruitmentTypes.has(type));
  const fes = recruitmentTypes.has("fes");
  const formatDate = (instant: string) => formatInstant(instant, { timeZone, format: "MM/DD" });

  // "Ended" reads as part of the date ("10/27 ~ 11/03 · 끝났어요"); other notes sit beside it.
  const periodEnded = !!period && periodKind === "ended";
  let periodNote: ReactNode = null;
  if (period && periodKind === "differs" && period.endAt && eventContent.until) {
    const days = calendarDayDifference(period.endAt, eventContent.until, timeZone);
    periodNote = (
      <span className="text-xs text-v2-warning">
        {days > 0
          ? `이벤트보다 ${days}일 먼저 끝나요`
          : days < 0
            ? `이벤트보다 ${-days}일 늦게 끝나요`
            : `이벤트와 시작일이 달라요`}
      </span>
    );
  }

  const rows: { key: string; term: string; detail: ReactNode }[] = [];
  if (period && !premiumDash) {
    rows.push({
      key: "period",
      term: "모집 기간",
      detail: (
        <>
          <span>
            <span className="tabular-nums">
              {formatDate(period.startAt)} ~ {period.endAt ? formatDate(period.endAt) : "—"}
            </span>
            {periodEnded ? <span className="text-v2-fg-tertiary"> · 끝났어요</span> : null}
          </span>
          {periodNote}
        </>
      ),
    });
  }
  if (fes || methods.length > 0) {
    rows.push({
      key: "method",
      term: "모집 방식",
      detail: (
        <>
          {fes ? (
            <span className="inline-flex items-center gap-1.5">
              <FactPill tone="accent">페스</FactPill>
              <span className="text-[0.8125rem]">★3 확률 6%</span>
              <HintChip
                variant="info"
                label="페스 모집"
                description="★3 학생 모집 확률이 6%로 상승해요. 단, 픽업 확률은 유지돼요."
              />
            </span>
          ) : null}
          {methods.map((method) => (
            <span key={method.type} className="inline-flex items-center gap-0.5">
              <FactPill tone="neutral">{method.label}</FactPill>
              <HintChip variant="info" label={`${method.label} 모집`} description={method.description} />
            </span>
          ))}
        </>
      ),
    });
  }
  if (data.freeRecruitmentPulls > 0) {
    rows.push({
      key: "free",
      term: "무료 모집",
      detail: <FactPill tone="perk">{data.freeRecruitmentPulls}회 무료</FactPill>,
    });
  }
  if (data.siblingEvents.length > 0) {
    const lastSibling = data.siblingEvents[data.siblingEvents.length - 1];
    rows.push({
      key: "shared-points",
      term: "천장 공유",
      detail: (
        <span className="text-[0.8125rem]">
          모집 포인트를{" "}
          {data.siblingEvents.map((sibling, index) => (
            <span key={sibling.uid}>
              {index > 0 ? ", " : null}
              <Link to={`/events/${sibling.uid}`} className="text-v2-accent hover:underline">
                {sibling.name.replaceAll("\n", " ")}
              </Link>
            </span>
          ))}
          {conjunctionParticle(lastSibling.name)} 같이 써요
        </span>
      ),
    });
  }
  if (period && premiumDash) {
    rows.push({
      key: "premium-dash",
      term: "프리미엄 대시",
      detail: (
        <span className="flex flex-col">
          {/* The window starts at the later of the event start and the player's first sign-up, which the page does
              not know, so it states the rule instead of one end date. */}
          <span className="tabular-nums">{PREMIUM_DASH_DAYS}일간</span>
          <span className="mt-1 text-xs text-v2-fg-tertiary">
            이벤트 시작일({formatInstant(eventContent.since, { timeZone, format: "MM/DD" })})과 블루 아카이브 최초
            가입일 중 늦은 날부터
          </span>
        </span>
      ),
    });
  }
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <dl
        data-region="recruit-facts"
        className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-sm"
      >
        {rows.map((row) => (
          <Fragment key={row.key}>
            <dt className="text-v2-fg-tertiary">{row.term}</dt>
            <dd className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{row.detail}</dd>
          </Fragment>
        ))}
      </dl>
      {/* The stack guide below the pickup students covers this rule for its event. */}
      {data.freeRecruitmentPulls > 0 && !showsRecruitmentStackGuide(data) ? (
        <WarningNotice label="이월 불가">남은 무료 모집 횟수는 다음 모집으로 넘어가지 않아요</WarningNotice>
      ) : null}
    </div>
  );
}

// A recruitment rule the player can lose out on, kept in view instead of behind a hint.
function WarningNotice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <StatusNotice tone="warning" boxed>
      <span className="font-semibold">{label}</span> · {children}
    </StatusNotice>
  );
}

function FactPill({ tone, children }: { tone: "accent" | "neutral" | "perk"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center rounded-full px-2 text-xs font-semibold whitespace-nowrap",
        tone === "accent" && "bg-v2-accent-subtle text-v2-accent",
        tone === "neutral" && "bg-v2-inset text-v2-fg-secondary",
        tone === "perk" && "bg-v2-perk/15 text-v2-perk",
      )}
    >
      {children}
    </span>
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
    <ul className="flex flex-wrap gap-2">
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
    </ul>
  );
}
