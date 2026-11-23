import { type Params, redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { routeError } from "~/lib/http-errors";

// The add, edit, and table screens are the owner's own. A signed-out visitor goes to sign in; a signed-in visitor of
// another profile goes to the same screen of their own profile.
export async function requireRaidRecordOwner(
  env: Env,
  ctx: ExecutionContext,
  request: Request,
  params: Params<string>,
  ownPath: string,
) {
  const sensei = await getActiveSensei(env, request, ctx);
  if (!sensei) throw redirect("/unauthorized");
  const usernameParam = params.username;
  if (!usernameParam?.startsWith("@")) throw routeError(404, "sensei.not_found", "선생님을 찾을 수 없어요");
  if (usernameParam.slice(1) !== sensei.username) {
    throw redirect(`/my?path=${encodeURIComponent(ownPath)}`);
  }
  return sensei;
}
