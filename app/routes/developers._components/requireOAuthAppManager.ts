import { redirect } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getSenseiById } from "~/models/sensei";

export async function requireOAuthAppManager(env: Env, request: Request, ctx?: ExecutionContext): Promise<number | Response> {
  const sessionSensei = await getAuthenticator(env, ctx).isAuthenticated(request);
  if (!sessionSensei) return redirect("/developers", { headers: { "Cache-Control": "private, no-store" } });
  if (!sessionSensei.active) return redirect("/unauthorized", { headers: { "Cache-Control": "private, no-store" } });
  const current = await getSenseiById(env, sessionSensei.id, { ctx });
  if (!current?.active) return redirect("/unauthorized", { headers: { "Cache-Control": "private, no-store" } });
  if (current.role !== "app_developer" && current.role !== "admin") {
    return redirect("/developers", { headers: { "Cache-Control": "private, no-store" } });
  }
  return current.id;
}
