import {
  DocumentDuplicateIcon,
  InformationCircleIcon,
  LinkIcon,
  ListBulletIcon,
  LockClosedIcon,
  LockOpenIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { BoltIcon } from "@heroicons/react/16/solid";
import { QRCodeSVG } from "qrcode.react";
import { type ReactNode, useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import LikeButton from "~/components/features/engagement/LikeButton";
import { Page, RouteErrorBoundary } from "~/components/features/layout";
import {
  flattenTimelineParties,
  WalkthroughTimelineFeedbackButton,
  WalkthroughTimelineReadOnly,
  WalkthroughTimelineViewerLauncher,
} from "~/components/features/walkthrough-timeline";
import { AttributeBadge, Button, Callout } from "~/components/primitives";
import { PanelBody } from "~/components/primitives/PanelBody";
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
import type { WalkthroughTimelineRecord } from "~/domain/walkthrough-timeline";
import { compareInstantDesc, formatInstant } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import { getAllRaidSchedules } from "~/models/raid";
import { getSenseiById, isSenseiProfileVisibleTo } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.timeline.title ?? "공략 타임라인"} | 몰루로그` },
  ...(data?.timeline.visibility === "public" ? [] : [{ name: "robots", content: "noindex,nofollow" }]),
];
export const ErrorBoundary = RouteErrorBoundary;

type ActionData = { error: string };

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const demo = isDemoWalkthroughTimelineUid(params.uid);
  const [storedTimeline, currentUser] = await Promise.all([
    params.uid && !demo ? getPostgresWalkthroughTimeline(env, params.uid, { ctx }) : null,
    getActiveSensei(env, request, ctx),
  ]);
  const timeline = demo ? DEMO_WALKTHROUGH_TIMELINE : storedTimeline;
  if (!timeline) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  const owner = storedTimeline !== null && currentUser?.id === storedTimeline.userId;
  if (timeline.visibility === "private" && !owner) {
    throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  }
  const author = storedTimeline ? await getSenseiById(env, storedTimeline.userId, { ctx }) : null;
  if (storedTimeline && (!author || !isSenseiProfileVisibleTo(author, currentUser?.id))) {
    throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
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
  const detailUrl = new URL(`/timelines/${timeline.uid}`, request.url).toString();
  const viewerUrl = new URL(`/timelines/${timeline.uid}/viewer`, request.url).toString();
  return {
    timeline,
    engagement: engagementByUid[timeline.uid] ?? { liked: false, likeCount: 0 },
    canLike,
    owner,
    demo,
    signedIn: currentUser !== null,
    author: author ? { username: author.username } : null,
    bossName: bossName ?? (demo ? DEMO_WALKTHROUGH_BOSS_NAME : null),
    latestBossTimelinePath: latestBossSchedule
      ? `/timelines?${new URLSearchParams({
          bossUid: timeline.bossUid,
          terrain: timeline.terrain,
          defenseType: timeline.defenseType,
        }).toString()}`
      : null,
    detailUrl,
    viewerUrl,
    studentsByUid: Object.fromEntries(
      Object.entries(students).map(([uid, student]) => [uid, { name: student.name, equipments: student.equipments }]),
    ),
  };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "timelines.detail.action" });
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) return redirect("/unauthorized");
  if (!params.uid) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
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
      return redirect(`/@${currentUser.username}/timelines`);
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
    latestBossTimelinePath,
    studentsByUid,
    detailUrl,
    viewerUrl,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const deleteControlRef = useRef<HTMLDivElement>(null);
  const isDeleteSubmitting = navigation.state !== "idle" && navigation.formData?.get("intent") === "delete";
  const items = flattenTimelineParties(timeline.document.parties);
  const visibilityLabel =
    timeline.visibility === "public" ? "전체 공개" : timeline.visibility === "unlisted" ? "목록 미노출" : "나만 보기";
  const authorSummary = demo ? (
    <span>몰루로그</span>
  ) : author ? (
    <Link to={`/@${author.username}`} className="text-primary hover:underline">
      @{author.username}
    </Link>
  ) : (
    <span>작성자 정보 없음</span>
  );
  const visibilitySummary = (
    <span className="inline-flex items-center gap-1">
      {timeline.visibility === "public" ? (
        <LockOpenIcon className="size-3.5" />
      ) : timeline.visibility === "unlisted" ? (
        <LinkIcon className="size-3.5" />
      ) : (
        <LockClosedIcon className="size-3.5" />
      )}
      {visibilityLabel}
    </span>
  );

  useEffect(() => {
    if (!actionData?.error || navigation.state !== "idle") return;
    deleteControlRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [actionData?.error, navigation.state]);

  return (
    <Page
      title="공략 타임라인 상세"
      description={timeline.title}
      contentWidth="full"
      belowTitle={
        <div className="lg:hidden">
          <div className="relative overflow-hidden rounded-md border border-border bg-background px-3 py-3">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-contain bg-right bg-no-repeat opacity-70"
              style={{ backgroundImage: `url(${bossImageUrl(timeline.bossUid)})` }}
            />
            <div className="relative">
              <p className="font-semibold">{bossName ?? "보스 정보 확인 불가"}</p>
              <div className="mt-3 space-y-3">
                <TimelineConditionBadges timeline={timeline} />
                <TimelineMetadata
                  visibilitySummary={visibilitySummary}
                  authorSummary={authorSummary}
                  updatedAt={timeline.updatedAt}
                  demo={demo}
                />
              </div>
            </div>
          </div>
        </div>
      }
      panels={[
        {
          title: "공략 정보",
          Icon: InformationCircleIcon,
          children: (
            <PanelBody>
              <div className="relative overflow-hidden rounded-md border border-border bg-background px-3 py-3">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-2/3 bg-contain bg-right bg-no-repeat opacity-70"
                  style={{ backgroundImage: `url(${bossImageUrl(timeline.bossUid)})` }}
                />
                <div className="relative">
                  <p className="font-semibold">{bossName ?? "보스 정보 확인 불가"}</p>
                </div>
              </div>

              <TimelineConditionBadges timeline={timeline} />
              <TimelineMetadata
                visibilitySummary={visibilitySummary}
                authorSummary={authorSummary}
                updatedAt={timeline.updatedAt}
                demo={demo}
              />

              {owner ? (
                <div className="space-y-2">
                  {actionData?.error ? (
                    <div role="alert">
                      <Callout tone="destructive" title={actionData.error} />
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      to={`/timelines/${timeline.uid}/edit`}
                      icon={PencilSquareIcon}
                      text="수정"
                      size="sm"
                      fullWidth
                    />
                    <Form
                      method="post"
                      onSubmit={(event) => {
                        if (!window.confirm("이 타임라인을 삭제할까요?")) event.preventDefault();
                      }}
                    >
                      <div ref={deleteControlRef}>
                        <Button
                          type="submit"
                          name="intent"
                          value="delete"
                          icon={TrashIcon}
                          text={isDeleteSubmitting ? "삭제 중..." : "삭제"}
                          size="sm"
                          variant="danger-subtle"
                          fullWidth
                          disabled={isDeleteSubmitting}
                        />
                      </div>
                    </Form>
                  </div>
                </div>
              ) : null}
            </PanelBody>
          ),
        },
      ]}
      belowPanels={<WalkthroughTimelineFeedbackButton signedIn={signedIn} />}
      links={
        latestBossTimelinePath
          ? [
              {
                title: "다른 공략 보기",
                description: "해당 보스의 다른 공략/타임라인 확인",
                Icon: ListBulletIcon,
                to: latestBossTimelinePath,
              },
            ]
          : undefined
      }
    >
      <div className="space-y-4 py-4">
        {demo ? (
          <Callout
            Icon={InformationCircleIcon}
            title="공략 타임라인 데모 예시입니다"
            description="실제 공략이 아닌 기능 안내용 예시입니다. 편성, 학생 성장도와 여러 종류의 타임라인 단계를 둘러보세요."
            tone="info"
          />
        ) : null}
        <section
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-card p-4 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-5"
          aria-labelledby="timeline-viewer-actions"
        >
          <div className="min-w-0 flex-1">
            <h2 id="timeline-viewer-actions" className="sr-only">
              뷰어와 공유
            </h2>
            <WalkthroughTimelineViewerLauncher
              items={items}
              studentsByUid={studentsByUid}
              viewerUrl={viewerUrl}
              shareUrl={detailUrl}
              shareTitle={timeline.title}
            />
            {timeline.description ? (
              <div className="mt-3">
                <h2 className="sr-only">공략 설명</h2>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{timeline.description}</p>
              </div>
            ) : null}
          </div>
          <div
            role="img"
            aria-label="모바일 뷰어 접속 QR 코드"
            className="hidden w-fit flex-col items-center gap-2 rounded-md bg-background p-2 text-center md:flex"
          >
            <QRCodeSVG value={viewerUrl} size={88} level="M" includeMargin aria-label="모바일 뷰어 접속 QR 코드" />
            <span className="text-xs text-muted-foreground">모바일에서 열기</span>
          </div>
        </section>

        <WalkthroughTimelineReadOnly
          parties={timeline.document.parties}
          partySize={timeline.document.partySize}
          studentsByUid={studentsByUid}
        />

        <div className="flex flex-wrap gap-2">
          {!demo && timeline.visibility === "public" ? (
            <LikeButton
              targetUid={timeline.uid}
              action={`/api/timelines/${timeline.uid}/likes`}
              liked={engagement.liked}
              likeCount={engagement.likeCount}
              signedIn={signedIn}
              canLike={canLike}
            />
          ) : null}
          {!demo && signedIn && !owner && (
            <Form method="post">
              <Button
                type="submit"
                name="intent"
                value="clone"
                icon={DocumentDuplicateIcon}
                text="복제해서 내 타임라인 만들기"
                disabled={navigation.state !== "idle"}
              />
            </Form>
          )}
          {!demo && !signedIn && (
            <Link to="/signin" className="text-sm text-primary hover:underline">
              로그인하면 내 타임라인으로 복제할 수 있어요.
            </Link>
          )}
        </div>
      </div>
    </Page>
  );
}

function TimelineConditionBadges({ timeline }: { timeline: WalkthroughTimelineRecord }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AttributeBadge text={terrainLocale[timeline.terrain]} color={null} />
      <AttributeBadge text={defenseTypeLocale[timeline.defenseType]} color={defenseTypeColor[timeline.defenseType]} />
      <AttributeBadge text={difficultyLocale[timeline.maxDifficulty]} color={null} />
      {timeline.isAuto ? (
        <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold leading-none text-emerald-700 dark:text-emerald-300">
          <BoltIcon className="size-3.5" aria-hidden="true" />
          오토
        </span>
      ) : null}
    </div>
  );
}

function TimelineMetadata({
  visibilitySummary,
  authorSummary,
  updatedAt,
  demo,
}: {
  visibilitySummary: ReactNode;
  authorSummary: ReactNode;
  updatedAt: Date;
  demo: boolean;
}) {
  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex items-center justify-between gap-3">
        <dt className="shrink-0 text-muted-foreground">공개 범위</dt>
        <dd className="max-w-[70%] break-words text-right font-medium">{visibilitySummary}</dd>
      </div>
      <div className="flex items-center justify-between gap-3">
        <dt className="shrink-0 text-muted-foreground">작성자</dt>
        <dd className="max-w-[70%] break-words text-right font-medium">{authorSummary}</dd>
      </div>
      {!demo ? (
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">수정일</dt>
          <dd className="max-w-[70%] break-words text-right font-medium tabular-nums">
            {formatInstant(updatedAt, { timeZone: "Asia/Seoul" })}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
