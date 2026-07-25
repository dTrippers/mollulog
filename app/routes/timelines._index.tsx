import { ArrowRightIcon, FunnelIcon, PlusIcon } from "@heroicons/react/24/outline";
import dayjs from "dayjs";
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import LikeButton from "~/components/features/engagement/LikeButton";
import { Page, RouteErrorBoundary } from "~/components/features/layout";
import { RaidPartyCard, type RaidPartyRow } from "~/components/features/raids";
import { WalkthroughTimelineFeedbackButton } from "~/components/features/walkthrough-timeline";
import WalkthroughBossSelect from "~/components/features/walkthrough-timeline/WalkthroughBossSelect";
import { AttributeBadge, Button, PanelFilterButtonsSection, PanelSwitchRow } from "~/components/primitives";
import { PanelBody, PanelBodySection } from "~/components/primitives/PanelBody";
import { getPostgresWalkthroughTimelineLikeSummaries } from "~/db/postgres/walkthrough-timeline-likes";
import { listPostgresVisibleWalkthroughTimelines } from "~/db/postgres/walkthrough-timelines";
import {
  WALKTHROUGH_TIMELINE_DEFENSE_TYPES,
  WALKTHROUGH_TIMELINE_DIFFICULTIES,
  WALKTHROUGH_TIMELINE_TERRAINS,
  type WalkthroughTimelineRecord,
} from "~/domain/walkthrough-timeline";
import { DEMO_WALKTHROUGH_BOSS_NAME, DEMO_WALKTHROUGH_TIMELINE } from "~/domain/walkthrough-timeline-demo";
import { canonicalLink } from "~/lib/seo";
import {
  defenseTypeColor,
  defenseTypeLocale,
  defenseTypeShortLocale,
  difficultyLocale,
  terrainLocale,
} from "~/locales/ko";
import { bossImageUrl } from "~/models/assets";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getVisibleSenseisById } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";

export const meta: MetaFunction = ({ location }) => [
  { title: "공략 타임라인 | 몰루로그" },
  {
    name: "description",
    content: "보스와 지형, 방어 타입, 난이도에 맞는 공략 타임라인을 찾아보세요.",
  },
  canonicalLink(location.pathname),
];

export const ErrorBoundary = RouteErrorBoundary;

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const [raids, rawStudents, sensei] = await Promise.all([
    getAllRaidSchedules(env),
    getAllStudentsMap(env, true),
    getActiveSensei(env, request),
  ]);
  const bosses = [
    ...new Map(
      raids
        .filter((raid) => ["total_assault", "elimination", "unlimit"].includes(raid.raidType))
        .map((raid) => [raid.raidBoss.uid, { uid: raid.raidBoss.uid, name: raid.raidBoss.name }]),
    ).values(),
  ].sort((left, right) => left.name.localeCompare(right.name, "ko"));

  const searchParams = new URL(request.url).searchParams;
  const requestedBossUid = searchParams.get("bossUid");
  const likedOnly = sensei !== null && searchParams.get("liked") === "1";
  const filters = {
    bossUid: bosses.some((boss) => boss.uid === requestedBossUid) ? requestedBossUid : null,
    terrain: WALKTHROUGH_TIMELINE_TERRAINS.find((terrain) => terrain === searchParams.get("terrain")) ?? null,
    defenseType:
      WALKTHROUGH_TIMELINE_DEFENSE_TYPES.find((defenseType) => defenseType === searchParams.get("defenseType")) ?? null,
    maxDifficulty:
      WALKTHROUGH_TIMELINE_DIFFICULTIES.find((difficulty) => difficulty === searchParams.get("difficulty")) ?? null,
    likedOnly,
  };
  const timelines = await listPostgresVisibleWalkthroughTimelines(
    env,
    {
      ...filters,
      likedByUserId: likedOnly ? sensei.id : null,
      viewerUserId: sensei?.id,
    },
    { ctx },
  );
  const authors = await getVisibleSenseisById(
    env,
    timelines.map((timeline) => timeline.userId),
    sensei?.id,
  );
  const visibleAuthorIds = new Set(authors.map((author) => author.id));
  const visibleTimelines = timelines.filter((timeline) => visibleAuthorIds.has(timeline.userId));
  const timelineUids = visibleTimelines.map((timeline) => timeline.uid);
  const [recruitedStudentTiers, engagementByUid] = await Promise.all([
    sensei ? getRecruitedStudentTiers(env, sensei.id) : Promise.resolve({}),
    getPostgresWalkthroughTimelineLikeSummaries(env, timelineUids, sensei?.id, { ctx }),
  ]);

  return {
    timelines: visibleTimelines,
    filters,
    engagementByUid,
    bosses,
    authorsById: Object.fromEntries(authors.map((author) => [author.id, author.username])),
    studentsByUid: Object.fromEntries(
      Object.entries(rawStudents).map(([uid, student]) => [
        uid,
        {
          name: student.name,
          attackType: student.attackType,
          defenseType: student.defenseType,
          role: student.role,
        },
      ]),
    ),
    recruitedStudentTiers,
    hasRecruitedStudentData: sensei !== null,
    signedIn: sensei !== null,
  };
};

