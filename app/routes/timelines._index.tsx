import { ChatBubbleOvalLeftIcon, FunnelIcon, PlusIcon } from "@heroicons/react/16/solid";
import { type ReactNode, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { FeedbackSheet } from "~/components/v2/features/feedback/FeedbackSheet";
import { WalkthroughBossSelect } from "~/components/v2/features/walkthroughs/WalkthroughBossSelect";
import {
  WalkthroughListCard,
  type WalkthroughListCardData,
} from "~/components/v2/features/walkthroughs/WalkthroughListCard";
import { WalkthroughRouteError } from "~/components/v2/features/walkthroughs/WalkthroughRouteError";
import { UNKNOWN_STUDENT_NAME } from "~/components/v2/features/walkthroughs/walkthrough-parts";
import { MobileActionBar } from "~/components/v2/layout/MobileActionBar";
import { PageAside } from "~/components/v2/layout/PageAside";
import { PageHeader } from "~/components/v2/layout/PageHeader";
import { PageMain } from "~/components/v2/layout/PageMain";
import { PanelAction } from "~/components/v2/layout/PanelAction";
import { PanelSheet } from "~/components/v2/layout/PanelSheet";
import { V2Page } from "~/components/v2/layout/V2Page";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { Switch } from "~/components/v2/primitives/Switch";
import { ToggleChip } from "~/components/v2/primitives/ToggleChip";
import { getPostgresWalkthroughTimelineLikeSummaries } from "~/db/postgres/walkthrough-timeline-likes";
import { listPostgresVisibleWalkthroughTimelines } from "~/db/postgres/walkthrough-timelines";
import { guideBodyPlainText } from "~/domain/guide-body";
import { walkthroughMentionLabelResolver } from "~/domain/walkthrough-mentions";
import {
  WALKTHROUGH_TIMELINE_DEFENSE_TYPES,
  WALKTHROUGH_TIMELINE_DIFFICULTIES,
  WALKTHROUGH_TIMELINE_TERRAINS,
  type WalkthroughTimelineRecord,
} from "~/domain/walkthrough-timeline";
import { DEMO_WALKTHROUGH_BOSS_NAME, DEMO_WALKTHROUGH_TIMELINE } from "~/domain/walkthrough-timeline-demo";
import { trackGoogleAnalyticsEventIfAllowed } from "~/lib/google-analytics-events.client";
import { canonicalLink, socialMeta } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { defenseTypeShortLocale, difficultyLocale, terrainLocale } from "~/locales/ko";
import { getUserParties } from "~/models/party.server";
import { getKoreanRaidSchedules } from "~/models/raid-season.server";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getVisibleSenseisById } from "~/models/sensei";
import { getAllStudentsMap } from "~/models/student";
import { walkthroughStudentNameLookup } from "./timelines._components/timeline-route-data.server";

const PAGE_TITLE = "공략/타임라인";
const FILTER_PANEL_ID = "timeline-filter";
const FEEDBACK_TITLE = "의견/오류 제보";
// A card shows two lines of the body, so the rest never needs to reach the page.
const EXCERPT_MAX_LENGTH = 200;
const FILTER_KEYS = ["bossUid", "terrain", "defenseType", "difficulty", "auto", "mine", "liked"] as const;

export const meta: MetaFunction = ({ location }) => {
  const description = "보스와 지형, 방어 타입, 난이도에 맞는 공략과 타임라인을 찾아보세요.";
  return [
    { title: `${PAGE_TITLE} | 몰루로그` },
    { name: "description", content: description },
    ...socialMeta({ title: PAGE_TITLE, description, pathname: location.pathname }),
    canonicalLink(location.pathname),
  ];
};

export const ErrorBoundary = WalkthroughRouteError;

