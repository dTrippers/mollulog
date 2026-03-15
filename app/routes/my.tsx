import type { LoaderFunction } from "react-router";
import { redirect } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";

export const loader: LoaderFunction = async ({ request, context }) => {
  const sensei = await getAuthenticator(context.cloudflare.env).isAuthenticated(request);
  if (sensei) {
    const url = new URL(request.url);
    return redirect(`/@${sensei.username}/${url.searchParams.get("path") ?? ""}`);
  }

  return redirect("/unauthorized");
}
