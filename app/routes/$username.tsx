import {
  CameraIcon,
  ChartBarIcon,
  HeartIcon,
  LockClosedIcon,
  PencilSquareIcon,
  UserCircleIcon,
  UserIcon,
} from "@heroicons/react/16/solid";
import { type ElementType, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { Link, Outlet, useLoaderData, useLocation, useRevalidator, useRouteError } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { SenseiAvatar } from "~/components/v2/features/comments/SenseiAvatar";
import { LoadFailureState } from "~/components/v2/features/students/LoadFailureState";
import {
  AsideLinks,
  MobileActionBar,
  type MobileActionBarProps,
  PageAside,
  PageHeader,
  PageMain,
  ScreenNavigation,
  ScreenNavigationFocusScope,
  ScreenNavigationToolbar,
  V2Page,
} from "~/components/v2/layout";
import { v2ButtonClassName } from "~/components/v2/primitives/Button";
import { isRecordedRecruitmentResult } from "~/domain/recruitment-result";
import { getLogger } from "~/lib/observability.server";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";
import { isCommunityEngagementActionResult } from "~/models/community-engagement";
import { getFollowershipSummary } from "~/models/followership";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getRecruitmentResults } from "~/models/recruitment-result.server";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import { MovedMenusNotice } from "./$username._components/MovedMenusNotice";
import { UserFollowButton } from "./$username._components/UserFollowButton";
import { UserHeaderDetails } from "./$username._components/UserHeaderDetails";
import { buildUserScreenItems, type UserLayoutContext } from "./$username._components/user-layout";

const SCANNER_LINK = {
  title: "화면 인식·데이터 연동",
  description: "게임 스크린샷, 녹화 영상이나 외부 사이트 데이터를 반영할 수 있어요",
  to: "/scanner",
} as const;

// A count is a secondary label, so a failed lookup drops the label (`null`) instead of showing a wrong number.
async function countOrNull(label: string, logger: ReturnType<typeof getLogger>, load: () => Promise<number>) {
  try {
    return await load();
  } catch (error) {
    logger.error(`User layout ${label} count failed`, error);
    return null;
  }
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const logger = getLogger(env, ctx, { route: "$username" });
  const isOwner = currentUser?.id === sensei.id;

  // Only a signed-in visitor sees a follow button, so only that visit needs the relationship, and a failed lookup fails
  // the layout there. Everywhere else the counts are secondary and drop out on failure.
  const viewerId = currentUser && !isOwner ? currentUser.id : undefined;
  const [followership, recruitedStudentCount, pickupCount] = await Promise.all([
    getFollowershipSummary(env, sensei.id, viewerId, { ctx }).catch((error: unknown) => {
      if (viewerId !== undefined) {
        throw error;
      }
      logger.error("User layout followership counts failed", error);
      return null;
    }),
    countOrNull("recruited student", logger, async () => (await getRecruitedStudents(env, sensei.id)).length),
    countOrNull(
      "pickup record",
      logger,
      async () => (await getRecruitmentResults(env, sensei.id)).filter(isRecordedRecruitmentResult).length,
    ),
  ]);

  return {
    username: sensei.username,
    labels: sensei.labels ?? [],
    profileStudentId: sensei.profileStudentId ?? null,
    profileVisibility: sensei.profileVisibility,
    growthVisibility: sensei.growthVisibility ?? false,
    isOwner,
    signedIn: currentUser !== null,
    following: followership?.following ?? false,
    bio: sensei.bio || null,
    friendCode: sensei.friendCode ?? null,
    followCounts: followership
      ? { following: followership.followingCount, followers: followership.followerCount }
      : null,
    recruitedStudentCount,
    pickupCount,
  };
};

// A reaction on a feed post must not reload the header, the counts, and the relationship.
export const shouldRevalidate: ShouldRevalidateFunction = ({ actionResult, defaultShouldRevalidate }) => {
  if (isCommunityEngagementActionResult(actionResult)) {
    return false;
  }
  return defaultShouldRevalidate;
};

const noop = () => {};

