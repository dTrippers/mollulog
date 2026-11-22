import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { RoadPuzzleViewerPage } from "~/components/features/events/road-puzzle/RoadPuzzleViewerPage";
import { socialMeta } from "~/lib/seo";
import { roadPuzzleLocale } from "~/locales/ko";
import { getEventMetadata, getEventMinigameType, getEventShopContentForMetadata } from "~/models/event-content";

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
  if (minigameType !== "road_puzzle") {
    throw new Response("Not Found", { status: 404 });
  }

  const eventContent = await getEventShopContentForMetadata(env, metadata);
  const minigameConfig = eventContent?.minigameConfig;
  const config = minigameConfig?.minigameType === "road_puzzle" ? (minigameConfig.roadPuzzle ?? null) : null;
  const payment = minigameConfig?.minigameType === "road_puzzle" ? minigameConfig.payment : null;

  return { eventName: metadata.name, config, payment };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData, location }) => {
  const title = `${loaderData?.eventName ?? "이벤트"} - ${roadPuzzleLocale.title}`;
  const description = roadPuzzleLocale.menuDescription;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    ...socialMeta({ title, description, pathname: location.pathname }),
  ];
};

export default function EventRoadPuzzleRoute() {
  const { config, payment } = useLoaderData<typeof loader>();
  return <RoadPuzzleViewerPage config={config} payment={payment} />;
}
