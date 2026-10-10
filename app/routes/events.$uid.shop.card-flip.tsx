import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useOutletContext } from "react-router";
import { CardFlipDetail } from "~/components/features/events/card-flip/CardFlipDetail";
import type { EventShopPlanContext } from "~/components/features/events/shop/ShopCalculatorScreen";
import { cardFlipLocale } from "~/locales/ko";
import { getEventMetadata, getEventMinigameType } from "~/models/event-content";

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const timelineUid = params.uid;
  if (!timelineUid) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env, ctx } = context.cloudflare;
  const metadata = await getEventMetadata(env, timelineUid, ctx);
  if (!metadata) {
    throw new Response("Not Found", { status: 404 });
  }

  const minigameType = await getEventMinigameType(env, metadata);
  if (minigameType !== "card_flip") {
    throw new Response("Not Found", { status: 404 });
  }

  return { eventName: metadata.name, eventUid: timelineUid };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  const title = `${loaderData?.eventName ?? "이벤트"} - ${cardFlipLocale.menuTitle}`;
  return [{ title: `${title} | 몰루로그` }];
};

export default function EventCardFlipDetailRoute() {
  const { eventUid } = useLoaderData<typeof loader>();
  const plan = useOutletContext<EventShopPlanContext>();
  return <CardFlipDetail eventUid={eventUid} plan={plan} />;
}