function toCardData(
  timeline: Omit<WalkthroughTimelineRecord, "userId">,
  studentName: (uid: string) => string | undefined,
): WalkthroughListCardData {
  const parties = [...timeline.document.parties].sort((left, right) => left.order - right.order);
  const excerpt = guideBodyPlainText(timeline.body, walkthroughMentionLabelResolver(parties, studentName)).replace(
    /\s+/g,
    " ",
  );
  return {
    uid: timeline.uid,
    title: timeline.title,
    bossUid: timeline.bossUid,
    terrain: timeline.terrain,
    defenseType: timeline.defenseType,
    maxDifficulty: timeline.maxDifficulty,
    isAuto: timeline.isAuto,
    visibility: timeline.visibility,
    updatedAt: timeline.updatedAt,
    excerpt: excerpt.length > EXCERPT_MAX_LENGTH ? `${excerpt.slice(0, EXCERPT_MAX_LENGTH)}…` : excerpt,
    parties: parties.map((party) => ({
      uid: party.uid,
      studentUids: [...party.units]
        .sort((left, right) => left.slot - right.slot)
        .flatMap((unit) => (unit.studentUid ? [unit.studentUid] : [])),
      hasTimeline: party.steps.length > 0,
    })),
  };
}

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const [raids, rawStudents, sensei] = await Promise.all([
    getKoreanRaidSchedules(env, { ctx }),
    getAllStudentsMap(env, true),
    getActiveSensei(env, request, ctx),
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
  const mineOnly = sensei !== null && searchParams.get("mine") === "1";
  const filters = {
    bossUid: bosses.some((boss) => boss.uid === requestedBossUid) ? requestedBossUid : null,
    terrain: WALKTHROUGH_TIMELINE_TERRAINS.find((terrain) => terrain === searchParams.get("terrain")) ?? null,
    defenseType:
      WALKTHROUGH_TIMELINE_DEFENSE_TYPES.find((defenseType) => defenseType === searchParams.get("defenseType")) ?? null,
    maxDifficulty:
      WALKTHROUGH_TIMELINE_DIFFICULTIES.find((difficulty) => difficulty === searchParams.get("difficulty")) ?? null,
    autoOnly: searchParams.get("auto") === "1",
    likedOnly,
    mineOnly,
  };
  const timelines = await listPostgresVisibleWalkthroughTimelines(
    env,
    {
      bossUid: filters.bossUid,
      terrain: filters.terrain,
      defenseType: filters.defenseType,
      maxDifficulty: filters.maxDifficulty,
      isAuto: filters.autoOnly ? true : undefined,
      likedByUserId: likedOnly ? sensei.id : null,
      authorUserId: mineOnly ? sensei.id : null,
      viewerUserId: sensei?.id,
    },
    { ctx },
  );
  const authors = await getVisibleSenseisById(
    env,
    timelines.map((timeline) => timeline.userId),
    sensei?.id,
    { ctx },
  );
  const authorsById = new Map(authors.map((author) => [author.id, author.username]));
  const visibleTimelines = timelines.filter((timeline) => authorsById.has(timeline.userId));
  const [recruitedStudentTiers, engagementByUid, earlierPartiesPath] = await Promise.all([
    sensei ? getRecruitedStudentTiers(env, sensei.id) : Promise.resolve({}),
    getPostgresWalkthroughTimelineLikeSummaries(
      env,
      visibleTimelines.map((timeline) => timeline.uid),
      sensei?.id,
      { ctx },
    ),
    // The earlier parties page is only offered to someone who still has parties there.
    mineOnly
      ? getUserParties(env, sensei.username, { includePrivate: true }).then((parties) =>
          parties.length > 0 ? `/timelines/parties/@${sensei.username}` : null,
        )
      : null,
  ]);

  const studentName = walkthroughStudentNameLookup(rawStudents);
  const shownStudentUids = new Set<string>();
  const toCard = (timeline: Omit<WalkthroughTimelineRecord, "userId">) => {
    const card = toCardData(timeline, studentName);
    for (const party of card.parties) for (const uid of party.studentUids) shownStudentUids.add(uid);
    return card;
  };
  const guides = visibleTimelines.map((timeline) => ({
    card: toCard(timeline),
    author: authorsById.get(timeline.userId) ?? null,
    // An author cannot like their own guide.
    canLike: timeline.userId !== sensei?.id,
  }));
  const demo = !filters.autoOnly && !filters.mineOnly && !filters.likedOnly ? toCard(DEMO_WALKTHROUGH_TIMELINE) : null;

  return {
    guides,
    demo,
    demoBossName:
      bosses.find((boss) => boss.uid === DEMO_WALKTHROUGH_TIMELINE.bossUid)?.name ?? DEMO_WALKTHROUGH_BOSS_NAME,
    filters,
    engagementByUid,
    bosses,
    studentNames: Object.fromEntries([...shownStudentUids].map((uid) => [uid, studentName(uid) ?? null])),
    recruitedStudentUids: Object.keys(recruitedStudentTiers),
    signedIn: sensei !== null,
    earlierPartiesPath,
  };
};

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-semibold text-v2-fg-tertiary">{title}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function ChoiceChips<T extends string>({
  title,
  options,
  value,
  label,
  onChange,
}: {
  title: string;
  options: readonly T[];
  value: T | null;
  label: (option: T) => string;
  onChange: (value: T | null) => void;
}) {
  return (
    <FilterGroup title={title}>
      <ToggleChip pressed={value === null} onPressedChange={() => onChange(null)}>
        전체
      </ToggleChip>
      {options.map((option) => (
        <ToggleChip key={option} pressed={value === option} onPressedChange={() => onChange(option)}>
          {label(option)}
        </ToggleChip>
      ))}
    </FilterGroup>
  );
}

