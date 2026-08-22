import { PencilSquareIcon, UserMinusIcon, UserPlusIcon, UsersIcon } from "@heroicons/react/20/solid";
import { useCallback } from "react";
import type { LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Link, useFetcher, useLoaderData, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { CommunityInfiniteFeed } from "~/components/features/community";
import { ProfileImage } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { identityMaintenanceMessage } from "~/domain/identity-cutover";
import { withD1Session } from "~/lib/d1-session";
import { cn } from "~/lib/utils";
import { getCommunityFeedPage } from "~/models/community.server";
import { isCommunityEngagementActionResult } from "~/models/community-engagement";
import { getFollowershipSummary } from "~/models/followership";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";
import { COMMUNITY_FEED_PAGE_SIZE, COMMUNITY_VISIBLE_POST_TYPES } from "~/views/community";
import { enrichCommunityFeedPosts } from "~/views/community.server";
import { getRouteSensei } from "./$username";
import type { ActionData } from "./api.followerships";

function parsePage(request: Request) {
  const url = new URL(request.url);
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  return Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
}

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = withD1Session(env, "first-unconstrained");
  const currentUser = await getActiveSensei(env, request);
  const sensei = await getRouteSensei(env, params, currentUser?.id);
  const page = parsePage(request);

  const [followership, recruitedStudents, allReleasedStudents, feedPage] = await Promise.all([
    getFollowershipSummary(env, sensei.id, currentUser?.id),
    getRecruitedStudents(env, sensei.id),
    getAllStudents(env),
    getCommunityFeedPage(env, {
      currentUserId: currentUser?.id,
      authorUserId: sensei.id,
      postTypes: [...COMMUNITY_VISIBLE_POST_TYPES],
      page,
      pageSize: COMMUNITY_FEED_PAGE_SIZE,
      ctx,
    }),
  ]);

  const tierCounts: { [key: number]: number } = {};
  for (const { tier } of recruitedStudents) {
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }

  const enrichedFeed = await enrichCommunityFeedPosts(publicReadEnv, feedPage.items, {
    ctx,
    currentUserId: currentUser?.id,
  });

  return {
    currentUsername: currentUser?.username ?? null,
    sensei: {
      username: sensei.username,
      profileStudentId: sensei.profileStudentId ?? null,
      bio: sensei.bio ?? null,
      friendCode: sensei.friendCode ?? null,
    },
    relationship: { followed: followership.followed, following: followership.following },
    followingCount: followership.followingCount,
    followerCount: followership.followerCount,
    tierCounts,
    recruitedStudentCount: recruitedStudents.length,
    totalStudentCount: allReleasedStudents.length,
    page: feedPage.page,
    totalPages: feedPage.totalPages,
    signedIn: currentUser !== null,
    studentsByUid: enrichedFeed.studentsByUid,
    posts: enrichedFeed.posts,
  };
};

