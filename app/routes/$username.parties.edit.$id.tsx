import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";

export const meta: MetaFunction = () => [{ title: "편성/공략 관리 | 몰루로그" }];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  return redirect(params.id === "new" ? "/timelines/new" : `/@${sensei.username}/parties`);
};

export const action = async ({ context, request }: ActionFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) {
    return redirect("/unauthorized");
  }
  return redirect("/timelines/new");
};

export default function EditParties() {
  return null;
}
