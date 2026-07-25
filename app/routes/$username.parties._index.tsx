import { QueueListIcon } from "@heroicons/react/24/outline";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { Callout } from "~/components/primitives";
import { getUserParties, removePartyByUid } from "~/models/party";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";
import { getRouteSensei } from "./$username";
import PartyView from "./$username.parties._components/PartyView";

export const meta: MetaFunction = ({ params }) => {
  return [
    { title: `${params.username || ""} - 편성 | 몰루로그`.trim() },
    { name: "description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
    { name: "og:title", content: `${params.username || ""} - 편성 | 몰루로그`.trim() },
    { name: "og:description", content: `${params.username} 선생님이 모집한 학생 목록을 확인해보세요` },
  ];
};

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const currentUser = await getActiveSensei(env, request);
  const sensei = await getRouteSensei(env, params, currentUser?.id);
  const me = sensei.username === currentUser?.username;

  const allStudents = await getAllStudents(env, true);
  const recruitedStudentTiers = await getRecruitedStudentTiers(env, sensei.id);
  const allRaids = await getAllRaidSchedules(env);
  const parties = (await getUserParties(env, sensei.username, { includePrivate: me })).reverse();

  return {
    me,
    parties,
    students: allStudents.map((student) => ({
      uid: student.uid,
      name: student.name,
      tier: recruitedStudentTiers[student.uid] ?? null,
    })),
    raids: allRaids,
  };
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getActiveSensei(env, request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  await removePartyByUid(env, sensei.id, formData.get("uid") as string);
  return null;
};

export default function UserPartyPage() {
  const { me, parties, students, raids } = useLoaderData<typeof loader>();

  return (
    <div className="my-8">
      <Callout
        Icon={QueueListIcon}
        title="공략 타임라인 작성 기능이 추가됐어요"
        description="기존 페이지에서는 더 이상 작성할 수 없어요. 새로운 공략 타임라인 기능을 이용해주세요."
        tone="warning"
      />

      {parties.length === 0 && <p className="my-16 text-center">아직 등록한 공략 정보가 없어요</p>}

      {parties.map((party) => (
        <PartyView key={`party-${party.uid}`} party={party} students={students} raids={raids} deletable={me} />
      ))}
    </div>
  );
}
