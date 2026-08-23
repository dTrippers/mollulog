import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { SubTitle } from "~/components/primitives";
import type { RecruitmentTypeEnum } from "~/graphql/graphql";
import type { NestedComment } from "~/models/content";
import { nestComments } from "~/models/content";
import { getContentsComments } from "~/models/content.server";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import type { Role } from "~/models/student";
import { getAllStudentsMap, getStudentSkillItemsBatch } from "~/models/student";
import { getFutureContents } from "~/views/futures";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import FuturePlan from "./$username.futures._components/FuturePlan";

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 관심 학생 목록 | 몰루로그`.trim() },
    { name: "description", content: `${params.username} 선생님의 관심 학생 목록을 확인해보세요` },
    { name: "og:title", content: `${params.username || ""} - 관심 학생 목록 | 몰루로그`.trim() },
    { name: "og:description", content: `${params.username} 선생님의 관심 학생 목록을 확인해보세요` },
  ];
};

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const publicReadEnv = env;
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });

  const [favoritedStudents, futureContents, studentsMap] = await Promise.all([
    getUserFavoritedStudents(env, sensei.id, undefined, { ctx }),
    getFutureContents(publicReadEnv, false, ctx),
    getAllStudentsMap(env, true),
  ]);

  const plannedContentIds = favoritedStudents.map(({ contentId }) => contentId);

  // Filter future event contents to planned content IDs only
  const RAID_TYPES = new Set(["total_assault", "elimination", "unlimit", "allied"]);
  const matchedContents = futureContents.filter(
    (c) => !RAID_TYPES.has(c.contentType) && plannedContentIds.includes(c.uid),
  );

  // Collect favorited student UIDs across matched events
  const favoritedStudentUids = new Set(favoritedStudents.map(({ studentId }) => studentId));
  const relevantStudentUids = new Set(
    matchedContents
      .flatMap((c) => c.recruitments.map((r) => r.student?.uid).filter((uid): uid is string => uid != null))
      .filter((uid) => favoritedStudentUids.has(uid)),
  );

  // Fetch skill items only for favorited students that appear in matched events
  const skillItemsMap = await getStudentSkillItemsBatch(env, [...relevantStudentUids]);

  // Build events in the shape FuturePlan expects
  const events = matchedContents.map((content) => ({
    uid: content.uid,
    name: content.name,
    since: content.startAt,
    until: content.endAt ?? content.startAt,
    recruitments: content.recruitments.map((r) => {
      const studentBase = r.student?.uid ? studentsMap[r.student.uid] : null;
      const skillData = r.student?.uid ? skillItemsMap.get(r.student.uid) : null;
      return {
        recruitmentType: r.recruitmentType as RecruitmentTypeEnum,
        rerun: r.rerun,
        student: studentBase
          ? {
              uid: studentBase.uid,
              name: studentBase.name,
              school: studentBase.school,
              attackType: studentBase.attackType,
              defenseType: studentBase.defenseType,
              role: studentBase.role as Role,
              schaleDbId: skillData?.schaleDbId ?? null,
              equipments: studentBase.equipments,
              skillItems: skillData?.skillItems ?? [],
            }
          : null,
      };
    }),
  }));

  const allComments: Record<string, NestedComment[]> = {};
  const contentComments = await getContentsComments(env, plannedContentIds, currentUser?.id);
  for (const contentId of plannedContentIds) {
    allComments[contentId] = nestComments(contentComments[contentId] ?? [], sensei);
  }

  return {
    events,
    favoritedStudents,
    allComments,
    isMe: currentUser?.id === sensei.id,
  };
};

export default function UserFutures() {
  const { events, favoritedStudents, allComments } = useLoaderData<typeof loader>();

  if (events.length === 0) {
    return (
      <div className="my-16">
        <p className="text-center my-4">아직 관심 학생을 등록하지 않았어요</p>
        <Link to="/futures" className="text-center underline">
          <p>미래시 보고 등록하러 가기 →</p>
        </Link>
      </div>
    );
  }

  return (
    <div className="my-8">
      <SubTitle text="관심 학생 목록" />
      {events.map((event) => {
        return (
          <FuturePlan
            key={event.uid}
            event={event}
            favoritedStudents={favoritedStudents.filter(({ contentId }) => contentId === event.uid)}
            comments={allComments[event.uid] ?? []}
          />
        );
      })}
    </div>
  );
}
