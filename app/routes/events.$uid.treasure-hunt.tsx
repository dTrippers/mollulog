import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { TreasureHuntSimulator } from "~/components/features/events/treasure-hunt/TreasureHuntSimulator";
import { treasureHuntLocale } from "~/locales/ko";
import { getEventMetadata, getEventShopContentForMetadata } from "~/models/event-content";

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

  const eventContent = await getEventShopContentForMetadata(env, metadata);
  const minigameConfig = eventContent?.minigameConfig;
  if (minigameConfig?.minigameType !== "treasure_hunt") {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    eventName: metadata.name,
    eventUid: timelineUid,
    treasureHunt: minigameConfig.treasureHunt ?? null,
  };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  const title = `${loaderData?.eventName ?? "이벤트"} - ${treasureHuntLocale.simulatorTitle}`;
  return [{ title: `${title} | 몰루로그` }, { name: "description", content: treasureHuntLocale.simulatorDescription }];
};

export default function EventTreasureHuntSimulatorRoute() {
  const { eventUid, treasureHunt } = useLoaderData<typeof loader>();
  return <TreasureHuntSimulator eventUid={eventUid} config={treasureHunt} />;
}
