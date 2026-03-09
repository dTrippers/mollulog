import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { flushCacheAll } from "~/models/base";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const currentUser = await getAuthenticator(env).isAuthenticated(request);
  if (!currentUser) {
    return redirect("/unauthorized");
  }
  if (currentUser.role !== "admin") {
    return new Response(null, { status: 403 });
  }

  const command = params.command;
  if (command === "flush") {
    await flushCacheAll(env);
    return { success: true, command };
  }

  return new Response(
    JSON.stringify(
      { success: false, error: `Unsupported command: ${command}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

