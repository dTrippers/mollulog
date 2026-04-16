import type { LoaderFunction } from "react-router";
import { redirect } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { getSenseiById } from "~/models/sensei";

export const loader: LoaderFunction = async ({ request, context }) => {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (sensei) {
    const url = new URL(request.url);
    const latestSensei = await getSenseiById(env, sensei.id);
    if (!latestSensei) {
      return redirect("/unauthorized");
    }

    const path = url.searchParams.get("path")?.replace(/^\/+|\/+$/g, "") ?? "";
    return redirect(path ? `/@${latestSensei.username}/${path}` : `/@${latestSensei.username}`);
  }

  return redirect("/unauthorized");
}
