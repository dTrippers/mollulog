import { ArrowPathIcon, ChevronRightIcon, HeartIcon, PlusIcon } from "@heroicons/react/16/solid";
import { MoonIcon, StarIcon } from "@heroicons/react/24/outline";
import { type ComponentProps, type ReactNode, useEffect, useId, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useOutletContext, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { HaloModeIcon } from "~/components/media/HaloModeIcon";
import { SenseiAvatar } from "~/components/v2/features/comments/SenseiAvatar";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import StudentPortrait from "~/components/v2/features/students/StudentPortrait";
import { PageHeader } from "~/components/v2/layout/PageHeader";
import { PageMain } from "~/components/v2/layout/PageMain";
import {
  mobileNavigationSettingsAnchorId,
  useMobileNavigationSettingsArrival,
} from "~/components/v2/layout/navigation/mobile-navigation-tutorial";
import { NAVIGATION_DOT_LABELS, NavigationDotMark } from "~/components/v2/layout/navigation/NavigationDotMark";
import {
  getMoreNavigationSections,
  type MoreNavigationSection,
  type NavigationItem,
} from "~/components/v2/layout/navigation/navigation-menu";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { V2Page } from "~/components/v2/layout/V2Page";
import { Button, v2ButtonClassName } from "~/components/v2/primitives/Button";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { Sheet } from "~/components/v2/primitives/Sheet";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import { TooltipBubble, useHoldTooltip } from "~/components/v2/primitives/Tooltip";
import { useHaloMode } from "~/contexts/HaloModeContext";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  MOBILE_NAVIGATION_IDS,
  type MobileNavigationId,
  type MobileNavigationPair,
  normalizeMobileNavigationIds,
} from "~/domain/mobile-navigation";
import { trackGoogleAnalyticsEvent, trackGoogleAnalyticsEventIfAllowed } from "~/lib/google-analytics-events.client";
import { submitPreference } from "~/lib/preference-submission.client";
import { canonicalLink, socialMeta } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { resourceImageUrl } from "~/models/assets";
import type { RootOutletContext } from "~/root";
import { getMoreViewData, type MoreAccount, type MoreSummary } from "~/views/more";

type MoreMenuItem = NavigationItem;
type PinnableItem = NavigationItem & { mobileNavigationId: MobileNavigationId };

const PYROXENE_IMAGE_URL = resourceImageUrl("currency", "2");
const HALO_MODE_DESCRIPTION = "학생·이벤트 썸네일을 가려요";
const PIN_SHEET_ID = "more-bottom-tab-pins";

export const meta: MetaFunction = ({ location }) => {
  const title = "더보기 | 몰루로그";
  const description = "몰루로그의 메뉴, 프로필, 설정을 한곳에서 확인하세요.";
  return [
    { title },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
    canonicalLink(location.pathname),
  ];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  return getMoreViewData(env, ctx, sensei);
};

