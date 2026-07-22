import { redirect } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import type { Sensei } from "~/models/sensei";

export async function requireAdmin(env: Env, request: Request, ctx: ExecutionContext): Promise<Sensei | Response> {
  const currentUser = await getActiveSensei(env, request, ctx);
  if (!currentUser) {
    return redirect("/unauthorized");
  }
  if (currentUser.role !== "admin") {
    return new Response(null, { status: 403 });
  }
  return currentUser;
}