export default function User() {
  const data = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const [asideCollapsed, setAsideCollapsedState] = useState(false);
  const setAsideCollapsed = useCallback((collapsed: boolean) => setAsideCollapsedState(collapsed), []);
  const [asideContent, setAsideContent] = useState<ReactNode>(null);
  const [mobileActions, setMobileActions] = useState<MobileActionBarProps | null>(null);

  // A new location starts with the Aside open again. A screen releases its own Aside content and mobile actions when it
  // unmounts, so they are not reset here: a reset in this effect would run after the new screen's own effects and erase them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new pathname is the trigger
  useEffect(() => {
    setAsideCollapsedState(false);
  }, [pathname]);

  const screens = buildUserScreenItems({
    username: data.username,
    pathname,
    recruitedStudentCount: data.recruitedStudentCount,
    pickupCount: data.pickupCount,
    icons: { profile: UserCircleIcon, students: UserIcon, pickups: ChartBarIcon, futures: HeartIcon },
  });

  const outletContext = useMemo<UserLayoutContext>(
    () => ({
      username: data.username,
      isOwner: data.isOwner,
      signedIn: data.signedIn,
      profileVisibility: data.profileVisibility,
      growthVisibility: data.growthVisibility,
      recruitedStudentCount: data.recruitedStudentCount,
      pickupCount: data.pickupCount,
      setAsideCollapsed,
      setAsideContent,
      setMobileActions,
      setPanels: noop,
      setLinks: noop,
    }),
    [
      data.username,
      data.isOwner,
      data.signedIn,
      data.profileVisibility,
      data.growthVisibility,
      data.recruitedStudentCount,
      data.pickupCount,
      setAsideCollapsed,
    ],
  );

  return (
    <V2Page width="wide">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">@{data.username}</span>
            {data.profileVisibility === "public" ? null : (
              <>
                <LockClosedIcon className="size-4 shrink-0 text-v2-fg-tertiary" aria-hidden="true" />
                <span className="sr-only">비공개 프로필</span>
              </>
            )}
          </span>
        }
        media={<SenseiAvatar profileStudentId={data.profileStudentId} labels={data.labels} size="header" />}
        details={
          data.bio || data.friendCode || data.followCounts ? (
            <UserHeaderDetails
              username={data.username}
              bio={data.bio}
              friendCode={data.friendCode}
              counts={data.followCounts}
            />
          ) : undefined
        }
        trailing={
          data.isOwner ? (
            <Link to="/edit" className={v2ButtonClassName({ variant: "primary" })}>
              <PencilSquareIcon className="size-4" aria-hidden="true" />
              프로필 관리
            </Link>
          ) : (
            <UserFollowButton username={data.username} following={data.following} signedIn={data.signedIn} />
          )
        }
        trailingInline
      />
      <ScreenNavigationFocusScope>
        <ScreenNavigationToolbar items={screens} />
        {asideCollapsed ? null : (
          <PageAside>
            <ScreenNavigation items={screens} />
            {asideContent ??
              (data.isOwner ? (
                <AsideLinks items={[{ key: "scanner", Icon: CameraIcon, ...SCANNER_LINK, transition: "forward" }]} />
              ) : null)}
          </PageAside>
        )}
      </ScreenNavigationFocusScope>
      <PageMain>
        {data.isOwner ? <MovedMenusNotice /> : null}
        <Outlet context={outletContext} />
      </PageMain>
      {mobileActions ? (
        <MobileActionBar {...mobileActions} />
      ) : data.isOwner ? (
        <MobileActionBar links={[{ key: "scanner", title: "데이터 연동", Icon: CameraIcon, to: SCANNER_LINK.to }]} />
      ) : null}
    </V2Page>
  );
}

function UserStateMessage({ Icon, title, description }: { Icon: ElementType; title: string; description?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-v2-inset">
        <Icon className="size-5 text-v2-fg-secondary" aria-hidden="true" />
      </span>
      <div>
        <p className="text-base font-semibold text-v2-fg">{title}</p>
        {description ? <p className="mt-1 text-sm text-v2-fg-tertiary">{description}</p> : null}
      </div>
    </div>
  );
}

// Private profile, unknown username, and failures all replace the whole layout: the menu and avatar of a profile the
// viewer cannot see stay hidden, and a failed load has no counts to show.
export function ErrorBoundary() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  const normalized = normalizeRouteError(error);
  const details = normalized.details;
  const username =
    typeof details === "object" && details !== null && "username" in details && typeof details.username === "string"
      ? details.username
      : undefined;

  if (isServerRouteError(normalized)) {
    return (
      <V2Page width="wide">
        <PageHeader title="프로필" titleHidden />
        <PageMain>
          <LoadFailureState title="프로필을 불러오지 못했어요" onRetry={() => revalidator.revalidate()} />
        </PageMain>
      </V2Page>
    );
  }

  if (normalized.code === "sensei.profile_private") {
    return (
      <V2Page width="wide">
        <PageHeader
          title={username ? <span className="block truncate">@{username}</span> : "프로필"}
          titleHidden={!username}
        />
        <PageMain>
          <UserStateMessage
            Icon={LockClosedIcon}
            title="비공개 프로필이에요"
            description="이 프로필의 정보와 작성한 콘텐츠는 본인만 볼 수 있어요."
          />
        </PageMain>
      </V2Page>
    );
  }

  const notFound = normalized.code === "sensei.not_found";
  return (
    <V2Page width="wide">
      <PageHeader title="프로필" titleHidden />
      <PageMain>
        <UserStateMessage
          Icon={UserIcon}
          title={notFound ? "선생님을 찾을 수 없어요" : normalized.title}
          description={notFound ? "주소의 @아이디를 다시 확인해주세요." : normalized.message}
        />
      </PageMain>
    </V2Page>
  );
}