export default function MoreIndexPage() {
  const { account, summary } = useLoaderData<typeof loader>();
  const { darkMode, setDarkMode, mobileNavigationIds, setMobileNavigationIds, navigationBarContents, isAdmin } =
    useOutletContext<RootOutletContext>();
  const { haloMode, setHaloMode } = useHaloMode();

  const sections = orderMoreSections(
    getMoreNavigationSections({
      pathname: "/more",
      upcomingEvent: navigationBarContents.upcomingEvent,
      hasOngoingRaid: navigationBarContents.hasOngoingRaid,
      // The coupon account dot sits on the coupon tile of the account summary only.
      hasUnconsumedCoupons: false,
      hasRecentNews: navigationBarContents.hasRecentNews,
      hasUnreadFeedbackReplies: navigationBarContents.hasUnreadFeedbackReplies,
      menuBadgeOverrides: navigationBarContents.menuBadgeOverrides,
      isSignedIn: account !== null,
      isAdmin,
      currentUsername: account?.username ?? null,
    }),
  );
  const menuSections = sections.filter((section) => section.id !== "settings");
  const settingsItems = sections.find((section) => section.id === "settings")?.items ?? [];
  // When the summary fails, the coupon tile keeps the dot from the navigation's own coupon state.
  const hasUnconsumedCoupons = summary ? summary.availableCouponCount > 0 : navigationBarContents.hasUnconsumedCoupons;

  const toggleDarkMode = () => {
    const nextDarkMode = !darkMode;
    void submitPreference({ darkMode: nextDarkMode }).catch(() => undefined);
    setDarkMode(() => nextDarkMode);
  };
  const toggleHaloMode = () => {
    const nextHaloMode = !haloMode;
    void submitPreference({ haloMode: nextHaloMode }).catch(() => undefined);
    setHaloMode(nextHaloMode);
    trackGoogleAnalyticsEvent("halo_mode_toggled", { state: nextHaloMode ? "on" : "off", source: "more" });
  };

  return (
    <V2Page width="reading">
      <PageHeader
        title="더보기"
        readingWidth
        trailingInline
        trailing={
          <DisplayModeButtons
            darkMode={darkMode}
            onToggleDarkMode={toggleDarkMode}
            haloMode={haloMode}
            onToggleHaloMode={toggleHaloMode}
          />
        }
      />
      <PageMain>
        {/* From a 34rem body width the menus take three columns and show their labels, and the plan cards sit side by
            side. */}
        <div className="@container/more flex flex-col gap-6 pb-6">
          {account ? (
            <AccountSummary account={account} summary={summary} hasUnconsumedCoupons={hasUnconsumedCoupons} />
          ) : (
            <SignInPrompt />
          )}
          {account ? <MyPlans summary={summary} /> : null}
          <AllMenus sections={menuSections} />
          <BottomTabPins
            items={getPinnableItems(sections)}
            mobileNavigationIds={mobileNavigationIds}
            onApply={setMobileNavigationIds}
          />
          <Settings items={settingsItems} signedIn={account !== null} />
        </div>
      </PageMain>
    </V2Page>
  );
}

// This screen puts 플래너·계산기 first. The other groups keep the catalog order.
function orderMoreSections(sections: MoreNavigationSection[]): MoreNavigationSection[] {
  return [
    ...sections.filter((section) => section.id === "planner"),
    ...sections.filter((section) => section.id !== "planner"),
  ];
}

// The menus that can go on the bottom tabs, in the order of the bottom-tab choices.
function getPinnableItems(sections: MoreNavigationSection[]): PinnableItem[] {
  const order = new Map<MobileNavigationId, number>(MOBILE_NAVIGATION_IDS.map((id, index) => [id, index]));
  return sections
    .flatMap((section) => section.items)
    .filter((item): item is PinnableItem => Boolean(item.mobileNavigationId))
    .sort(
      (a, b) =>
        (order.get(a.mobileNavigationId) ?? Number.POSITIVE_INFINITY) -
        (order.get(b.mobileNavigationId) ?? Number.POSITIVE_INFINITY),
    );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mb-2.5 text-base font-semibold text-v2-fg">
      {children}
    </h2>
  );
}

const groupHeadingClassName = "mx-0.5 mb-1.5 text-[0.8125rem] font-semibold text-v2-fg-tertiary";

function BoldMoonIcon(props: ComponentProps<"svg">) {
  return <MoonIcon strokeWidth={2} {...props} />;
}

function BoldHaloModeIcon({ className }: { className?: string }) {
  return <HaloModeIcon strokeWidth={2} className={className} />;
}

function DisplayModeButtons({
  darkMode,
  onToggleDarkMode,
  haloMode,
  onToggleHaloMode,
}: {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  haloMode: boolean;
  onToggleHaloMode: () => void;
}) {
  const haloTooltip = useHoldTooltip<HTMLButtonElement>();
  const haloDescriptionId = useId();
  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        icon={BoldMoonIcon}
        iconSize="md"
        label="다크 모드"
        pressed={darkMode}
        className={darkMode ? undefined : "text-v2-fg-secondary"}
        onClick={onToggleDarkMode}
      />
      <IconButton
        {...haloTooltip.triggerProps}
        icon={BoldHaloModeIcon}
        iconSize="md"
        label="헤일로 모드"
        showTitle={false}
        pressed={haloMode}
        aria-describedby={haloDescriptionId}
        className={cn(haloTooltip.triggerClassName, !haloMode && "text-v2-fg-secondary")}
        onClick={onToggleHaloMode}
      />
      <span id={haloDescriptionId} className="sr-only">
        {HALO_MODE_DESCRIPTION}
      </span>
      <TooltipBubble open={haloTooltip.open} anchorRef={haloTooltip.triggerRef} prefer="below" hiddenFromAssistiveTech>
        <span className="block font-medium">헤일로 모드</span>
        <span className="block">{HALO_MODE_DESCRIPTION}</span>
      </TooltipBubble>
    </div>
  );
}

