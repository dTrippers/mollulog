import { CheckIcon, ChevronRightIcon, HeartIcon } from "@heroicons/react/16/solid";
import { CameraIcon, Cog6ToothIcon, PlusIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import {
  getMobileNavigationOptions,
  getMoreNavigationSections,
  type NavigationItem,
} from "~/components/features/layout/navigation-menu";
import { BottomSheet, Button, ProfileImage, SubTitle, Title } from "~/components/primitives";
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
  to?: string;
  disabled?: boolean;
};

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
  const { currentUser, upcomingEvent, hasOngoingRaid, hasUnconsumedCoupons } = useLoaderData<typeof loader>();
  const { mobileNavigationIds, setMobileNavigationIds } = useOutletContext<RootOutletContext>();
  const { showSignIn } = useSignIn();

  const navigationOptions = {
    pathname: "/more",
    upcomingEvent,
    hasOngoingRaid,
    hasUnconsumedCoupons,
    isSignedIn: currentUser !== null,
  };
  const menuSections = getMoreNavigationSections(navigationOptions).map((section) => ({
    name: section.name,
    items: section.items.map(toMoreActionItem),
  }));
  const mobileOptions = getMobileNavigationOptions(navigationOptions);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-6 lg:pt-2">
      <div className="-mb-5">
        <Title text="더보기" />
      </div>
      <MoreProfileBlock
        currentUser={currentUser}
        onShowSignIn={showSignIn}
        hasUnconsumedCoupons={hasUnconsumedCoupons}
      />
      <MorePersonalPlannerSection currentUser={currentUser} />
      <MoreMobileNavigationSettings
        options={mobileOptions}
        mobileNavigationIds={mobileNavigationIds}
        onApply={setMobileNavigationIds}
      />

      {menuSections.length > 0 && <MoreMenuSections sections={menuSections} />}
    </div>
  );
}

