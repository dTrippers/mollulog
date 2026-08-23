import type { Params } from "react-router";
import type { IdentityRepositoryOptions } from "~/db/postgres/identity";
import { routeError } from "~/lib/http-errors";
import { getSenseiByUsername, isSenseiProfileVisibleTo, type Sensei } from "~/models/sensei";

export async function getRouteSensei(
  env: Env,
  params: Params<string>,
  viewerUserId?: number,
  options: IdentityRepositoryOptions = {},
): Promise<Sensei> {
  const usernameParam = params.username;
  if (!usernameParam?.startsWith("@")) {
    throw routeError(404, "sensei.not_found", "선생님을 찾을 수 없어요");
  }

  const username = usernameParam.replace("@", "");
  const sensei = await getSenseiByUsername(env, username, options);
  if (!sensei) {
    throw routeError(404, "sensei.not_found", "선생님을 찾을 수 없어요", { username });
  }
  if (!isSenseiProfileVisibleTo(sensei, viewerUserId)) {
    throw routeError(403, "sensei.profile_private", "이 프로필은 비공개예요", { username });
  }

  return sensei;
}