function SignInPrompt() {
  const { showSignIn } = useSignIn();
  return (
    <section className="flex items-center gap-3 rounded-lg bg-v2-surface p-3.5">
      <SenseiAvatar profileStudentId={null} size="post" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-v2-fg">로그인 후 이용해 보세요</p>
        <p className="mt-0.5 text-xs break-keep text-v2-fg-tertiary">
          청휘석, 학생 성장, 인연 랭크 등 다양한 데이터를 관리할 수 있어요
        </p>
      </div>
      <Button variant="primary" onClick={showSignIn}>
        로그인
      </Button>
    </section>
  );
}

function AccountSummary({
  account,
  summary,
  hasUnconsumedCoupons,
}: {
  account: MoreAccount;
  summary: MoreSummary | null;
  hasUnconsumedCoupons: boolean;
}) {
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== "idle";
  return (
    <section className="rounded-lg bg-v2-surface p-3.5">
      <div className="flex items-center gap-3">
        <SenseiAvatar profileStudentId={account.profileStudentId} size="account" />
        <p className="min-w-0 flex-1 truncate text-base font-semibold text-v2-fg">@{account.username}</p>
        <Link to={`/@${account.username}`} className={v2ButtonClassName({ variant: "secondary", size: "sm" })}>
          내 프로필
        </Link>
      </div>
      {summary ? null : (
        <StatusNotice
          tone="danger"
          boxed
          className="mt-3 items-center"
          action={
            <Button size="sm" onClick={() => revalidator.revalidate()} disabled={retrying}>
              <ArrowPathIcon
                className={cn("size-3.5", retrying && "animate-spin motion-reduce:animate-none")}
                aria-hidden="true"
              />
              다시 시도
            </Button>
          }
        >
          내 정보를 불러오지 못했어요.
        </StatusNotice>
      )}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <SummaryTile
          to={`/@${account.username}/students`}
          label="모집한 학생"
          value={summary ? <Count value={summary.recruitedStudentCount} unit="명" /> : null}
        />
        <SummaryTile
          to={`/@${account.username}/pickups`}
          label="모집 기록"
          value={summary ? <Count value={summary.pickupHistoryCount} unit="건" /> : null}
        />
        <SummaryTile
          to="/coupons"
          label="쿠폰"
          dot={hasUnconsumedCoupons}
          value={summary ? <Count value={summary.availableCouponCount} unit="개 사용 가능" /> : null}
        />
      </div>
    </section>
  );
}

function Count({ value, unit }: { value: number; unit: string }) {
  return (
    <>
      <span className="tabular-nums">{value.toLocaleString()}</span>
      <span className="ml-px text-[0.8125rem] font-medium text-v2-fg-secondary">{unit}</span>
    </>
  );
}

function SummaryTile({
  to,
  label,
  value,
  dot = false,
}: {
  to: string;
  label: string;
  // Null when the summary failed to load: the tile stays a link with an empty value, never a zero.
  value: ReactNode | null;
  dot?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex min-w-0 flex-col justify-between rounded-md bg-v2-inset px-2.5 pt-2 pb-2.5 hover:bg-v2-filled-hover v2-interaction-transition",
        v2FocusRing,
      )}
    >
      <span className="flex min-w-0 items-center gap-1 text-xs text-v2-fg-tertiary">
        <span className="truncate">{label}</span>
        {dot ? <NavigationDotMark dot="account" className="shrink-0" /> : null}
        {dot ? <span className="sr-only">, {NAVIGATION_DOT_LABELS.account}</span> : null}
      </span>
      <span className="mt-0.5 min-h-7 text-lg font-semibold text-v2-fg">{value}</span>
    </Link>
  );
}

function MyPlans({ summary }: { summary: MoreSummary | null }) {
  return (
    <section aria-labelledby="more-my-plans">
      <SectionHeading id="more-my-plans">내 계획</SectionHeading>
      <div className="grid gap-2 @min-[34rem]/more:grid-cols-2">
        <PyroxenePlanCard summary={summary} />
        <RelationshipPlanCard summary={summary} />
      </div>
    </section>
  );
}

