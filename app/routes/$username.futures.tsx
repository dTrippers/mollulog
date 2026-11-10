import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { LoadFailureState } from "~/components/v2/features/students/LoadFailureState";
import { v2FocusRing } from "~/components/v2/layout/styles";
import { nowUtcIso } from "~/lib/date-time";
import { getLogger } from "~/lib/observability.server";
import { cn } from "~/lib/utils";
import { type ContentCommentWithSensei, getContentsComments } from "~/models/content.server";
import { getUserFavoritedStudents } from "~/models/favorite-students";
import { getHideRecruitmentOpinions } from "~/models/sensei";
import { getAllStudentsMap, getStudentSkillItemsBatch } from "~/models/student";
import { getFutureContents } from "~/views/futures";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import { useUserLayout } from "./$username._components/user-layout";
import { FavoriteEventCard } from "./$username.futures._components/FavoriteEventCard";
import { buildFavoriteEvent, selectFavoriteEventContents } from "./$username.futures._components/favorite-events";

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
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const logger = getLogger(env, ctx, { route: "$username.futures" });
  const now = nowUtcIso();

  const [favorites, futureContents, studentsByUid] = await Promise.all([
    getUserFavoritedStudents(env, sensei.id, undefined, { ctx }),
    getFutureContents(env, false, ctx),
    getAllStudentsMap(env, true),
  ]);

  const selected = selectFavoriteEventContents(futureContents, favorites);
  const contentUids = selected.map(({ content }) => content.uid);
  const studentUids = selected.flatMap(({ content, favoriteKeys }) =>
    content.recruitments.flatMap((recruitment) =>
      recruitment.student && favoriteKeys.has(recruitment.favoriteKey) ? [recruitment.student.uid] : [],
    ),
  );

  // The opinions are a summary under each event, so a failed lookup marks that summary failed instead of failing the page.
  // They follow the viewer's setting for recruitment results, as on the event screen.
  const loadOpinions = async () => {
    const hideRecruitmentOpinions = await getHideRecruitmentOpinions(env, currentUser, { ctx });
    return getContentsComments(env, contentUids, currentUser?.id, { hideRecruitmentOpinions, ctx });
  };
  const [skillItemsByUid, opinionsByContent] = await Promise.all([
    getStudentSkillItemsBatch(env, studentUids),
    contentUids.length === 0
      ? Promise.resolve<Record<string, ContentCommentWithSensei[]>>({})
      : loadOpinions().catch((error: unknown) => {
          logger.error("Favorite students opinions failed to load", error);
          return null;
        }),
  ]);

  return {
    now,
    events: selected.map(({ content, favoriteKeys }) =>
      buildFavoriteEvent({
        content,
        favoriteKeys,
        studentsByUid,
        skillItemsByUid,
        opinions: opinionsByContent === null ? null : (opinionsByContent[content.uid] ?? []),
        ownerUsername: sensei.username,
        now,
      }),
    ),
  };
};

export function ErrorBoundary() {
  const revalidator = useRevalidator();
  return <LoadFailureState title="관심 학생 목록을 불러오지 못했어요" onRetry={() => revalidator.revalidate()} />;
}

export default function UserFavoriteStudents() {
  const { events, now } = useLoaderData<typeof loader>();
  const { isOwner } = useUserLayout();

  return (
    <section aria-labelledby="favorite-students-title" className="flex flex-col gap-v2-block-gap">
      <h2 id="favorite-students-title" className="text-base font-bold text-v2-fg">
        관심 학생 목록
      </h2>
      {events.length === 0 ? (
        <div className="rounded-lg bg-v2-surface px-4 py-10 text-center">
          <p className="text-sm font-semibold text-v2-fg">아직 관심 학생을 등록하지 않았어요</p>
          {isOwner ? (
            <Link
              to="/futures"
              className={cn(
                "mt-2 inline-block text-sm font-medium text-v2-link underline underline-offset-2",
                v2FocusRing,
              )}
            >
              미래시 보고 등록하러 가기
            </Link>
          ) : null}
        </div>
      ) : (
        events.map((event) => <FavoriteEventCard key={event.uid} event={event} now={now} />)
      )}
    </section>
  );
}