export const shouldRevalidate: ShouldRevalidateFunction = ({ actionResult, defaultShouldRevalidate }) => {
  if (isCommunityEngagementActionResult(actionResult)) {
    return false;
  }

  return defaultShouldRevalidate;
};

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 프로필 | 몰루로그`.trim() },
    {
      name: "description",
      content: `${params.username} 선생님의 프로필과 최근 활동을 확인해보세요.`,
    },
    {
      name: "og:title",
      content: `${params.username || ""} - 프로필 | 몰루로그`.trim(),
    },
    {
      name: "og:description",
      content: `${params.username} 선생님의 프로필과 최근 활동을 확인해보세요.`,
    },
  ];
};

export default function UserIndex() {
  const loaderData = useLoaderData<typeof loader>();
  const { sensei, currentUsername, posts, signedIn, studentsByUid, page, totalPages } = loaderData;

  let followability: ProfileHeaderProps["followability"] = loaderData.relationship.following
    ? "following"
    : "followable";
  if (currentUsername === sensei.username) {
    followability = "unable";
  }

  const fetcher = useFetcher<ActionData>();
  const maintenanceMessage = identityMaintenanceMessage(fetcher.data);
  const { showSignIn } = useSignIn();
  const [searchParams] = useSearchParams();
  const getPageUrl = useCallback(
    (nextPage: number) => {
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.set("page", String(nextPage));

      const query = nextSearchParams.toString();
      return query ? `/@${sensei.username}?${query}` : `/@${sensei.username}`;
    },
    [searchParams, sensei.username],
  );

  return (
    <div className="my-6 space-y-5">
      <ProfileHeader
        {...sensei}
        followability={followability}
        followerCount={loaderData.followerCount}
        followingCount={loaderData.followingCount}
        tierCounts={loaderData.tierCounts}
        recruitedStudentCount={loaderData.recruitedStudentCount}
        totalStudentCount={loaderData.totalStudentCount}
        loading={fetcher.state !== "idle"}
        onFollow={() =>
          currentUsername
            ? fetcher.submit({ username: sensei.username }, { method: "post", action: "/api/followerships" })
            : showSignIn()
        }
        onUnfollow={() =>
          currentUsername
            ? fetcher.submit({ username: sensei.username }, { method: "delete", action: "/api/followerships" })
            : showSignIn()
        }
      />
      {maintenanceMessage || fetcher.data?.error?.message ? (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {maintenanceMessage ?? fetcher.data?.error?.message}
        </p>
      ) : null}
      <CommunityInfiniteFeed
        posts={posts}
        signedIn={signedIn}
        studentsByUid={studentsByUid}
        page={page}
        totalPages={totalPages}
        emptyText="아직 작성한 피드 컨텐츠가 없어요"
        resetKey={sensei.username}
        getPageUrl={getPageUrl}
      />
    </div>
  );
}

type ProfileHeaderProps = {
  profileStudentId: string | null;
  username: string;
  bio: string | null;
  friendCode: string | null;
  loading: boolean;
  followability: "followable" | "following" | "unable";
  followingCount: number;
  followerCount: number;
  tierCounts: { [key: number]: number };
  recruitedStudentCount: number;
  totalStudentCount: number;
  onFollow: () => void;
  onUnfollow: () => void;
};

function ProfileHeader({
  profileStudentId,
  username,
  bio,
  friendCode,
  loading,
  followability,
  followingCount,
  followerCount,
  tierCounts,
  recruitedStudentCount,
  totalStudentCount,
  onFollow,
  onUnfollow,
}: ProfileHeaderProps) {
  return (
    <section className="rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6">
      <div className="flex items-center gap-4">
        <ProfileImage studentUid={profileStudentId} imageSize={12} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-neutral-900 dark:text-neutral-100">@{username}</h2>
          {friendCode && (
            <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
              친구 코드 <span className="text-neutral-700 dark:text-neutral-200">{friendCode}</span>
            </p>
          )}
        </div>
        <ProfileActionButton
          followability={followability}
          loading={loading}
          onFollow={onFollow}
          onUnfollow={onUnfollow}
        />
      </div>

      <div className="mt-4">
        {bio && (
          <p className="whitespace-pre-wrap text-left text-sm leading-6 text-neutral-800 dark:text-neutral-100">
            {bio}
          </p>
        )}

        <div className={`${bio ? "mt-3" : ""} flex flex-wrap items-center gap-x-4 gap-y-2 text-left text-sm`}>
          <Link to={`/@${username}/friends?tab=following`} className="hover:underline">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">{followingCount}</span>{" "}
            <span className="text-neutral-500 dark:text-neutral-400">팔로잉</span>
          </Link>
          <Link to={`/@${username}/friends?tab=following`} className="hover:underline">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">{followerCount}</span>{" "}
            <span className="text-neutral-500 dark:text-neutral-400">팔로워</span>
          </Link>
        </div>
      </div>
      <RecruitmentSummaryBar
        username={username}
        tierCounts={tierCounts}
        recruitedCount={recruitedStudentCount}
        totalCount={totalStudentCount}
      />
    </section>
  );
}

const recruitmentTierStyles: Record<number, string> = {
  1: "bg-red-400",
  2: "bg-orange-400",
  3: "bg-yellow-400",
  4: "bg-green-400",
  5: "bg-cyan-400",
  6: "bg-blue-400",
  7: "bg-purple-400",
  8: "bg-fuchsia-400",
  9: "bg-pink-400",
};

function RecruitmentSummaryBar({
  username,
  tierCounts,
  recruitedCount,
  totalCount,
}: {
  username: string;
  tierCounts: { [key: number]: number };
  recruitedCount: number;
  totalCount: number;
}) {
  const tiers = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const visibleTiers = tiers.filter((tier) => (tierCounts[tier] ?? 0) > 0);
  const unrecruitedCount = Math.max(0, totalCount - recruitedCount);
  const widthBase = Math.max(totalCount, recruitedCount, 1);

  return (
    <Link
      to={`/@${username}/students`}
      className="mt-5 block rounded-md pt-4 transition-colors hover:text-primary"
      aria-label={`모집한 학생 ${recruitedCount}명 보기`}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">모집한 학생</span>
        <span className="text-neutral-500 dark:text-neutral-400">
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">{recruitedCount}</span>
          <span className="mx-0.5">/</span>
          {totalCount}명
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        {recruitedCount > 0
          ? visibleTiers.map((tier) => (
              <div
                key={tier}
                className={recruitmentTierStyles[tier]}
                style={{ width: `${((tierCounts[tier] ?? 0) / widthBase) * 100}%` }}
                title={`${tier <= 5 ? `★${tier}` : `고유 ${tier - 5}`} - ${tierCounts[tier]}명`}
              />
            ))
          : null}
        {unrecruitedCount > 0 && (
          <div
            className="bg-neutral-300 dark:bg-neutral-700"
            style={{ width: `${(unrecruitedCount / widthBase) * 100}%` }}
            title={`미모집 - ${unrecruitedCount}명`}
          />
        )}
      </div>
      <RecruitmentTierTable tierCounts={tierCounts} />
    </Link>
  );
}

function RecruitmentTierTable({ tierCounts }: { tierCounts: { [key: number]: number } }) {
  const tiers = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-neutral-200/70 text-center text-xs dark:border-neutral-700/70">
      <div className="grid grid-cols-9 divide-x divide-neutral-200/70 bg-white/60 text-neutral-600 dark:divide-neutral-700/70 dark:bg-neutral-800/50 dark:text-neutral-300">
        {tiers.map((tier) => (
          <div key={`tier-label-${tier}`} className="flex h-7 items-center justify-center gap-0.5">
            {tier <= 5 ? (
              <>
                <span className="text-yellow-400">★</span>
                <span>{tier}</span>
              </>
            ) : (
              <>
                <img className="size-3.5" src="/icons/exclusive_weapon.png" alt="고유무기" />
                <span>{tier - 5}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-9 divide-x divide-neutral-200/70 bg-neutral-50 font-semibold text-neutral-900 dark:divide-neutral-700/70 dark:bg-neutral-900/60 dark:text-neutral-100">
        {tiers.map((tier) => (
          <div key={`tier-count-${tier}`} className="flex h-7 items-center justify-center">
            {tierCounts[tier] ?? 0}
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileActionButton({
  followability,
  loading,
  onFollow,
  onUnfollow,
}: Pick<ProfileHeaderProps, "followability" | "loading" | "onFollow" | "onUnfollow">) {
  if (followability === "unable") {
    return (
      <Link
        to="/edit"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
        aria-label="프로필 관리"
      >
        <PencilSquareIcon className="size-4" />
        프로필 관리
      </Link>
    );
  }

  if (followability === "following") {
    return (
      <button
        type="button"
        className={cn(`
          group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold transition
          hover:border-red-500 hover:bg-red-500 hover:text-white disabled:opacity-50
          dark:border-neutral-600 dark:hover:border-red-500
        `)}
        onClick={onUnfollow}
        disabled={loading}
      >
        <UsersIcon className="size-4 group-hover:hidden" />
        <span className="group-hover:hidden">팔로우 중</span>
        <UserMinusIcon className="hidden size-4 group-hover:block" />
        <span className="hidden group-hover:block">팔로우 해제</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      onClick={onFollow}
      disabled={loading}
    >
      <UserPlusIcon className="size-4" />
      팔로우
    </button>
  );
}