const planCardClassName =
  "flex min-w-0 flex-col gap-2.5 rounded-lg bg-v2-surface px-3.5 py-3 hover:bg-v2-inset v2-interaction-transition";

// The title, an optional badge after it, and an optional meta text before the chevron at the right edge.
function PlanCardHeader({ title, badge, meta }: { title: string; badge?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-sm font-semibold text-v2-fg">{title}</span>
      {badge}
      <span className="min-w-0 flex-1 truncate text-right text-xs text-v2-fg-tertiary">{meta}</span>
      <ChevronRightIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
    </div>
  );
}

function PyroxenePlanCard({ summary }: { summary: MoreSummary | null }) {
  const pyroxene = summary?.pyroxene ?? null;
  const nextStudents = pyroxene?.nextStudents ?? [];
  const scheduleLabel = pyroxene?.nextTimelineLabel ?? null;

  return (
    <Link to="/utils/pyroxene" className={cn(planCardClassName, v2FocusRing)}>
      <PlanCardHeader title="다가오는 모집" badge={scheduleLabel ? <ScheduleLabel label={scheduleLabel} /> : null} />
      {!summary ? null : !pyroxene ? (
        <PlanStatus
          primary="현재 보유 재화를 입력해 주세요"
          secondary="관심 학생 모집 시점의 예상 청휘석을 계산할 수 있어요"
        />
      ) : nextStudents.length === 0 ? (
        <PlanStatus primary="관심 학생 모집 일정이 없어요" secondary={getHoldingsLine(pyroxene)} />
      ) : (
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex shrink-0 gap-1.5">
            {nextStudents.map((student) => (
              <MiniPortrait key={student.uid} uid={student.uid} name={student.name} />
            ))}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-v2-fg-tertiary">예상 청휘석</p>
            {pyroxene.expectedPyroxene === null ? (
              <p className="mt-0.5 text-sm text-v2-fg">계산할 수 없어요</p>
            ) : (
              <p className="mt-0.5 flex flex-wrap items-center text-[0.9375rem] font-semibold text-v2-fg">
                <img src={PYROXENE_IMAGE_URL} alt="" className="-my-0.5 mr-1 size-5.5 object-contain" loading="lazy" />
                <span className="tabular-nums">{pyroxene.expectedPyroxene.toLocaleString()}</span>
                <PlanUnit>개</PlanUnit>
                <span className="mx-1.5 font-medium text-v2-fg-tertiary">+</span>
                <PlanUnit>티켓&nbsp;</PlanUnit>
                <span className="tabular-nums">{(pyroxene.expectedTicketTrialCount ?? 0).toLocaleString()}</span>
                <PlanUnit>회</PlanUnit>
              </p>
            )}
          </div>
        </div>
      )}
    </Link>
  );
}

function PlanUnit({ children }: { children: ReactNode }) {
  return <span className="text-[0.84375rem] font-medium text-v2-fg-secondary">{children}</span>;
}

function getHoldingsLine(pyroxene: NonNullable<MoreSummary["pyroxene"]>): string {
  const ticketCount = pyroxene.oneTimeTicket + pyroxene.tenTimeTicket * 10;
  const items = [`현재 보유 ${pyroxene.pyroxene.toLocaleString()}개`];
  if (pyroxene.favoritedRecruitmentCount > 0) {
    items.push(`관심 모집 ${pyroxene.favoritedRecruitmentCount.toLocaleString()}건`);
  } else if (ticketCount > 0) {
    items.push(`티켓 ${ticketCount.toLocaleString()}회`);
  }
  return items.join(" / ");
}

function ScheduleLabel({ label }: { label: string }) {
  if (label === "진행중") {
    return <LiveLabel />;
  }
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-v2-inset px-2 text-xs font-medium text-v2-fg-secondary tabular-nums">
      {label}
    </span>
  );
}

function LiveLabel({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-v2-live", className)}>
      <span className="size-1.5 shrink-0 rounded-full bg-v2-live" aria-hidden="true" />
      진행중
    </span>
  );
}

