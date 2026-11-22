import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleOvalLeftIcon,
  ClockIcon,
  DocumentDuplicateIcon,
  InformationCircleIcon,
  ListBulletIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/16/solid";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
// The viewer window keeps the 1.x timeline viewer until MLLG-73 redesigns it (see v2GuardExceptions).
import { flattenTimelineParties, useWalkthroughViewerWindow } from "~/components/features/walkthrough-timeline/useWalkthroughViewerWindow";
import { FeedbackSheet } from "~/components/v2/features/feedback/FeedbackSheet";
import { GuideBodyContent } from "~/components/v2/features/walkthroughs/GuideBodyContent";
import type { GuideMentionContext } from "~/components/v2/features/walkthroughs/GuideMentionChip";
import { WalkthroughBossBanner, WalkthroughConditions } from "~/components/v2/features/walkthroughs/WalkthroughConditions";
import {
  WalkthroughLikeButton,
  WalkthroughShareButton,
} from "~/components/v2/features/walkthroughs/WalkthroughEngagement";
import {
  WalkthroughPartyDetailCard,
  walkthroughPartyAnchorId,
} from "~/components/v2/features/walkthroughs/WalkthroughPartyDetail";
import { WalkthroughRouteError } from "~/components/v2/features/walkthroughs/WalkthroughRouteError";
import type { WalkthroughStudent } from "~/components/v2/features/walkthroughs/walkthrough-parts";
import { AsideLinks } from "~/components/v2/layout/AsideLinks";
import { MobileActionBar } from "~/components/v2/layout/MobileActionBar";
import { PageAside } from "~/components/v2/layout/PageAside";
import { PageHeader } from "~/components/v2/layout/PageHeader";
import { PageMain } from "~/components/v2/layout/PageMain";
import { PanelSheet } from "~/components/v2/layout/PanelSheet";
import { V2Page } from "~/components/v2/layout/V2Page";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import {
  canPostgresWalkthroughTimelineReceiveLike,
  getPostgresWalkthroughTimelineLikeSummaries,
} from "~/db/postgres/walkthrough-timeline-likes";
import {
  clonePostgresWalkthroughTimeline,
  deletePostgresWalkthroughTimelineWithCommunityPost,
  getPostgresWalkthroughTimeline,
} from "~/db/postgres/walkthrough-timelines";
import {
  DEMO_WALKTHROUGH_BOSS_NAME,
  DEMO_WALKTHROUGH_TIMELINE,
  isDemoWalkthroughTimelineUid,
} from "~/domain/walkthrough-timeline-demo";
import { compareInstantDesc, formatInstant } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { socialMeta } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { getAllRaidSchedules } from "~/models/raid";
import { getSenseiById, isSenseiProfileVisibleTo } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";
import {
  toWalkthroughRouteStudent,
  walkthroughReferencedStudentUids,
} from "./timelines._components/timeline-route-data.server";

const NOT_FOUND_MESSAGE = "공략/타임라인을 찾을 수 없어요.";
const FEEDBACK_TITLE = "의견/오류 제보";

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  const title = data?.timeline.title ?? "공략/타임라인";
  return [
    { title: `${title} | 몰루로그` },
    ...(data?.timeline.visibility === "public" ? [] : [{ name: "robots", content: "noindex,nofollow" }]),
    ...socialMeta({ title, pathname: location.pathname }),
  ];
};

export const ErrorBoundary = WalkthroughRouteError;

