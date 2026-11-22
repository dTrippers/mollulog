import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { getEventMetadata } from "~/models/event-content";

export async function loader({ context, params, request }: LoaderFunctionArgs) {
  const uid = params.uid;
  if (!uid) throw new Response("Not Found", { status: 404 });
  const metadata = await getEventMetadata(context.cloudflare.env, uid, context.cloudflare.ctx);
  if (!metadata) throw new Response("Not Found", { status: 404 });
  if (metadata.contentType === "live") {
    const url = new URL(request.url);
    return redirect(`/lives/${uid}${url.search}`, { status: 301 });
  }
  throw new Response("Not Found", { status: 404 });
}