function PlanStatus({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm break-keep text-v2-fg">{primary}</p>
      <p className="mt-0.5 text-xs break-keep text-v2-fg-tertiary">{secondary}</p>
    </div>
  );
}

// A planned student is one the user registered, so the image goes without a caption. Its name is the alt text.
function getStudentImageLabel(name: string): string {
  const { name: mainName, variant } = splitVisibleStudentName(name);
  return variant ? `${mainName}(${variant})` : mainName;
}

function MiniPortrait({ uid, name }: { uid: string; name: string | null }) {
  return (
    <StudentPortrait
      uid={uid}
      alt={name ? getStudentImageLabel(name) : ""}
      className="h-9 w-7.5 shrink-0 rounded object-cover"
    />
  );
}

function RelationshipPlanCard({ summary }: { summary: MoreSummary | null }) {
  const relationship = summary?.relationship ?? null;
  const targetStudents = relationship?.targetStudents ?? [];

  return (
    <div className={cn("relative", planCardClassName)}>
      <Link
        to="/utils/relationship"
        aria-label="인연 랭크 계산기 열기"
        className={cn("absolute inset-0 rounded-lg", v2FocusRing)}
      />
      <div className="pointer-events-none relative">
        <PlanCardHeader
          title="인연 랭크 계산기"
          meta={
            relationship && relationship.targetStudentCount > 0
              ? `${relationship.targetStudentCount.toLocaleString()}명의 학생 관리 중`
              : null
          }
        />
      </div>
      {!relationship ? null : targetStudents.length > 0 ? (
        <div className="pointer-events-none relative flex flex-wrap gap-x-4 gap-y-2">
          {targetStudents.map((student) => {
            const imageLabel = student.name ? getStudentImageLabel(student.name) : null;
            const levelLabel = student.currentLevel == null ? null : `현재 인연 랭크 ${student.currentLevel}`;
            return (
              <Link
                key={student.uid}
                to={`/utils/relationship?studentUid=${encodeURIComponent(student.uid)}`}
                aria-label={[imageLabel, levelLabel].filter(Boolean).join(", ") || undefined}
                className={cn("pointer-events-auto flex items-center gap-1.5 rounded", v2FocusRing)}
              >
                <MiniPortrait uid={student.uid} name={student.name} />
                {student.currentLevel == null ? null : (
                  <span className="flex items-center gap-0.5 text-[0.8125rem] font-semibold text-v2-fg tabular-nums">
                    <HeartIcon className="size-3.5 text-v2-relationship" aria-hidden="true" />
                    {student.currentLevel}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="pointer-events-none relative flex items-center gap-2 text-xs font-medium text-v2-fg-tertiary">
          <span className="flex size-6 items-center justify-center rounded-full bg-v2-inset">
            <PlusIcon className="size-4" aria-hidden="true" />
          </span>
          {relationship.savedCount > 0 ? "목표 없음" : "추가"}
        </div>
      )}
    </div>
  );
}

function AllMenus({ sections }: { sections: MoreNavigationSection[] }) {
  return (
    <section aria-labelledby="more-all-menus">
      <SectionHeading id="more-all-menus">모든 메뉴</SectionHeading>
      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <div key={section.id}>
            <h3 className={groupHeadingClassName}>{section.name}</h3>
            <div className="grid grid-cols-2 gap-0.5 rounded-lg bg-v2-surface p-1 @min-[34rem]/more:grid-cols-3">
              {section.items.map((item) => (
                <MenuCell key={item.menuId ?? item.to} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Every cell is one 36px line, whatever its label, dot, or name length. A long name truncates, and the full name stays
// in the title and the accessible name.
function MenuCell({ item }: { item: MoreMenuItem }) {
  const Icon = item.OutlineIcon;
  const content = (
    <>
      <Icon className="size-5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 items-center whitespace-nowrap">
        <span className="min-w-0 truncate">{item.name}</span>
        {item.badgeLabel ? <MenuLabel label={item.badgeLabel} /> : null}
        {item.dot ? <NavigationDotMark dot={item.dot} className="ml-1 shrink-0" /> : null}
      </span>
    </>
  );
  const className = "flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-sm";

  // A disabled menu is not a link, as in the other v2 navigation. Its label is hidden in two columns, so a screen
  // reader gets it from a copy that is there only while the label is hidden.
  if (item.disabled || !item.to) {
    return (
      <div aria-disabled="true" title={item.name} className={cn(className, "text-v2-fg-disabled")}>
        {content}
        {item.badgeLabel ? (
          <span className="sr-only @min-[34rem]/more:hidden">, {item.badgeLabel}</span>
        ) : null}
      </div>
    );
  }

  return (
    <Link
      to={item.to}
      title={item.name}
      aria-label={getMoreMenuItemAriaLabel(item)}
      className={cn(
        className,
        "text-v2-fg hover:bg-v2-hover active:bg-v2-filled-hover v2-interaction-transition",
        v2FocusRing,
      )}
      onClick={() => {
        if (item.menuId) trackGoogleAnalyticsEventIfAllowed("nav_menu_click", { menu_id: item.menuId });
      }}
    >
      {content}
    </Link>
  );
}

// Two columns hide the label, so a label never makes a cell taller. Three columns show it after the name, and it
// truncates before the name does.
function MenuLabel({ label }: { label: string }) {
  const placement = "ml-1.5 min-w-0 shrink-[1000] hidden @min-[34rem]/more:inline-flex";
  if (label === "진행중") {
    return <LiveLabel className={placement} />;
  }
  return <span className={cn(placement, "truncate text-xs text-v2-fg-secondary")}>{label}</span>;
}

function getMoreMenuItemAriaLabel(item: MoreMenuItem): string {
  const label = item.badgeLabel ? `${item.name}, ${item.badgeLabel}` : item.name;
  if (!item.dot) return label;
  if (item.dot === "attention" && item.to === "/news") return `${label}, 새 소식 있음`;
  if (item.dot === "account" && item.to === "/contact") return `${label}, 읽지 않은 답변 있음`;
  return `${label}, ${NAVIGATION_DOT_LABELS[item.dot]}`;
}

function BottomTabPins({
  items,
  mobileNavigationIds,
  onApply,
}: {
  items: PinnableItem[];
  mobileNavigationIds: MobileNavigationPair;
  onApply: (ids: MobileNavigationPair) => void;
}) {
  const arrival = useMobileNavigationSettingsArrival();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingItem, setPendingItem] = useState<PinnableItem | null>(null);
  const [savingSlot, setSavingSlot] = useState<0 | 1 | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const itemsById = new Map(items.map((item) => [item.mobileNavigationId, item]));
  const pinnedItems = mobileNavigationIds.flatMap((id) => {
    const item = itemsById.get(id);
    return item ? [item] : [];
  });
  const isSaving = savingSlot !== null;

  // The slot step replaces the menu list in the same sheet, so focus moves to its title.
  useEffect(() => {
    if (!pendingItem) return;
    document.querySelector<HTMLElement>(`[data-panel-title="${PIN_SHEET_ID}"]`)?.focus();
  }, [pendingItem]);

  const openSheet = () => {
    setPendingItem(null);
    setSaveFailed(false);
    setSheetOpen(true);
  };

  const replaceTab = async (slot: 0 | 1) => {
    if (!pendingItem || mobileNavigationIds.includes(pendingItem.mobileNavigationId)) {
      return;
    }
    const nextIds: MobileNavigationPair = [...normalizeMobileNavigationIds(mobileNavigationIds)];
    nextIds[slot] = pendingItem.mobileNavigationId;
    setSavingSlot(slot);
    setSaveFailed(false);
    try {
      const response = await submitPreference({ mobileNavigationIds: nextIds });
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || (result as { ok?: unknown }).ok !== true) {
        throw new Error("preference response was not successful");
      }
      onApply(nextIds);
      setSheetOpen(false);
    } catch {
      setSaveFailed(true);
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <section
      id={mobileNavigationSettingsAnchorId}
      aria-labelledby="more-bottom-tab-pins-title"
      className="relative scroll-mt-[var(--mobile-header-height)]"
    >
      <SectionHeading id="more-bottom-tab-pins-title">하단 탭 고정</SectionHeading>
      <p className="-mt-1 mb-2.5 text-[0.8125rem] break-keep text-v2-fg-tertiary">즐겨찾는 메뉴를 하단 탭에 고정할 수 있어요</p>
      <div className="flex items-center gap-3.5 rounded-lg bg-v2-surface py-2 pr-2 pl-3.5">
        <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3.5 gap-y-1">
          {pinnedItems.map((item) => {
            const Icon = item.OutlineIcon;
            return (
              <li key={item.mobileNavigationId} className="flex min-w-0 items-center gap-1.5 text-sm text-v2-fg">
                <Icon className="size-5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                <span className="truncate">{item.mobileLabel ?? item.name}</span>
              </li>
            );
          })}
        </ul>
        <Button aria-haspopup="dialog" onClick={openSheet}>
          바꾸기
        </Button>
      </div>
      {arrival > 0 ? (
        <span
          key={arrival}
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1.5 rounded-[0.625rem] bg-v2-highlight opacity-0 v2-panel-highlight"
        />
      ) : null}
      <Sheet
        open={sheetOpen}
        Icon={StarIcon}
        title={pendingItem ? `${pendingItem.name} 고정` : "하단 탭 고정"}
        description={pendingItem ? "하단 탭에서 교체할 메뉴를 선택해 주세요" : undefined}
        panelId={PIN_SHEET_ID}
        onClose={() => {
          if (!isSaving) setSheetOpen(false);
        }}
      >
        {pendingItem ? (
          <div className="flex flex-col gap-2">
            {([0, 1] as const).map((slot) => {
              const currentItem = itemsById.get(mobileNavigationIds[slot]);
              const CurrentIcon = currentItem?.OutlineIcon;
              return (
                <button
                  type="button"
                  key={slot}
                  disabled={isSaving}
                  onClick={() => replaceTab(slot)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg bg-v2-inset px-3 py-2.5 text-left enabled:hover:bg-v2-filled-hover disabled:cursor-wait v2-interaction-transition",
                    v2FocusRing,
                  )}
                >
                  {CurrentIcon ? (
                    <CurrentIcon className="size-5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-v2-fg-tertiary">{slot === 0 ? "3번째 탭" : "4번째 탭"}</span>
                    {currentItem ? (
                      <span className="mt-px block truncate text-sm font-semibold text-v2-fg">
                        {currentItem.mobileLabel ?? currentItem.name}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md bg-v2-surface px-3 text-sm font-medium",
                      isSaving ? "text-v2-fg-disabled" : "text-v2-fg",
                    )}
                  >
                    {savingSlot === slot ? (
                      <ArrowPathIcon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    ) : null}
                    이 탭과 교체
                  </span>
                </button>
              );
            })}
            {saveFailed ? <StatusNotice tone="danger">저장하지 못했어요.</StatusNotice> : null}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-0.5">
            {items.map((item) => {
              const slot = mobileNavigationIds.indexOf(item.mobileNavigationId);
              const Icon = item.OutlineIcon;
              return (
                <button
                  type="button"
                  key={item.mobileNavigationId}
                  disabled={slot >= 0}
                  aria-label={slot >= 0 ? `${item.name}, 현재 ${slot + 3}번째 하단 탭에 고정됨` : undefined}
                  onClick={() => {
                    setSaveFailed(false);
                    setPendingItem(item);
                  }}
                  className={cn(
                    "flex h-13 min-w-0 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-v2-fg enabled:hover:bg-v2-hover enabled:active:bg-v2-filled-hover disabled:cursor-default disabled:text-v2-fg-tertiary v2-interaction-transition",
                    v2FocusRing,
                  )}
                >
                  <Icon className="size-5 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate">{item.name}</span>
                    {slot >= 0 ? <span className="block text-xs">{slot + 3}번째 탭</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </section>
  );
}

function Settings({ items, signedIn }: { items: MoreMenuItem[]; signedIn: boolean }) {
  return (
    <section aria-labelledby="more-settings">
      <h2 id="more-settings" className={groupHeadingClassName}>
        설정
      </h2>
      <div className="grid gap-0.5 rounded-lg bg-v2-surface p-1 @min-[34rem]/more:grid-cols-3">
        {items.map((item) => (
          <MenuCell key={item.menuId ?? item.to} item={item} />
        ))}
      </div>
      {signedIn ? (
        <Link to="/signout" className={v2ButtonClassName({ variant: "danger-text", size: "sm", className: "mt-1.5" })}>
          로그아웃
        </Link>
      ) : null}
    </section>
  );
}