type ActionData = { error: string };

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const demo = isDemoWalkthroughTimelineUid(params.uid);
  const [storedTimeline, currentUser] = await Promise.all([
    params.uid && !demo ? getPostgresWalkthroughTimeline(env, params.uid, { ctx }) : null,
    getActiveSensei(env, request, ctx),
  ]);
  const timeline = demo ? DEMO_WALKTHROUGH_TIMELINE : storedTimeline;
  if (!timeline) throw routeError(404, "timeline.not_found", NOT_FOUND_MESSAGE);
  const owner = storedTimeline !== null && currentUser?.id === storedTimeline.userId;
  if (timeline.visibility === "private" && !owner) {
    throw routeError(404, "timeline.not_found", NOT_FOUND_MESSAGE);
  }
  const author = storedTimeline ? await getSenseiById(env, storedTimeline.userId, { ctx }) : null;
  if (storedTimeline && (!author || !isSenseiProfileVisibleTo(author, currentUser?.id))) {
    throw routeError(404, "timeline.not_found", NOT_FOUND_MESSAGE);
  }
  const [students, raids, engagementByUid, canLike] = await Promise.all([
    getAllStudentsMap(env, true),
    getAllRaidSchedules(env),
    storedTimeline
      ? getPostgresWalkthroughTimelineLikeSummaries(env, [storedTimeline.uid], currentUser?.id, { ctx })
      : Promise.resolve<Record<string, { liked: boolean; likeCount: number }>>({}),
    storedTimeline
      ? canPostgresWalkthroughTimelineReceiveLike(env, storedTimeline.uid, currentUser?.id, { ctx })
      : Promise.resolve(false),
  ]);
  const bossSchedules = raids
    .filter((raid) => raid.raidBoss.uid === timeline.bossUid)
    .sort((left, right) => {
      if (left.startAt && right.startAt) return compareInstantDesc(left.startAt, right.startAt);
      if (left.startAt) return -1;
      if (right.startAt) return 1;
      return right.seasonIndex - left.seasonIndex;
    });
  const latestBossSchedule = bossSchedules[0] ?? null;
  const bossName = latestBossSchedule?.raidBoss.name ?? null;
  const referencedStudents = [...walkthroughReferencedStudentUids(timeline.document, timeline.body)].flatMap(
    (uid) => {
      const student = students[uid];
      return student ? [toWalkthroughRouteStudent(student)] : [];
    },
  );
  return {
    timeline,
    engagement: engagementByUid[timeline.uid] ?? { liked: false, likeCount: 0 },
    canLike,
    owner,
    demo,
    signedIn: currentUser !== null,
    author: author ? { username: author.username } : null,
    bossName: bossName ?? (demo ? DEMO_WALKTHROUGH_BOSS_NAME : null),
    otherGuidesPath: latestBossSchedule
      ? `/timelines?${new URLSearchParams({
          bossUid: timeline.bossUid,
          terrain: timeline.terrain,
          defenseType: timeline.defenseType,
        }).toString()}`
      : null,
    detailUrl: new URL(`/timelines/${timeline.uid}`, request.url).toString(),
    viewerUrl: new URL(`/timelines/${timeline.uid}/viewer`, request.url).toString(),
    students: referencedStudents,
  };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "timelines.detail.action" });
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) return redirect("/unauthorized");
  if (!params.uid) throw routeError(404, "timeline.not_found", NOT_FOUND_MESSAGE);
  if (isDemoWalkthroughTimelineUid(params.uid)) {
    throw routeError(400, "timeline.invalid_action", "데모 타임라인은 변경할 수 없어요.");
  }
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent === "clone") {
    const source = await getPostgresWalkthroughTimeline(env, params.uid, { ctx });
    const sourceAuthor = source ? await getSenseiById(env, source.userId, { ctx }) : null;
    if (
      !source ||
      !sourceAuthor ||
      (source.visibility === "private" && source.userId !== currentUser.id) ||
      !isSenseiProfileVisibleTo(sourceAuthor, currentUser.id)
    ) {
      throw routeError(404, "timeline.not_found", "복제할 타임라인을 찾을 수 없어요.");
    }
    const cloned = await clonePostgresWalkthroughTimeline(env, params.uid, currentUser.id, { ctx });
    if (!cloned) throw routeError(404, "timeline.not_found", "복제할 타임라인을 찾을 수 없어요.");
    return redirect(`/timelines/${cloned.uid}/edit`);
  }
  if (intent === "delete") {
    try {
      const deleted = await deletePostgresWalkthroughTimelineWithCommunityPost(env, params.uid, currentUser.id, {
        ctx,
      });
      if (!deleted) throw routeError(403, "timeline.forbidden", "이 타임라인을 삭제할 수 없어요.");
      return redirect("/timelines?mine=1");
    } catch (error) {
      if (error instanceof Response) throw error;
      logger.error("Failed to delete walkthrough timeline", error, {
        timelineUid: params.uid,
        operation: "delete",
        userId: currentUser.id,
      });
      return data<ActionData>({ error: "타임라인을 삭제하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
    }
  }
  throw routeError(400, "timeline.invalid_action", "지원하지 않는 요청이에요.");
};

function visibilityLabel(visibility: "public" | "unlisted" | "private"): string {
  return visibility === "public" ? "전체 공개" : visibility === "unlisted" ? "목록 미노출" : "나만 보기";
}

export default function WalkthroughTimelineDetailPage() {
  const {
    timeline,
    engagement,
    canLike,
    owner,
    demo,
    signedIn,
    author,
    bossName,
    otherGuidesPath,
    detailUrl,
    viewerUrl,
    students,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const timeZone = useDisplayTimeZone();
  const [stacked, setStacked] = useState(false);
  const onStackedChange = useCallback((value: boolean) => setStacked(value), []);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const isDeleting = navigation.state !== "idle" && navigation.formData?.get("intent") === "delete";
  const isCloning = navigation.state !== "idle" && navigation.formData?.get("intent") === "clone";

  const studentsByUid = useMemo(
    () => new Map<string, WalkthroughStudent>(students.map((student) => [student.uid, student])),
    [students],
  );
  const viewerStudents = useMemo(
    () => Object.fromEntries(students.map((student) => [student.uid, { name: student.name, equipments: student.equipments }])),
    [students],
  );
  const parties = useMemo(
    () => [...timeline.document.parties].sort((left, right) => left.order - right.order),
    [timeline.document.parties],
  );
  const viewerItems = useMemo(() => flattenTimelineParties(parties), [parties]);
  const viewer = useWalkthroughViewerWindow({ items: viewerItems, studentsByUid: viewerStudents });
  const hasTimeline = parties.some((party) => party.steps.length > 0);
  const firstTimelinePartyUid = parties.find((party) => party.steps.length > 0)?.uid;
  const mentionContext: GuideMentionContext = {
    parties,
    partySize: timeline.document.partySize,
    studentsByUid,
    partyHref: (party) => `#${walkthroughPartyAnchorId(party)}`,
  };

  const meta = (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      {demo ? (
        <span>몰루로그</span>
      ) : author ? (
        <Link to={`/@${author.username}`} className={cn("text-v2-link hover:underline", v2FocusRing)}>
          @{author.username}
        </Link>
      ) : null}
      {!demo ? (
        <time dateTime={new Date(timeline.updatedAt).toISOString()} className="tabular-nums">
          {formatInstant(timeline.updatedAt, { timeZone, format: "YYYY/MM/DD" })} 수정
        </time>
      ) : null}
    </span>
  );

  const openViewerButton = (fullWidth: boolean) => (
    <>
      <a
        href={viewerUrl}
        target="_blank"
        rel="noopener"
        className={cn(
          "hidden min-h-v2-control-min items-center justify-center gap-1.5 rounded-md bg-v2-accent-solid px-3 text-sm font-medium text-v2-on-accent-solid hover:opacity-90 v2-interaction-transition [@media(any-pointer:coarse)]:inline-flex",
          fullWidth && "w-full",
          v2FocusRing,
        )}
      >
        <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
        새 창에서 열기
      </a>
      <Button
        variant="primary"
        onClick={() => void viewer.open()}
        className={cn("[@media(any-pointer:coarse)]:hidden", fullWidth && "w-full")}
      >
        <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
        {viewer.mode ? "뷰어로 돌아가기" : "새 창에서 열기"}
      </Button>
      {viewer.error ? <StatusNotice tone="danger">{viewer.error}</StatusNotice> : null}
    </>
  );

  const ownerActions = owner ? (
    <>
      <Link
        to={`/timelines/${timeline.uid}/edit`}
        className={cn(
          "inline-flex min-h-7 items-center gap-1.5 rounded-md bg-v2-inset px-2.5 text-[0.8125rem] font-medium text-v2-fg hover:bg-v2-filled-hover v2-interaction-transition",
          v2FocusRing,
        )}
      >
        <PencilSquareIcon className="size-4" aria-hidden="true" />
        수정
      </Link>
      <Form
        method="post"
        onSubmit={(event) => {
          if (!window.confirm("이 타임라인을 삭제할까요?")) event.preventDefault();
        }}
      >
        <Button type="submit" name="intent" value="delete" size="sm" variant="danger-subtle" disabled={isDeleting}>
          <TrashIcon className="size-4" aria-hidden="true" />
          {isDeleting ? "삭제 중..." : "삭제"}
        </Button>
      </Form>
    </>
  ) : null;

  const engagementActions = (
    <>
      {!demo && timeline.visibility === "public" ? (
        <WalkthroughLikeButton
          timelineUid={timeline.uid}
          liked={engagement.liked}
          likeCount={engagement.likeCount}
          signedIn={signedIn}
          canLike={canLike}
        />
      ) : null}
      <WalkthroughShareButton url={detailUrl} title={timeline.title} iconOnly={stacked} />
    </>
  );

  return (
    <V2Page width="wide" onStackedChange={onStackedChange}>
      <PageHeader
        back={{ title: "공략/타임라인", to: "/timelines" }}
        title={timeline.title}
        meta={meta}
        trailing={
          stacked ? undefined : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {ownerActions}
              {engagementActions}
            </div>
          )
        }
      />
      <PageMain>
        <div className="flex flex-col gap-v2-section-gap">
          {stacked ? (
            <div className="flex flex-col gap-3">
              <WalkthroughBossBanner bossUid={timeline.bossUid} bossName={bossName} />
              <div className="flex flex-wrap items-center gap-2">
                <WalkthroughConditions timeline={timeline} className="mr-auto" />
                {ownerActions}
                {engagementActions}
              </div>
              {hasTimeline ? openViewerButton(true) : null}
            </div>
          ) : null}
          {actionData?.error ? <StatusNotice tone="danger">{actionData.error}</StatusNotice> : null}
          {demo ? (
            <StatusNotice tone="neutral" Icon={InformationCircleIcon} boxed>
              실제 공략이 아닌 기능 안내용 예시예요.
            </StatusNotice>
          ) : null}

          <section aria-labelledby="formation-title" className="flex flex-col gap-3">
            <h2 id="formation-title" className="text-base font-semibold text-v2-fg">
              편성
            </h2>
            {parties.map((party, partyIndex) => (
              <WalkthroughPartyDetailCard
                key={party.uid}
                party={party}
                partyIndex={partyIndex}
                partySize={timeline.document.partySize}
                studentsByUid={studentsByUid}
                defaultTimelineExpanded={party.uid === firstTimelinePartyUid}
              />
            ))}
          </section>

          {timeline.body ? (
            <article aria-label="본문">
              <GuideBodyContent body={timeline.body} context={mentionContext} />
            </article>
          ) : null}

          {!demo && !owner ? (
            <div>
              {signedIn ? (
                <Form method="post">
                  <Button type="submit" name="intent" value="clone" disabled={isCloning}>
                    <DocumentDuplicateIcon className="size-4" aria-hidden="true" />
                    복제해서 내 타임라인 만들기
                  </Button>
                </Form>
              ) : (
                <Link to="/signin" className={cn("text-sm text-v2-link hover:underline", v2FocusRing)}>
                  로그인하면 내 타임라인으로 복제할 수 있어요.
                </Link>
              )}
            </div>
          ) : null}
        </div>
      </PageMain>
      <PageAside>
        <PanelSheet panelId="info" title="공략 정보" Icon={InformationCircleIcon}>
          <div className="flex flex-col gap-3">
            <WalkthroughBossBanner bossUid={timeline.bossUid} bossName={bossName} />
            <WalkthroughConditions timeline={timeline} />
            <dl className="flex items-center justify-between gap-3 text-sm">
              <dt className="text-v2-fg-tertiary">공개 범위</dt>
              <dd className="font-medium text-v2-fg">{visibilityLabel(timeline.visibility)}</dd>
            </dl>
          </div>
        </PanelSheet>
        {hasTimeline ? (
          <PanelSheet panelId="viewer" title="타임라인" Icon={ClockIcon}>
            <div className="flex flex-col gap-3">
              {openViewerButton(true)}
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-v2-on-media p-1.5">
                  <QRCodeSVG value={viewerUrl} size={72} level="M" aria-label="모바일 뷰어 접속 QR 코드" />
                </span>
                <span className="text-sm text-v2-fg-secondary">모바일에서 열기</span>
              </div>
            </div>
          </PanelSheet>
        ) : null}
        {otherGuidesPath ? (
          <AsideLinks
            items={[
              {
                key: "other-guides",
                title: "다른 공략 보기",
                description: "같은 보스의 공략",
                Icon: ListBulletIcon,
                to: otherGuidesPath,
              },
            ]}
          />
        ) : null}
        {signedIn ? (
          <div className="flex justify-end">
            <Button variant="secondary" className="text-xs" onClick={() => setFeedbackOpen(true)}>
              <ChatBubbleOvalLeftIcon className="size-4" aria-hidden="true" />
              {FEEDBACK_TITLE}
            </Button>
          </div>
        ) : null}
      </PageAside>
      <MobileActionBar
        links={[
          ...(otherGuidesPath
            ? [{ key: "other-guides", title: "다른 공략", Icon: ListBulletIcon, to: otherGuidesPath }]
            : []),
          ...(signedIn
            ? [
                {
                  key: "feedback",
                  title: FEEDBACK_TITLE,
                  Icon: ChatBubbleOvalLeftIcon,
                  onClick: () => setFeedbackOpen(true),
                },
              ]
            : []),
        ]}
      />
      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        featureName="공략/타임라인"
        feedbackType="walkthrough_timeline_feedback"
      />
      {viewer.portal}
    </V2Page>
  );
}
