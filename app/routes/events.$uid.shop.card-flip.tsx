import { redirect, type LoaderFunctionArgs, type MetaFunction, type ShouldRevalidateFunction } from "react-router";
import { useLoaderData } from "react-router";
import { isEventShopStateSubmission } from "~/lib/revalidation";
import CardFlipScreen from "./events.$uid._components/CardFlipScreen";
import { cardFlipLocale } from "~/locales/ko";
import { getEventMetadata, getEventMinigameType } from "~/models/event-content";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const eventUid = params.uid;
  if (!eventUid) throw new Response("Not Found", { status: 404 });
  const { env, ctx } = context.cloudflare;
  const metadata = await getEventMetadata(env, eventUid, ctx);
  if (metadata?.contentType === "live")
    return redirect(`/lives/${eventUid}${new URL(request.url).search}`, { status: 301 });
  if (!metadata || (await getEventMinigameType(env, metadata)) !== "card_flip") {
    throw new Response("Not Found", { status: 404 });
  }
  return { eventName: metadata.name };
};

// Shop state submissions never change the event metadata this loader reads.
export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  !isEventShopStateSubmission(args) && args.defaultShouldRevalidate;

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = `${data?.eventName ?? "이벤트"} - ${cardFlipLocale.menuTitle}`;
  return [{ title: `${title} | 몰루로그` }];
};

export default function EventCardFlipDetailRoute() {
  useLoaderData<typeof loader>();
  return <CardFlipScreen />;
}
