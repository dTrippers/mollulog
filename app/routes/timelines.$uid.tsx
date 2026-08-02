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
import dayjs from "dayjs";
import { QRCodeSVG } from "qrcode.react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import CommunityWriteMaintenanceToast from "~/components/features/community/CommunityWriteMaintenanceToast";
import LikeButton from "~/components/features/engagement/LikeButton";
import { Page, RouteErrorBoundary } from "~/components/features/layout";
import {
  flattenTimelineParties,
  WalkthroughTimelineFeedbackButton,
  WalkthroughTimelineReadOnly,
  WalkthroughTimelineViewerLauncher,
} from "~/components/features/walkthrough-timeline";
import { AttributeBadge, Button, Callout } from "~/components/primitives";
import { PanelBody, PanelBodyRow } from "~/components/primitives/PanelBody";
import { getPostgresWalkthroughTimelineLikeSummaries } from "~/db/postgres/walkthrough-timeline-likes";
import {
  clonePostgresWalkthroughTimeline,
  deletePostgresWalkthroughTimeline,
  getPostgresWalkthroughTimeline,
} from "~/db/postgres/walkthrough-timelines";
import { isCommunityWriteMaintenanceActionResult } from "~/domain/community-write-freeze";
import {
  DEMO_WALKTHROUGH_BOSS_NAME,
  DEMO_WALKTHROUGH_TIMELINE,
  isDemoWalkthroughTimelineUid,
} from "~/domain/walkthrough-timeline-demo";
import { communityWriteMaintenanceResponse, isCommunityWriteFrozen } from "~/lib/community-write-freeze.server";
import { compareInstantDesc } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { getLogger } from "~/lib/observability.server";
import { defenseTypeColor, defenseTypeLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import { deleteCommunityPostByUid } from "~/models/community.server";
import { getAllRaidSchedules } from "~/models/raid";
import { getSenseiById, isSenseiProfileVisibleTo } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.timeline.title ?? "공략 타임라인"} | 몰루로그` },
  ...(data?.timeline.visibility === "public" ? [] : [{ name: "robots", content: "noindex,nofollow" }]),
];
export const ErrorBoundary = RouteErrorBoundary;

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const demo = isDemoWalkthroughTimelineUid(params.uid);
  const [storedTimeline, currentUser] = await Promise.all([
    params.uid && !demo ? getPostgresWalkthroughTimeline(env, params.uid, { ctx }) : null,
    getActiveSensei(env, request),
  ]);
  const timeline = demo ? DEMO_WALKTHROUGH_TIMELINE : storedTimeline;
  if (!timeline) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  const owner = storedTimeline !== null && currentUser?.id === storedTimeline.userId;
  if (timeline.visibility === "private" && !owner) {
    throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  }
  const author = storedTimeline ? await getSenseiById(env, storedTimeline.userId) : null;
  if (storedTimeline && (!author || !isSenseiProfileVisibleTo(author, currentUser?.id))) {
    throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  }
  const [students, raids, engagementByUid] = await Promise.all([
    getAllStudentsMap(env, true),
    getAllRaidSchedules(env),
    storedTimeline
      ? getPostgresWalkthroughTimelineLikeSummaries(env, [storedTimeline.uid], currentUser?.id, { ctx })
      : Promise.resolve<Record<string, { liked: boolean; likeCount: number }>>({}),
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
    studentsByUid: Object.fromEntries(Object.entries(students).map(([uid, student]) => [uid, { name: student.name }])),
  };
};

export const action = async ({ context, request, params }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const logger = getLogger(env, ctx, { route: "timelines.detail.action" });
  const currentUser = await getActiveSensei(env, request);
  if (!currentUser) return redirect("/unauthorized");
  if (!params.uid) throw routeError(404, "timeline.not_found", "공략 타임라인을 찾을 수 없어요.");
  if (isDemoWalkthroughTimelineUid(params.uid)) {
    throw routeError(400, "timeline.invalid_action", "데모 타임라인은 변경할 수 없어요.");
  }
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  if (intent === "clone") {
    const source = await getPostgresWalkthroughTimeline(env, params.uid, { ctx });
    const sourceAuthor = source ? await getSenseiById(env, source.userId) : null;
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
    if (
      await isCommunityWriteFrozen(env, {
        ctx,
        operation: "walkthrough-timeline.delete",
      })
    ) {
      return communityWriteMaintenanceResponse();
    }
    const deleted = await deletePostgresWalkthroughTimeline(env, params.uid, currentUser.id, { ctx });
    if (!deleted) throw routeError(403, "timeline.forbidden", "이 타임라인을 삭제할 수 없어요.");
    try {
      await deleteCommunityPostByUid(env, params.uid, currentUser.id);
    } catch (error) {
      logger.error("Failed to delete walkthrough timeline community post", error, {
        timelineUid: params.uid,
        operation: "delete",
      });
    }
    return redirect(`/@${currentUser.username}/timelines`);
  }
  throw routeError(400, "timeline.invalid_action", "지원하지 않는 요청이에요.");
};

export default function WalkthroughTimelineDetailPage() {
  const {
    timeline,
    engagement,
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
  const communityWriteMaintenanceVisible = isCommunityWriteMaintenanceActionResult(actionData);
  const navigation = useNavigation();
  const items = flattenTimelineParties(timeline.document.parties);
  return (
    <Page
      title="공략 타임라인 상세"
      description={timeline.title}
      contentWidth="full"
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
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {terrainLocale[timeline.terrain]} · {defenseTypeLocale[timeline.defenseType]}
                  </p>
                </div>
              </div>

              <PanelBodyRow title="방어 타입">
                <AttributeBadge
                  text={defenseTypeLocale[timeline.defenseType]}
                  color={defenseTypeColor[timeline.defenseType]}
                />
              </PanelBodyRow>
              <PanelBodyRow title="난이도">
                <span className="text-sm">{difficultyLocale[timeline.maxDifficulty]}</span>
              </PanelBodyRow>
              <PanelBodyRow title="공개 범위">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {timeline.visibility === "public" ? (
                    <LockOpenIcon className="size-3.5" />
                  ) : timeline.visibility === "unlisted" ? (
                    <LinkIcon className="size-3.5" />
                  ) : (
                    <LockClosedIcon className="size-3.5" />
                  )}
                  {timeline.visibility === "public"
                    ? "전체 공개"
                    : timeline.visibility === "unlisted"
                      ? "목록 미노출"
                      : "나만 보기"}
                </span>
              </PanelBodyRow>
              <PanelBodyRow title="작성자">
                {demo ? (
                  <span className="text-sm">몰루로그</span>
                ) : author ? (
                  <Link to={`/@${author.username}`} className="text-sm text-primary hover:underline">
                    @{author.username}
                  </Link>
                ) : (
                  <span className="text-sm">작성자 정보 없음</span>
                )}
              </PanelBodyRow>
              {!demo ? (
                <PanelBodyRow title="수정일">
                  <span className="text-sm tabular-nums">{dayjs(timeline.updatedAt).format("YYYY.MM.DD")}</span>
                </PanelBodyRow>
              ) : null}

              {owner ? (
                <div className="space-y-2">
                  {communityWriteMaintenanceVisible ? <CommunityWriteMaintenanceToast trigger={actionData} /> : null}
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
                      <Button
                        type="submit"
                        name="intent"
                        value="delete"
                        icon={TrashIcon}
                        text="삭제"
                        size="sm"
                        variant="danger-subtle"
                        fullWidth
                        disabled={navigation.state !== "idle"}
                      />
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
        <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div>
              <h2 className="font-bold">타임라인 뷰어 열기</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                공략 타임라인을 새 창에 띄워놓고 총력전/대결전을 진행해보세요
              </p>
              <div className="mt-4">
                <WalkthroughTimelineViewerLauncher
                  items={items}
                  studentsByUid={studentsByUid}
                  viewerUrl={viewerUrl}
                  shareUrl={detailUrl}
                  shareTitle={timeline.title}
                />
              </div>
            </div>
            <div
              role="img"
              aria-label="모바일 뷰어 접속 QR 코드"
              className="flex w-fit flex-col items-center gap-2 rounded-md border border-border bg-background p-2 text-center transition-colors hover:bg-muted"
            >
              <QRCodeSVG value={viewerUrl} size={104} level="M" includeMargin aria-label="모바일 뷰어 접속 QR 코드" />
              <span className="text-xs text-muted-foreground">모바일에서 열기</span>
            </div>
          </div>
        </section>

        <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
          <h2 className="font-bold">타임라인</h2>
          {timeline.description ? (
            <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{timeline.description}</p>
          ) : null}
          <div className="mt-4">
            <WalkthroughTimelineReadOnly parties={timeline.document.parties} studentsByUid={studentsByUid} />
          </div>
        </section>

        <div className="flex flex-wrap gap-2">
          {!demo && timeline.visibility === "public" ? (
            <LikeButton
              targetUid={timeline.uid}
              action={`/api/timelines/${timeline.uid}/likes`}
              liked={engagement.liked}
              likeCount={engagement.likeCount}
              signedIn={signedIn}
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