function toMoreActionItem(item: NavigationItem): MoreActionItem {
  return {
    key: item.to,
    to: item.to,
    name: item.name,
    disabled: item.disabled,
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
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            <UserCircleIcon className="size-9" strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-neutral-900 dark:text-neutral-100">로그인 후 이용해보세요</p>
            <p className="mt-1 text-sm leading-snug text-neutral-500 dark:text-neutral-400">
              청휘석, 학생 성장, 인연 랭크 등 다양한 데이터를 관리할 수 있어요
            </p>
            <button
              type="button"
              className="mt-3 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              onClick={onShowSignIn}
            >
              로그인
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900/50">
      <div className="flex items-center gap-4 px-4 py-4">
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
            <span className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">내 프로필 보기</span>
          </Link>
        </div>
      </div>

      <div className="space-y-0.5 px-2 pb-2">
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

function MorePersonalPlannerSection({ currentUser }: { currentUser: MoreCurrentUser | null }) {
  return (
    <section className="pt-3">
      <SubTitle text="나의 데이터" />
      <div className="space-y-1 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900/45">
        {currentUser ? <PyroxenePlannerRow pyroxene={currentUser.pyroxene} /> : null}
        <RelationshipPlannerRow relationship={currentUser?.relationship ?? null} isSignedIn={currentUser !== null} />
        {currentUser ? <ResourceScannerRow /> : null}
      </div>
    </section>
  );
}

function ResourceScannerRow() {
  return (
    <Link
      to="/scanner/resource"
      className={cn(`
        group flex items-center gap-3 py-3 pl-4 pr-2 transition-colors
        hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset
        dark:hover:bg-neutral-800/40
      `)}
    >
      <CameraIcon className="size-5 shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">스크린샷 인식기</p>
        <p className="mt-1 text-sm leading-snug text-neutral-500 dark:text-neutral-400">
          아이템 화면 스크린샷에서 보유 재화를 인식해요
        </p>
      </div>
      <ChevronRightIcon
        className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

function PyroxenePlannerRow({ pyroxene }: { pyroxene: MoreCurrentUser["pyroxene"] }) {
  const status = getPyroxeneStatus(pyroxene);
  const nextStudents = pyroxene?.nextStudents ?? [];
  const hasNextStudents = nextStudents.length > 0;

  return (
    <Link
      to="/utils/pyroxene"
      className={cn(`
        group flex items-center gap-2 py-3 pl-4 pr-2 transition-colors hover:bg-neutral-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset
        dark:hover:bg-neutral-800/40
      `)}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">다가오는 모집</p>
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
      className="group flex items-center gap-2 py-2.5 pl-4 pr-2 transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-800/40"
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
      className={cn(`
        group relative flex items-center gap-2 py-3 pl-4 pr-2 transition-colors hover:bg-neutral-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset
        dark:hover:bg-neutral-800/40
      `)}
    >
      <Link
        to="/utils/relationship"
        aria-label="인연 랭크 계산기 열기"
        className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset"
      />
      <div className="pointer-events-none relative z-10 min-w-0 flex-1">
        <p className="truncate text-base font-semibold text-neutral-900 dark:text-neutral-100">인연 랭크 계산기</p>
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

function MoreMobileNavigationSettings({
  options,
  mobileNavigationIds,
  onApply,
}: {
  options: NavigationItem[];
  mobileNavigationIds: MobileNavigationPair;
  onApply: (ids: MobileNavigationPair) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<MobileNavigationPair>(() =>
    normalizeMobileNavigationIds(mobileNavigationIds),
  );
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const getOptionName = (id: MobileNavigationId) =>
    options.find((option) => option.mobileNavigationId === id)?.name ?? "사용할 수 없는 메뉴";

  const openSettings = () => {
    setDraftIds(normalizeMobileNavigationIds(mobileNavigationIds));
    setActiveSlot(0);
    setSaveError(null);
    setIsOpen(true);
  };

  const selectOption = (id: MobileNavigationId) => {
    const otherSlot = activeSlot === 0 ? 1 : 0;
    if (draftIds[otherSlot] === id) {
      return;
    }

    setDraftIds((current) => {
      const next: MobileNavigationPair = [...current];
      next[activeSlot] = id;
      return next;
    });
  };

  const applySettings = async () => {
    const normalizedIds = normalizeMobileNavigationIds(draftIds);
    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/preference", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNavigationIds: normalizedIds }),
      });
      if (!response.ok) {
        throw new Error(`preference status=${response.status}`);
      }

      onApply(normalizedIds);
      setIsOpen(false);
    } catch {
      setSaveError("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <section className="pt-3">
        <SubTitle text="탭 개인화 설정" description="3, 4번째 탭을 자주 사용하는 메뉴로 변경할 수 있어요" />
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-lg bg-neutral-100 px-4 py-3 text-left transition-colors hover:bg-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-neutral-900/45 dark:hover:bg-neutral-800/60"
          onClick={openSettings}
          aria-haspopup="dialog"
        >
          <span className="min-w-0">
            <span className="block text-base font-semibold text-neutral-900 dark:text-neutral-100">현재 탭</span>
            <span className="mt-1 block truncate text-sm text-neutral-500 dark:text-neutral-400">
              {getOptionName(mobileNavigationIds[0])} · {getOptionName(mobileNavigationIds[1])}
            </span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-neutral-400" aria-hidden="true" />
        </button>
      </section>

      {isOpen ? (
        <BottomSheet
          Icon={Cog6ToothIcon}
          title="탭 개인화 설정"
          description="3, 4번째 탭을 자주 사용하는 메뉴로 변경할 수 있어요"
          onClose={() => {
            if (!isSaving) {
              setIsOpen(false);
            }
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              {([0, 1] as const).map((slot) => (
                <button
                  type="button"
                  key={slot}
                  className={cn(
                    "rounded-lg px-3 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                    activeSlot === slot
                      ? "bg-primary/15 text-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                  onClick={() => setActiveSlot(slot)}
                  aria-pressed={activeSlot === slot}
                >
                  <span className="block text-xs font-medium">{slot === 0 ? "3번째 탭" : "4번째 탭"}</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-foreground">
                    {getOptionName(draftIds[slot])}
                  </span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-2">
                {options.map((option) => {
                  const id = option.mobileNavigationId;
                  if (!id) {
                    return null;
                  }

                  const isSelected = draftIds[activeSlot] === id;
                  const isSelectedByOtherSlot = draftIds[activeSlot === 0 ? 1 : 0] === id;
                  return (
                    <button
                      type="button"
                      key={id}
                      className={cn(
                        "flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                        isSelected ? "bg-primary/15 text-foreground" : "bg-muted text-foreground/80 hover:bg-muted/70",
                        isSelectedByOtherSlot && "cursor-not-allowed opacity-40",
                      )}
                      onClick={() => selectOption(id)}
                      disabled={isSelectedByOtherSlot}
                      aria-pressed={isSelected}
                    >
                      <span className="truncate">{option.name}</span>
                      {isSelected ? <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {saveError ? (
              <p className="text-sm text-destructive" role="alert">
                {saveError}
              </p>
            ) : null}
            <Button type="button" variant="primary" fullWidth disabled={isSaving} onClick={applySettings}>
              {isSaving ? "저장 중..." : "적용"}
            </Button>
          </div>
        </BottomSheet>
      ) : null}
    </>
  );
}

function MoreMenuSections({ sections }: { sections: { name: string; items: MoreActionItem[] }[] }) {
  return (
    <section className="pt-3">
      <SubTitle text="모든 메뉴" />
      <div className="space-y-4">
        {sections.map((section) => (
          <div key={section.name} className="space-y-1">
            <h3 className="px-1 text-sm font-semibold text-neutral-500 dark:text-neutral-400">{section.name}</h3>
            <div className="space-y-1">
              {section.items.map((item) => (
                <MoreMenuItem key={item.key} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MoreMenuItem({ item }: { item: MoreActionItem }) {
  const className = cn(
    "block w-full rounded-lg bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-neutral-900/45 dark:text-neutral-100",
    item.disabled ? "cursor-default opacity-50" : "hover:bg-neutral-200 dark:hover:bg-neutral-800/60",
  );

  if (item.disabled || !item.to) {
    return (
      <div className={className} aria-disabled="true">
        {item.name}
      </div>
    );
  }

  return (
    <Link to={item.to} className={className}>
      {item.name}
    </Link>
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
