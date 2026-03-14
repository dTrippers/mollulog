import type { ActionFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { Form, useLoaderData } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { Title } from "~/components/primitives";
import PartyGenerator from "./$username.parties._components/PartyGenerator";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { updateParty, getUserParties, createParty } from "~/models/party";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";

export const raidForPartyEditQuery = graphql(`
  query RaidForPartyEdit {
    raids {
      nodes { uid name type boss terrain since until }
    }
  }
`);

export const meta: MetaFunction = () => [
  { title: "편성/공략 관리 | 몰루로그" },
];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  let party = null;
  if (params.id) {
    party = (await getUserParties(env, sensei.username)).find((p) => p.uid === params.id) ?? null;
  }

  const { data } = await runQuery(raidForPartyEditQuery, {});
  if (!data) {
    throw "failed to load data";
  }

  return {
    allStudents: (await getAllStudents(env, true)).sort((a, b) => a.order - b.order),
    recruitedStudentTiers: await getRecruitedStudentTiers(env, sensei.id),
    raids: data.raids.nodes.sort((a, b) => new Date(b.since).getTime() - new Date(a.since).getTime()),
    party,
  };
};

export const action: ActionFunction = async ({ context, request }) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  const formData = await request.formData();
  const raidId = formData.get("raidId");
  const partyPatches = {
    name: formData.get("name") as string,
    studentIds: JSON.parse(formData.get("studentIds") as string),
    raidId: raidId ? raidId as string : null,
    showAsRaidTip: formData.get("showAsRaidTip") === "true",
    memo: formData.get("memo") as string | null,
  };

  const uid = formData.get("uid");
  if (!uid) {
    await createParty(env, sensei, partyPatches);
  } else {
    await updateParty(env, sensei, uid as string, partyPatches);
  }

  return redirect("/my?path=parties");
};

export default function EditParties() {
  const loaderData = useLoaderData<typeof loader>();

  return (
    <>
      <Title text="편성/공략 관리" />
      <Form method="post">
        {loaderData.party && <input type="hidden" name="uid" value={loaderData.party.uid} />}
        <div className="max-w-4xl">
          <PartyGenerator
            party={loaderData.party ?? undefined}
            raids={loaderData.raids.map((raid) => ({ ...raid, since: new Date(raid.since), until: new Date(raid.until) }))}
            students={loaderData.allStudents.map((student) => ({
              ...student,
              tier: loaderData.recruitedStudentTiers[student.uid],
            }))}
          />
        </div>
      </Form>
    </>
  );
}
