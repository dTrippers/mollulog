import { ChevronRightIcon, HeartIcon } from "@heroicons/react/16/solid";
import { PlusIcon, StarIcon as StarIconOutline, UserCircleIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getMoreNavigationSections, type NavigationItem } from "~/components/features/layout/navigation-menu";
import { BottomSheet, ProfileImage, SubTitle } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import {
  type MobileNavigationId,
  type MobileNavigationPair,
  normalizeMobileNavigationIds,
} from "~/domain/mobile-navigation";
import { canonicalLink } from "~/lib/seo";
import { cn } from "~/lib/utils";
import type { RootOutletContext } from "~/root";
import { getMoreViewData, type MoreCurrentUser } from "~/views/more";

type MoreActionItem = {
  key: string;
  name: string;
  OutlineIcon: NavigationItem["OutlineIcon"];
  to?: string;
  disabled?: boolean;
  badgeLabel?: string;
  showRedDot?: boolean;
  mobileNavigationId?: MobileNavigationId;
  mobileLabel?: string;
};

const moreDataSurfaceClassName = "bg-card";

export const meta: MetaFunction = ({ location }) => {
  const title = "더보기 | 몰루로그";
  const description = "몰루로그의 메뉴, 프로필, 설정을 한곳에서 확인하세요.";
  return [
    { title },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request);
  return getMoreViewData(env, ctx, sensei);
};

export default function MoreIndexPage() {
  const { currentUser, upcomingEvent, hasOngoingRaid, hasUnconsumedCoupons, hasRecentNews, hasUnreadFeedbackReplies } =
    useLoaderData<typeof loader>();
  const { mobileNavigationIds, setMobileNavigationIds } = useOutletContext<RootOutletContext>();
  const { showSignIn } = useSignIn();

  const navigationOptions = {
    pathname: "/more",
    upcomingEvent,
    hasOngoingRaid,
    hasUnconsumedCoupons,
    hasRecentNews,
    hasUnreadFeedbackReplies,
    isSignedIn: currentUser !== null,
  };
  const menuSections = getMoreNavigationSections(navigationOptions).map((section) => ({
    name: section.name,
    items: section.items.map(toMoreActionItem),
  }));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-4 pb-6 lg:pt-2">
      <h1 className="sr-only">더보기</h1>
      <MoreProfileBlock
        currentUser={currentUser}
        onShowSignIn={showSignIn}
        hasUnconsumedCoupons={hasUnconsumedCoupons}
      />
      {currentUser ? <MorePersonalPlannerSection currentUser={currentUser} /> : null}
      {menuSections.length > 0 && (
        <MoreMenuSections
          sections={menuSections}
          mobileNavigationIds={mobileNavigationIds}
          onApply={setMobileNavigationIds}
        />
      )}
    </div>
  );
}

function toMoreActionItem(item: NavigationItem): MoreActionItem {
  return {
    key: item.to,
    to: item.to,
    name: item.name,
    OutlineIcon: item.OutlineIcon,
    disabled: item.disabled,
    badgeLabel: item.badgeLabel,
    showRedDot: item.showRedDot,
    mobileNavigationId: item.mobileNavigationId,
    mobileLabel: item.mobileLabel,
  };
}

