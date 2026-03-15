import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { ProfileCard, type ProfileCardProps } from "~/components/features/profile";
import { StudentGradingTimeline } from "~/components/features/students";
import { SubTitle } from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import { getFollowerIds, getFollowingIds } from "~/models/followership";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudentsMap } from "~/models/student";
import { getStudentGradingsByUser } from "~/models/student-grading";
import { getRouteSensei } from "./$username";
import type { ActionData } from "./api.followerships";

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getRouteSensei(env, params);

  // Get a relationship
  const followingIds = await getFollowingIds(env, sensei.id);
  const followerIds = await getFollowerIds(env, sensei.id);

  const relationship = { followed: false, following: false };
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (currentUser) {
    relationship.followed = followingIds.includes(currentUser.id);
    relationship.following = followerIds.includes(currentUser.id);
  }

  // Get student tiers
  const recruitedStudents = await getRecruitedStudents(env, sensei.id);
  const tierCounts: { [key: number]: number } = {};
  for (const { tier } of recruitedStudents) {
    tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;
  }

  // Get all gradings by this user
  const gradings = await getStudentGradingsByUser(env, sensei.id);
  const allStudentsMap = await getAllStudentsMap(env, true);
  const sortedGradings = [...gradings].sort((a, b) => {
    const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (updatedDiff !== 0) {
      return updatedDiff;
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return {
    currentUsername: currentUser?.username ?? null,
    sensei: {
      username: sensei.username,
      profileStudentId: sensei.profileStudentId ?? null,
      bio: sensei.bio ?? null,
      friendCode: sensei.friendCode ?? null,
    },
    relationship,
    followingCount: followingIds.length,
    followerCount: followerIds.length,
    tierCounts,
    gradings: sortedGradings.map((grading) => ({
      ...grading,
      studentName: allStudentsMap[grading.studentUid]?.name ?? grading.studentUid,
    })),
  };
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
  const { sensei, currentUsername, tierCounts, gradings } = loaderData;

  let followability: ProfileCardProps["followability"] = loaderData.relationship.following ? "following" : "followable";
  if (currentUsername === sensei.username) {
    followability = "unable";
  }

  const fetcher = useFetcher<ActionData>();
  const { showSignIn } = useSignIn();

  return (
    <div className="my-8">
      <div className="my-8">
        <ProfileCard
          {...sensei}
          profileStudentUid={sensei.profileStudentId}
          tierCounts={tierCounts}
          followability={followability}
          followerCount={loaderData.followerCount}
          followingCount={loaderData.followingCount}
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
      </div>

      {gradings.length > 0 && (
        <div className="my-8">
          <SubTitle text="학생 평가 내역" description="최근에 남긴 평가부터 확인해보세요" />
          <StudentGradingTimeline
            hideAuthorName
            hideEditAction
            gradings={gradings.map((grading) => ({
              ...grading,
              student: {
                uid: grading.studentUid,
                name: grading.studentName,
              },
            }))}
          />
        </div>
      )}
    </div>
  );
}
