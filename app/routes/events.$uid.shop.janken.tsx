import {
  type LoaderFunctionArgs,
  type MetaFunction,
  redirect,
  type ShouldRevalidateFunction,
  useLoaderData,
} from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { getJankenStudentGrowthUid } from "~/domain/event-shop/janken";
import { buildEventShopStateIdentity } from "~/domain/event-shop-state-key";
import { isEventShopStateSubmission } from "~/lib/revalidation";
import { jankenLocale } from "~/locales/ko";
import { getEventMetadata, getEventMinigameType, getEventShopContent } from "~/models/event-content";
import { getPlannerState } from "~/models/planner-state";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";
import { getUserResourceInventoryMapByItemUids } from "~/models/user-resource-inventory";
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
  const content = await getEventShopContent(env, eventUid, false, ctx);
  const sensei = await getActiveSensei(env, request, ctx);
  const shopStateUid = buildEventShopStateIdentity({
    timelineUid: eventUid,
    shopContentUid: metadata.shopContentUid,
  }).shopStateUid;
  const savedEntry = sensei
    ? ((await getPlannerState(env, sensei.id, { ctx })).jankenProgress[shopStateUid] ?? null)
    : null;
  const config = content?.minigameConfig?.minigameType === "janken" ? content.minigameConfig.janken : null;
  const students = config?.status === "available" ? await getAllStudents(env, true) : [];
  const studentGrowthUid =
    config?.status === "available"
      ? getJankenStudentGrowthUid(
          config,
          students.map(({ uid }) => uid),
        )
      : null;
  const recruited = sensei && studentGrowthUid ? await getRecruitedStudents(env, sensei.id, [studentGrowthUid]) : [];
  const recruitedStudent = studentGrowthUid
    ? recruited.find((student) => student.studentUid === studentGrowthUid)
    : null;
  const targetStudent = studentGrowthUid ? students.find((student) => student.uid === studentGrowthUid) : null;
  const inventory =
    sensei && studentGrowthUid ? await getUserResourceInventoryMapByItemUids(env, sensei.id, [studentGrowthUid]) : {};
  return {
    eventUid,
    eventName: metadata.name,
    shopStateUid,
    signedIn: Boolean(sensei),
    entry: savedEntry,
    config,
    studentGrowthUid,
    recruitedStudent: recruitedStudent != null,
    inventoryDate: new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }),
    defaultProgress: {
      currentTier: recruitedStudent?.tier ?? targetStudent?.initialTier ?? 1,
      heldEleph: studentGrowthUid ? (inventory[studentGrowthUid] ?? 0) : 0,
    },
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