function MoreProfileBlock({
  currentUser,
  onShowSignIn,
  hasUnconsumedCoupons,
}: {
  currentUser: MoreCurrentUser | null;
  onShowSignIn: () => void;
  hasUnconsumedCoupons: boolean;
}) {
  if (!currentUser) {
    return (
      <section className="overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            <UserCircleIcon className="size-7" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">로그인 후 이용해보세요</p>
            <p className="mt-0.5 text-xs leading-snug text-neutral-500 dark:text-neutral-400">
              청휘석, 학생 성장, 인연 랭크 등 다양한 데이터를 관리할 수 있어요
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={onShowSignIn}
          >
            로그인
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900/50">
      <div className="flex items-center gap-4 px-4 py-3">
        <Link to={`/@${currentUser.username}`} className="shrink-0 rounded-full">
          <ProfileImage studentUid={currentUser.profileStudentId} imageSize={12} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/@${currentUser.username}`} className="group inline-flex max-w-full flex-col">
            <span className="flex min-w-0 items-center gap-1 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              <span className="truncate">{currentUser.username}</span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
        </div>
      </div>

      <div className="space-y-0.5 pb-1">
        <ProfileSummaryLink
          to={`/@${currentUser.username}/students`}
          label="모집한 학생"
          value={`${currentUser.recruitedStudentCount.toLocaleString()}명`}
        />
        <ProfileSummaryLink
          to={`/@${currentUser.username}/pickups`}
          label="모집 이력"
          value={`${currentUser.pickupHistoryCount.toLocaleString()}건`}
        />
        <ProfileSummaryLink
          to="/coupons"
          label="사용 가능한 쿠폰"
          value={`${currentUser.availableCouponCount.toLocaleString()}건`}
          showRedDot={hasUnconsumedCoupons}
        />
      </div>
    </section>
  );
}

function MorePersonalPlannerSection({ currentUser }: { currentUser: MoreCurrentUser }) {
  return (
    <section>
      <SubTitle text="나의 데이터" />
      <div className={cn("divide-y divide-border overflow-hidden rounded-lg", moreDataSurfaceClassName)}>
        <PyroxenePlannerRow pyroxene={currentUser.pyroxene} />
        <RelationshipPlannerRow relationship={currentUser.relationship} isSignedIn />
      </div>
    </section>
  );
}

function PyroxenePlannerRow({ pyroxene }: { pyroxene: MoreCurrentUser["pyroxene"] }) {
  const status = getPyroxeneStatus(pyroxene);
  const nextStudents = pyroxene?.nextStudents ?? [];
  const hasNextStudents = nextStudents.length > 0;

  return (
    <Link
      to="/utils/pyroxene"
      className={cn(
        `group flex items-center gap-2 py-3 pl-4 pr-2 transition-colors
        hover:bg-neutral-200 dark:hover:bg-neutral-700
        focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset`,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">다가오는 모집</p>
          {status.scheduleLabel && (
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-medium leading-none text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {status.scheduleLabel}
            </span>
          )}
        </div>
        {hasNextStudents ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {nextStudents.map((student) => (
              <span key={`${student.uid}-${student.name}`} title={student.name} className="rounded-full">
                <ProfileImage studentUid={student.uid} imageSize={6} />
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-sm leading-snug text-neutral-700 dark:text-neutral-200">{status.primary}</p>
        )}
        <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          {status.expectedPyroxene !== null ? (
            <>
              예상 청휘석{" "}
              <span className="font-semibold text-blue-600 dark:text-blue-300">
                {status.expectedPyroxene.toLocaleString()}
              </span>
              개 + 티켓{" "}
              <span className="font-semibold text-blue-600 dark:text-blue-300">
                {(status.expectedTicketTrialCount ?? 0).toLocaleString()}
              </span>
              회
            </>
          ) : (
            status.secondary
          )}
        </p>
      </div>
      <ChevronRightIcon
        className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function ProfileSummaryLink({
  to,
  label,
  value,
  showRedDot = false,
}: {
  to: string;
  label: string;
  value: string;
  showRedDot?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-700"
    >
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800 dark:text-neutral-100">
        {label}
      </span>
      {showRedDot && <span className="size-1.5 shrink-0 rounded-full bg-red-500" />}
      <span className="shrink-0 text-sm font-semibold text-neutral-900 dark:text-neutral-100">{value}</span>
      <ChevronRightIcon
        className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function RelationshipPlannerRow({
  relationship,
  isSignedIn,
}: {
  relationship: MoreCurrentUser["relationship"] | null;
  isSignedIn: boolean;
}) {
  const targetStudents = relationship?.targetStudents ?? [];

  return (
    <div
      className={cn(
        `group relative flex items-center gap-2 py-3 pl-4 pr-2 transition-colors
        hover:bg-neutral-200 dark:hover:bg-neutral-700
        focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset`,
      )}
    >
      <Link
        to="/utils/relationship"
        aria-label="인연 랭크 계산기 열기"
        className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset"
      />
      <div className="pointer-events-none relative z-10 min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">인연 랭크 계산기</p>
        {targetStudents.length > 0 ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {targetStudents.map((student) => (
                <Link
                  to={`/utils/relationship?studentUid=${encodeURIComponent(student.uid)}`}
                  key={student.uid}
                  className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-card pr-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  title={`현재 인연 랭크 ${student.currentLevel}`}
                >
                  <ProfileImage studentUid={student.uid} imageSize={6} />
                  <span className="inline-flex items-center gap-1">
                    <HeartIcon className="size-4 text-rose-500" />
                    {student.currentLevel}
                  </span>
                </Link>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              {relationship?.targetStudentCount.toLocaleString()}명의 학생 관리중
            </p>
          </>
        ) : isSignedIn ? (
          <div className="mt-2 flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
            <span className="flex size-6 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700">
              <PlusIcon className="size-4" strokeWidth={2} />
            </span>
            <span className="text-xs font-medium">
              {relationship && relationship.savedCount > 0 ? "목표 없음" : "추가"}
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">로그인 후 저장 가능</p>
        )}
      </div>
      <ChevronRightIcon
        className="pointer-events-none relative z-10 size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </div>
  );
}

function MoreMenuSections({
  sections,
  mobileNavigationIds,
  onApply,
}: {
  sections: { name: string; items: MoreActionItem[] }[];
  mobileNavigationIds: MobileNavigationPair;
  onApply: (ids: MobileNavigationPair) => void;
}) {
  const [pendingItem, setPendingItem] = useState<MoreActionItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const itemsByMobileNavigationId = new Map<MobileNavigationId, MoreActionItem>(
    sections
      .flatMap((section) => section.items)
      .flatMap((item): [MobileNavigationId, MoreActionItem][] =>
        item.mobileNavigationId ? [[item.mobileNavigationId, item]] : [],
      ),
  );

  const openReplacementSheet = (item: MoreActionItem) => {
    setSaveError(null);
    setPendingItem(item);
  };

  const replaceTab = async (slot: 0 | 1) => {
    if (!pendingItem?.mobileNavigationId || mobileNavigationIds.includes(pendingItem.mobileNavigationId)) {
      return;
    }

    const nextIds: MobileNavigationPair = [...normalizeMobileNavigationIds(mobileNavigationIds)];
    nextIds[slot] = pendingItem.mobileNavigationId;
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/preference", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNavigationIds: nextIds }),
      });
      if (!response.ok) {
        throw new Error(`preference status=${response.status}`);
      }

      onApply(nextIds);
      setPendingItem(null);
    } catch {
      setSaveError("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section id="mobile-navigation-settings" className="scroll-mt-[var(--mobile-header-height)]">
        <SubTitle text="모든 메뉴" description="즐겨찾는 메뉴를 하단 탭에 고정할 수 있어요" />
        <div className="mt-1 space-y-5">
          {sections.map((section) => (
            <div key={section.name} className="space-y-2">
              <h3 className="px-1 text-sm font-semibold text-foreground/75">{section.name}</h3>
              <div className="rounded-lg bg-neutral-100/80 p-1.5 dark:bg-neutral-900/45">
                {section.items.map((item) => (
                  <MoreMenuItem
                    key={item.key}
                    item={item}
                    selectedSlot={item.mobileNavigationId ? mobileNavigationIds.indexOf(item.mobileNavigationId) : -1}
                    onPin={openReplacementSheet}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {pendingItem ? (
        <BottomSheet
          Icon={StarIconOutline}
          title={`${pendingItem.name} 고정`}
          description="하단 탭에서 교체할 메뉴를 선택해주세요"
          onClose={() => {
            if (!isSaving) {
              setPendingItem(null);
            }
          }}
        >
          <div className="flex flex-col gap-3">
            {([0, 1] as const).map((slot) => {
              const currentItem = itemsByMobileNavigationId.get(mobileNavigationIds[slot]);
              const CurrentIcon = currentItem?.OutlineIcon;
              return (
                <button
                  type="button"
                  key={slot}
                  className="group flex min-h-14 cursor-pointer items-center gap-3 rounded-lg bg-neutral-100 px-4 py-3 text-left transition-colors hover:bg-neutral-200 active:bg-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-wait dark:bg-neutral-700 dark:hover:bg-neutral-600 dark:active:bg-neutral-500"
                  onClick={() => replaceTab(slot)}
                  disabled={isSaving}
                >
                  {CurrentIcon ? (
                    <CurrentIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-muted-foreground">
                      {slot === 0 ? "3번째 탭" : "4번째 탭"}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-semibold text-foreground">
                      {currentItem?.mobileLabel ?? currentItem?.name ?? "사용할 수 없는 메뉴"}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white transition-transform group-hover:translate-x-0.5 dark:bg-neutral-100 dark:text-neutral-900">
                    이 탭과 교체
                  </span>
                </button>
              );
            })}
            {saveError ? (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}

function MoreMenuItem({
  item,
  selectedSlot,
  onPin,
}: {
  item: MoreActionItem;
  selectedSlot: number;
  onPin: (item: MoreActionItem) => void;
}) {
  const Icon = item.OutlineIcon;
  const className = cn(
    "group relative flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-2 text-base font-normal text-foreground/85 transition-colors",
    item.disabled
      ? "cursor-default opacity-40"
      : "hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-700",
  );
  const content = (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center">
        <Icon className="size-5 text-foreground/60" aria-hidden="true" />
      </span>
      <span className="min-w-0 break-keep">
        <span className="relative inline-block">
          {item.name}
          {item.badgeLabel ? (
            <span className="ml-1 inline-block origin-left scale-90 align-super text-xs font-normal leading-none text-muted-foreground/70">
              {item.badgeLabel}
            </span>
          ) : null}
          {item.showRedDot ? (
            <span
              className="absolute top-0 -right-3 size-1.5 animate-pulse rounded-full bg-red-500"
              aria-hidden="true"
            />
          ) : null}
        </span>
      </span>
    </>
  );

  if (item.disabled || !item.to) {
    return (
      <div className={className} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <div className={className}>
      <Link
        to={item.to}
        className="absolute inset-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label={item.name}
      />
      <div
        className="pointer-events-none relative z-[1] flex min-w-0 flex-1 items-center gap-3 pr-11"
        aria-hidden="true"
      >
        {content}
      </div>
      {item.mobileNavigationId ? (
        selectedSlot >= 0 ? (
          <span
            className="pointer-events-none absolute inset-y-0 right-0 z-10 inline-flex w-11 items-center justify-center text-yellow-600 dark:text-yellow-400"
            role="img"
            aria-label={`${item.name}, 현재 ${selectedSlot + 3}번째 하단 탭에 고정됨`}
            title={`${selectedSlot + 3}번째 하단 탭에 고정됨`}
          >
            <StarIconSolid className="size-5" aria-hidden="true" />
          </span>
        ) : (
          <button
            type="button"
            className="absolute inset-y-0 right-0 z-10 inline-flex w-11 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-neutral-300 hover:text-yellow-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:hover:bg-neutral-600 dark:hover:text-yellow-400"
            onClick={() => onPin(item)}
            aria-label={`하단 탭에 고정: ${item.name}`}
            aria-haspopup="dialog"
            title="하단 탭에 고정"
          >
            <StarIconOutline className="size-5" aria-hidden="true" />
          </button>
        )
      ) : null}
    </div>
  );
}

function getPyroxeneStatus(pyroxene: MoreCurrentUser["pyroxene"]) {
  if (!pyroxene) {
    return {
      primary: "현재 보유 재화를 입력해주세요",
      secondary: "관심 학생 모집 시점의 예상 청휘석을 계산할 수 있어요",
      scheduleLabel: null,
      expectedPyroxene: null,
      expectedTicketTrialCount: null,
    };
  }

  const ticketCount = pyroxene.oneTimeTicket + pyroxene.tenTimeTicket * 10;
  const primary = pyroxene.nextStudents.length > 0 ? "관심 학생 모집 일정" : "관심 학생 모집 일정이 없어요";
  const secondaryItems = [`현재 보유 ${pyroxene.pyroxene.toLocaleString()}개`];
  if (pyroxene.favoritedRecruitmentCount > 0) {
    secondaryItems.push(`관심 모집 ${pyroxene.favoritedRecruitmentCount.toLocaleString()}건`);
  } else if (ticketCount > 0) {
    secondaryItems.push(`티켓 ${ticketCount.toLocaleString()}회`);
  }

  return {
    primary,
    secondary: secondaryItems.join(" / "),
    scheduleLabel: pyroxene.nextTimelineLabel,
    expectedPyroxene: pyroxene.expectedPyroxene,
    expectedTicketTrialCount: pyroxene.expectedTicketTrialCount,
  };
}
