import { ChevronRightIcon, HeartIcon } from "@heroicons/react/16/solid";
import { PlusIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getMobileNavigationItems, getNavigationSections } from "~/components/features/layout/navigation-menu";
import { ProfileImage, SubTitle, Title } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { canonicalLink } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { getMoreViewData, type MoreCurrentUser } from "~/views/more";

type MoreActionItem = {
  key: string;
  name: string;
  description?: string;
  Icon: React.ComponentType<React.ComponentProps<"svg">>;
  to?: string;
  badgeLabel?: string;
  showRedDot?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  actionLabel?: string;
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
  const { showSignIn } = useSignIn();

  const bottomNavigationPaths = new Set(
    getMobileNavigationItems({ pathname: "/more", upcomingEvent }).map((item) => item.to),
  );
  const pathsAlreadyOnThisScreen = new Set([
    "/utils/pyroxene",
    "/utils/relationship",
    "/coupons",
    ...(currentUser ? [`/@${currentUser.username}`] : []),
  ]);
  const menuItems = getNavigationSections({
    pathname: "/more",
    upcomingEvent,
    hasOngoingRaid,
    hasUnconsumedCoupons,
    isSignedIn: currentUser !== null,
  }).flatMap((section) =>
    section.items
      .filter(
        (item) =>
          item.disabled === true || (!bottomNavigationPaths.has(item.to) && !pathsAlreadyOnThisScreen.has(item.to)),
      )
      .map((item) => ({
        key: item.to,
        to: item.to,
        name: item.name,
        description: item.description,
        Icon: item.OutlineIcon,
        badgeLabel: item.badgeLabel,
        showRedDot: item.showRedDot,
        disabled: item.disabled,
      })),
  );

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

      {menuItems.length > 0 && <MoreMenuGrid title="전체 메뉴" items={menuItems} />}
    </div>
  );
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

      <div className="border-neutral-200 border-t dark:border-neutral-800">
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
      <div className="overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900/45">
        {currentUser ? <PyroxenePlannerRow pyroxene={currentUser.pyroxene} /> : null}
        <RelationshipPlannerRow
          relationship={currentUser?.relationship ?? null}
          isSignedIn={currentUser !== null}
          showTopBorder={currentUser !== null}
        />
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
            <span className="shrink-0 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs font-medium leading-none text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
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
  showTopBorder,
}: {
  relationship: MoreCurrentUser["relationship"] | null;
  isSignedIn: boolean;
  showTopBorder: boolean;
}) {
  const targetStudents = relationship?.targetStudents ?? [];

  return (
    <div
      className={cn(`
        group relative flex items-center gap-2 py-3 pl-4 pr-2 transition-colors hover:bg-neutral-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-inset
        dark:hover:bg-neutral-800/40
        ${showTopBorder ? "border-neutral-200 border-t dark:border-neutral-800" : ""}
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
            <span className="flex size-6 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700">
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

function MoreMenuGrid({ title, items }: { title: string; items: MoreActionItem[] }) {
  return (
    <section className="pt-3">
      <SubTitle text={title} />
      <div className="grid grid-cols-4 gap-x-2 gap-y-3 rounded-lg bg-neutral-100 px-2 py-3 dark:bg-neutral-900/45">
        {items.map((item) => (
          <MoreGridItem key={item.key} item={item} />
        ))}
      </div>
    </section>
  );
}

function MoreGridItem({ item }: { item: MoreActionItem }) {
  const content = (
    <>
      <span className="relative flex size-8 items-center justify-center text-neutral-700 dark:text-neutral-200">
        <item.Icon className="size-6" strokeWidth={1.75} />
        {item.showRedDot && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-red-500" />}
      </span>
      <span className="mt-1.5 max-w-full break-keep text-xs font-medium leading-snug text-neutral-700 dark:text-neutral-200">
        {item.name}
      </span>
      {item.badgeLabel && (
        <span className="mt-0.5 text-xs leading-none text-neutral-400 dark:text-neutral-500">{item.badgeLabel}</span>
      )}
    </>
  );

  const className = cn(`
    flex min-w-0 flex-col items-center rounded-md px-1 py-1.5 text-center transition-colors
    focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30
    dark:focus-visible:ring-offset-neutral-900
    ${item.disabled ? "cursor-default opacity-40" : "hover:bg-white dark:hover:bg-neutral-800/70"}
  `);

  if (item.disabled) {
    return (
      <div className={className} title={item.description ?? item.name} aria-disabled="true">
        {content}
      </div>
    );
  }

  if (item.to) {
    return (
      <Link to={item.to} className={className} title={item.description ?? item.name}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={item.onClick} title={item.description ?? item.name}>
      {content}
    </button>
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
