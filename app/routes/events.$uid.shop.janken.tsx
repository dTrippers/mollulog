import {
  type LoaderFunctionArgs,
  type MetaFunction,
  redirect,
  type ShouldRevalidateFunction,
  useLoaderData,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { isEventShopStateSubmission } from "~/lib/revalidation";
import { jankenLocale } from "~/locales/ko";
import { getEventMetadata, getEventMinigameType } from "~/models/event-content";
import JankenScreen from "./events.$uid._components/JankenScreen";

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const eventUid = params.uid;
  if (!eventUid) throw new Response("Not Found", { status: 404 });
  const { env, ctx } = context.cloudflare;
  const metadata = await getEventMetadata(env, eventUid, ctx);
  if (metadata?.contentType === "live")
    return redirect(`/lives/${eventUid}${new URL(request.url).search}`, { status: 301 });
  if (!metadata || (await getEventMinigameType(env, metadata)) !== "janken")
    throw new Response("Not Found", { status: 404 });
  const sensei = await getActiveSensei(env, request, ctx);
  return {
    eventUid,
    eventName: metadata.name,
    signedIn: Boolean(sensei),
    inventoryDate: new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }),
  };
};

export const shouldRevalidate: ShouldRevalidateFunction = (args) =>
  !isEventShopStateSubmission(args) && args.defaultShouldRevalidate;

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.eventName ?? "이벤트"} - ${jankenLocale.pageTitle} | 몰루로그` },
];
export const handle = { v2Width: "wide" } as const;

export default function EventJankenRoute() {
  const data = useLoaderData<typeof loader>();
  return <JankenScreen loaderData={data} />;
}
