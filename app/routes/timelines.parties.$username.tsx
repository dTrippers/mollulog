import { QueueListIcon } from "@heroicons/react/24/outline";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Page, RouteErrorBoundary } from "~/components/features/layout";
import { Callout } from "~/components/primitives";
import { getUserParties } from "~/models/party.server";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";
import { getRouteSensei } from "./$username._components/route-sensei.server";
import PartyView from "./timelines.parties._components/PartyView";

export const meta: MetaFunction = ({ params }) => [
  { title: `${params.username ?? ""} - 이전 편성·공략 | 몰루로그`.trim() },
  { name: "robots", content: "noindex" },
];

export const ErrorBoundary = RouteErrorBoundary;

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const currentUser = await getActiveSensei(env, request, ctx);
  const sensei = await getRouteSensei(env, params, currentUser?.id, { ctx });
  const me = sensei.id === currentUser?.id;

  const [allStudents, recruitedStudentTiers, allRaids, userParties] = await Promise.all([
    getAllStudents(env, true),
    getRecruitedStudentTiers(env, sensei.id),
    getAllRaidSchedules(env),
    getUserParties(env, sensei.username, { includePrivate: me }),
  ]);

  return {
    username: sensei.username,
    parties: userParties.reverse(),
    students: allStudents.map((student) => ({
      uid: student.uid,
      name: student.name,
      tier: recruitedStudentTiers[student.uid] ?? null,
    })),
    raids: allRaids,
  };
};

export default function UserPartiesPage() {
  const { username, parties, students, raids } = useLoaderData<typeof loader>();

  return (
    <Page
      title="이전 편성·공략"
      description={`@${username} 선생님이 이전 방식으로 등록한 편성과 공략이에요`}
      backward={{ title: "공략 타임라인", to: "/timelines" }}
    >
      <div className="py-4">
        <Callout
          Icon={QueueListIcon}
          title="공략 타임라인 작성 기능이 추가됐어요"
          description="기존 페이지에서는 더 이상 작성할 수 없어요. 새로운 공략 타임라인 기능을 이용해주세요."
          tone="warning"
        />

        {parties.length === 0 && <p className="my-16 text-center">아직 등록한 공략 정보가 없어요</p>}

        {parties.map((party) => (
          <PartyView key={`party-${party.uid}`} party={party} students={students} raids={raids} />
        ))}
      </div>
    </Page>
  );
}