export default function WalkthroughTimelineCatalogPage() {
  const {
    guides,
    demo,
    demoBossName,
    filters,
    engagementByUid,
    bosses,
    studentNames,
    recruitedStudentUids,
    signedIn,
    earlierPartiesPath,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showUnrecruitedStudents, setShowUnrecruitedStudents] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const recruited = new Set(recruitedStudentUids);
  const bossNameByUid = new Map(bosses.map((boss) => [boss.uid, boss.name]));
  const studentName = (uid: string) => studentNames[uid] ?? UNKNOWN_STUDENT_NAME;
  const isUnrecruited = (uid: string) => signedIn && showUnrecruitedStudents && !recruited.has(uid);
  const filterActive = FILTER_KEYS.some((key) => searchParams.has(key));

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string | null) => {
    if (searchParams.get(key) === value) return;
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true, preventScrollReset: true });
    trackGoogleAnalyticsEventIfAllowed("filter_apply", { scope: "timelines", filter: key });
  };
  const resetFilters = () => {
    const next = new URLSearchParams(searchParams);
    for (const key of FILTER_KEYS) next.delete(key);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  };

  const emptyMessage = filters.mineOnly
    ? "조건에 맞는 내 공략이 없어요."
    : filters.likedOnly
      ? "조건에 맞는 좋아요한 공략이 없어요."
      : filters.autoOnly
        ? "조건에 맞는 오토 공략이 없어요."
        : "조건에 맞는 공략이 없어요.";

  return (
    <V2Page width="wide">
      <PageHeader
        title={PAGE_TITLE}
        trailing={
          signedIn ? (
            <Link to="/timelines/new" className={v2ButtonClassName({ variant: "primary" })}>
              <PlusIcon className="size-4" aria-hidden="true" />
              공략 작성
            </Link>
          ) : undefined
        }
        trailingInline
      />
      <PageAside>
        <PanelSheet
          panelId={FILTER_PANEL_ID}
          title="필터"
          Icon={FunnelIcon}
          headerAction={
            filterActive ? (
              <PanelAction variant="danger" onClick={resetFilters}>
                초기화
              </PanelAction>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <p id="timeline-filter-boss" className="text-xs font-semibold text-v2-fg-tertiary">
                보스
              </p>
              <WalkthroughBossSelect
                describedBy="timeline-filter-boss"
                value={filters.bossUid ?? ""}
                options={[{ uid: "", name: "전체" }, ...bosses]}
                onChange={(bossUid) => setFilter("bossUid", bossUid || null)}
              />
            </div>
            <ChoiceChips
              title="지형"
              options={WALKTHROUGH_TIMELINE_TERRAINS}
              value={filters.terrain}
              label={(terrain) => terrainLocale[terrain]}
              onChange={(terrain) => setFilter("terrain", terrain)}
            />
            <ChoiceChips
              title="방어 타입"
              options={WALKTHROUGH_TIMELINE_DEFENSE_TYPES}
              value={filters.defenseType}
              label={(defenseType) => defenseTypeShortLocale[defenseType]}
              onChange={(defenseType) => setFilter("defenseType", defenseType)}
            />
            <ChoiceChips
              title="난이도"
              options={WALKTHROUGH_TIMELINE_DIFFICULTIES}
              value={filters.maxDifficulty}
              label={(difficulty) => difficultyLocale[difficulty]}
              onChange={(difficulty) => setFilter("difficulty", difficulty)}
            />
            <div className="space-y-1">
              <Switch
                id="timeline-filter-auto"
                label="오토 공략만 보기"
                checked={filters.autoOnly}
                onCheckedChange={(checked) => setFilter("auto", checked ? "1" : null)}
              />
              {signedIn ? (
                <>
                  <Switch
                    id="timeline-filter-unrecruited"
                    label="미모집 학생 표시"
                    checked={showUnrecruitedStudents}
                    onCheckedChange={setShowUnrecruitedStudents}
                  />
                  <Switch
                    id="timeline-filter-mine"
                    label="내 공략만 보기"
                    checked={filters.mineOnly}
                    onCheckedChange={(checked) => setFilter("mine", checked ? "1" : null)}
                  />
                  <Switch
                    id="timeline-filter-liked"
                    label="좋아요한 공략만 보기"
                    checked={filters.likedOnly}
                    onCheckedChange={(checked) => setFilter("liked", checked ? "1" : null)}
                  />
                </>
              ) : null}
            </div>
          </div>
        </PanelSheet>
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
        panels={[{ panelId: FILTER_PANEL_ID, title: "필터", Icon: FunnelIcon }]}
        links={
          signedIn
            ? [
                {
                  key: "feedback",
                  title: FEEDBACK_TITLE,
                  Icon: ChatBubbleOvalLeftIcon,
                  onClick: () => setFeedbackOpen(true),
                },
              ]
            : []
        }
      />
      <PageMain>
        <div className="flex flex-col gap-4">
          {filters.mineOnly && earlierPartiesPath ? (
            <StatusNotice tone="neutral">
              이전 방식으로 등록한 편성과 공략은{" "}
              <Link to={earlierPartiesPath} className={cn("font-medium text-v2-link hover:underline", v2FocusRing)}>
                이전 편성·공략
              </Link>
              에서 볼 수 있어요.
            </StatusNotice>
          ) : null}
          {guides.length === 0 && filterActive ? (
            <p role="status" className="rounded-lg bg-v2-surface p-v2-block-p text-sm text-v2-fg-secondary">
              {emptyMessage}
            </p>
          ) : null}
          {demo || guides.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {demo ? (
                <WalkthroughListCard
                  guide={demo}
                  bossName={demoBossName}
                  author={null}
                  studentName={studentName}
                  isUnrecruited={() => false}
                  engagement={{ liked: false, likeCount: 0 }}
                  signedIn={signedIn}
                  canLike={false}
                  demo
                />
              ) : null}
              {guides.map(({ card, author, canLike }) => (
                <WalkthroughListCard
                  key={card.uid}
                  guide={card}
                  bossName={bossNameByUid.get(card.bossUid) ?? null}
                  author={author}
                  studentName={studentName}
                  isUnrecruited={isUnrecruited}
                  engagement={engagementByUid[card.uid] ?? { liked: false, likeCount: 0 }}
                  signedIn={signedIn}
                  canLike={canLike}
                />
              ))}
            </div>
          ) : null}
        </div>
      </PageMain>
      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        featureName={PAGE_TITLE}
        feedbackType="walkthrough_timeline_feedback"
      />
    </V2Page>
  );
}
