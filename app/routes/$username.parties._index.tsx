import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { AddContentButton } from "~/components/features/editor";
import PartyView from "./$username.parties._components/PartyView";
import { getUserParties, removePartyByUid } from "~/models/party";
import { getAllStudents } from "~/models/student";
import { getRouteSensei } from "./$username";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { RaidRepository } from "~/repositories";

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
  const raidRepository = new RaidRepository(env);
  const sensei = await getRouteSensei(env, params);
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  const me = sensei.username === currentUser?.username;

  const allStudents = await getAllStudents(env, true);
  const recruitedStudentTiers = await getRecruitedStudentTiers(env, sensei.id);
  const allRaids = await raidRepository.getAll();
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
  const sensei = await getAuthenticator(env).isAuthenticated(request);
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
      {parties.length === 0 && (
        <p className="my-16 text-center">
          아직 등록한 공략 정보가 없어요
        </p>
      )}

      {me && <AddContentButton text="새로운 공략 추가하기" link="./edit/new" />}

      {parties.map((party) => (
        <PartyView
          key={`party-${party.uid}`}
          party={party}
          students={students}
          raids={raids}
          editable={me}
        />
      ))}
    </div>
  );
}
