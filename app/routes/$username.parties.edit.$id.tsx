import type { ActionFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { Form, useLoaderData } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { Title } from "~/components/primitives";
import PartyGenerator from "./$username.parties._components/PartyGenerator";
import {
  createParty,
  getUserParties,
  parsePartyRaidReference,
  updateParty,
} from "~/models/party";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";
import { RaidRepository } from "~/repositories";

export const meta: MetaFunction = () => [
  { title: "편성/공략 관리 | 몰루로그" },
];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const env = context.cloudflare.env;
  const raidRepository = new RaidRepository(env);
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }

  let party = null;
  if (params.id) {
    party = (await getUserParties(env, sensei.username)).find((p) => p.uid === params.id) ?? null;
  }

  return {
    allStudents: (await getAllStudents(env, true)).sort((a, b) => a.order - b.order),
    recruitedStudentTiers: await getRecruitedStudentTiers(env, sensei.id),
    raids: (await raidRepository.getAll()).sort(
      (a, b) => new Date(b.startAt as Date).getTime() - new Date(a.startAt as Date).getTime(),
    ),
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
  const selectedRaid = parsePartyRaidReference(formData.get("raid"));
  const showAsRaidTip = formData.has("showAsRaidTip") ? formData.get("showAsRaidTip") === "true" : undefined;
  const partyPatches = {
    name: formData.get("name") as string,
    studentIds: JSON.parse(formData.get("studentIds") as string),
    raidType: selectedRaid?.raidType ?? null,
    seasonIndex: selectedRaid?.seasonIndex ?? null,
    showAsRaidTip,
    memo: formData.get("memo") as string | null,
  };

  const uid = formData.get("uid");
  if (!uid) {
    await createParty(env, sensei, {
      ...partyPatches,
      showAsRaidTip: showAsRaidTip ?? false,
    });
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
            raids={loaderData.raids}
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