export default function WalkthroughTimelineCatalogPage() {
  const {
    timelines,
    filters,
    engagementByUid,
    bosses,
    authorsById,
    studentsByUid,
    recruitedStudentTiers,
    hasRecruitedStudentData,
    signedIn,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showUnrecruitedStudents, setShowUnrecruitedStudents] = useState(true);

  const setFilter = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <Page
      title="공략 타임라인 (β)"
      description="다른 선생님들이 작성한 총력전/대결전 공략과 타임라인을 확인해보세요"
      contentWidth="full"
      panels={[
        {
          title: "필터",
          Icon: FunnelIcon,
          children: (
            <PanelBody>
              <PanelBodySection title="보스">
                <WalkthroughBossSelect
                  value={filters.bossUid ?? ""}
                  options={[{ uid: "", name: "전체" }, ...bosses]}
                  onChange={(bossUid) => setFilter("bossUid", bossUid || null)}
                />
              </PanelBodySection>
              <PanelFilterButtonsSection
                title="지형"
                buttonProps={[
                  {
                    text: "전체",
                    active: filters.terrain === null,
                    onToggle: () => setFilter("terrain", null),
                  },
                  ...WALKTHROUGH_TIMELINE_TERRAINS.map((terrain) => ({
                    text: terrainLocale[terrain],
                    active: filters.terrain === terrain,
                    onToggle: () => setFilter("terrain", terrain),
                  })),
                ]}
                exclusive
                atLeastOne
                size="sm"
              />
              <PanelFilterButtonsSection
                title="방어 타입"
                buttonProps={[
                  {
                    text: "전체",
                    active: filters.defenseType === null,
                    onToggle: () => setFilter("defenseType", null),
                  },
                  ...WALKTHROUGH_TIMELINE_DEFENSE_TYPES.map((defenseType) => ({
                    text: defenseTypeShortLocale[defenseType],
                    color: defenseTypeColor[defenseType],
                    active: filters.defenseType === defenseType,
                    onToggle: () => setFilter("defenseType", defenseType),
                  })),
                ]}
                exclusive
                atLeastOne
                size="sm"
              />
              <PanelFilterButtonsSection
                title="난이도"
                buttonProps={[
                  {
                    text: "전체",
                    active: filters.maxDifficulty === null,
                    onToggle: () => setFilter("difficulty", null),
                  },
                  ...WALKTHROUGH_TIMELINE_DIFFICULTIES.map((difficulty) => ({
                    text: difficultyLocale[difficulty],
                    active: filters.maxDifficulty === difficulty,
                    onToggle: () => setFilter("difficulty", difficulty),
                  })),
                ]}
                exclusive
                atLeastOne
                size="sm"
              />
              {hasRecruitedStudentData || signedIn ? (
                <div className="space-y-0">
                  {hasRecruitedStudentData ? (
                    <PanelSwitchRow
                      title="미모집 학생 표시"
                      checked={showUnrecruitedStudents}
                      onChange={setShowUnrecruitedStudents}
                    />
                  ) : null}
                  {signedIn ? (
                    <PanelSwitchRow
                      title="좋아요한 공략만 보기"
                      checked={filters.likedOnly}
                      onChange={(checked) => setFilter("liked", checked ? "1" : null)}
                      className="border-t-0 pt-0"
                    />
                  ) : null}
                </div>
              ) : null}
            </PanelBody>
          ),
        },
      ]}
      belowPanels={<WalkthroughTimelineFeedbackButton signedIn={signedIn} />}
    >
      <div className="py-4">
        {signedIn ? (
          <div className="mb-4 flex justify-end">
            <Button to="/timelines/new" icon={PlusIcon} text="공략 작성" variant="primary" />
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <WalkthroughTimelineCard
            timeline={DEMO_WALKTHROUGH_TIMELINE}
            bossName={
              bosses.find((boss) => boss.uid === DEMO_WALKTHROUGH_TIMELINE.bossUid)?.name ?? DEMO_WALKTHROUGH_BOSS_NAME
            }
            studentsByUid={studentsByUid}
            recruitedStudentTiers={recruitedStudentTiers}
            showUnrecruitedStudents={false}
            engagement={{ liked: false, likeCount: 0 }}
            signedIn={signedIn}
            demo
          />
          {timelines.map((timeline) => (
            <WalkthroughTimelineCard
              key={timeline.uid}
              timeline={timeline}
              bossName={bosses.find((boss) => boss.uid === timeline.bossUid)?.name ?? null}
              author={authorsById[timeline.userId]}
              studentsByUid={studentsByUid}
              recruitedStudentTiers={recruitedStudentTiers}
              showUnrecruitedStudents={hasRecruitedStudentData && showUnrecruitedStudents}
              engagement={engagementByUid[timeline.uid] ?? { liked: false, likeCount: 0 }}
              signedIn={signedIn}
            />
          ))}
        </div>
      </div>
    </Page>
  );
}

type TimelineStudent = Awaited<ReturnType<typeof loader>>["studentsByUid"][string];

function WalkthroughTimelineCard({
  timeline,
  bossName,
  author,
  studentsByUid,
  recruitedStudentTiers,
  showUnrecruitedStudents,
  engagement,
  signedIn,
  demo = false,
}: {
  timeline: Omit<WalkthroughTimelineRecord, "userId">;
  bossName: string | null;
  author?: string;
  studentsByUid: Record<string, TimelineStudent>;
  recruitedStudentTiers: Record<string, number>;
  showUnrecruitedStudents: boolean;
  engagement: { liked: boolean; likeCount: number };
  signedIn: boolean;
  demo?: boolean;
}) {
  const rows: RaidPartyRow[] = timeline.document.parties.map((party, partyIndex) => ({
    key: party.uid,
    label: String(partyIndex + 1),
    slots: Array.from({ length: timeline.document.partySize }, (_, slot) => {
      const unit = party.units.find((candidate) => candidate.slot === slot);
      const studentUid = unit?.studentUid;
      if (!studentUid) return { uid: null };
      const student = studentsByUid[studentUid];
      const isUnrecruited = showUnrecruitedStudents && recruitedStudentTiers[studentUid] === undefined;
      return {
        uid: studentUid,
        name: student?.name,
        attackType: student?.attackType,
        defenseType: student?.defenseType,
        role: student?.role,
        tier: unit.snapshot?.tier,
        grayscale: isUnrecruited,
        unrecruited: isUnrecruited,
      };
    }),
  }));

  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-lg bg-card shadow-lg shadow-black/5 ring-primary/30 dark:shadow-md dark:shadow-black/20 data-[demo=true]:ring-1"
      data-demo={demo}
    >
      <div>
        <div className="relative overflow-hidden p-4">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-3/5 bg-contain bg-right bg-no-repeat opacity-55"
            style={{ backgroundImage: `url(${bossImageUrl(timeline.bossUid)})` }}
          />
          <span className="pointer-events-none absolute inset-0 bg-linear-to-r from-card from-45% via-card/90 via-70% to-card/30" />
          <div className="relative min-w-0">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{bossName ?? "보스 정보 확인 불가"}</p>
            <h2 className="line-clamp-2 text-lg font-bold text-foreground">{timeline.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                {demo
                  ? "데모 타임라인으로 동작을 확인해보세요"
                  : `${author ? `@${author} · ` : ""}${dayjs(timeline.updatedAt).format("YYYY.MM.DD")}`}
              </span>
              {timeline.visibility !== "public" ? (
                <span className="rounded-full bg-muted px-2 py-0.5">
                  {timeline.visibility === "unlisted" ? "목록 미노출" : "나만 보기"}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3">
          <AttributeBadge text={terrainLocale[timeline.terrain]} color={null} />
          <AttributeBadge text={difficultyLocale[timeline.maxDifficulty]} color={null} />
          <AttributeBadge
            text={defenseTypeLocale[timeline.defenseType]}
            color={defenseTypeColor[timeline.defenseType]}
          />
        </div>
      </div>

      <RaidPartyCard
        rows={rows}
        summaryItems={[]}
        popupIdPrefix={`walkthrough-${timeline.uid}`}
        slotCount={timeline.document.partySize}
        centerRowLabels
        emptyText="편성 정보가 없어요"
        className="grow rounded-none pt-0 md:pt-0"
      />
      <div className="flex items-center justify-between gap-2 px-4 pb-4">
        {!demo && timeline.visibility === "public" ? (
          <LikeButton
            targetUid={timeline.uid}
            action={`/api/timelines/${timeline.uid}/likes`}
            liked={engagement.liked}
            likeCount={engagement.likeCount}
            signedIn={signedIn}
          />
        ) : null}
        <Button
          to={`/timelines/${timeline.uid}`}
          text="자세히 보기"
          icon={ArrowRightIcon}
          size="xs"
          className="ml-auto"
        />
      </div>
    </article>
  );
}
