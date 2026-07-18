import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { WalkthroughTimelineList } from "~/components/features/walkthrough-timeline";
import { getPostgresWalkthroughTimelineLikeSummaries } from "~/db/postgres/walkthrough-timeline-likes";
import { listPostgresWalkthroughTimelinesByUser } from "~/db/postgres/walkthrough-timelines";
import { getRouteSensei } from "./$username";

export const meta: MetaFunction = ({ params }) => [
  { title: `${params.username ?? ""} - 공략 타임라인 | 몰루로그`.trim() },
];

export const loader = async ({ context, request, params }: LoaderFunctionArgs) => {
  const { env, ctx } = context.cloudflare;
  const [sensei, currentUser] = await Promise.all([getRouteSensei(env, params), getActiveSensei(env, request)]);
  const me = sensei.id === currentUser?.id;
  const timelines = await listPostgresWalkthroughTimelinesByUser(env, sensei.id, me, { ctx });
  const timelineUids = timelines.map((timeline) => timeline.uid);
  const engagementByUid = await getPostgresWalkthroughTimelineLikeSummaries(env, timelineUids, currentUser?.id, {
    ctx,
  });
  return {
    me,
    signedIn: currentUser !== null,
    timelines,
    engagementByUid,
  };
};

export default function UserWalkthroughTimelinesPage() {
  const { timelines, me, signedIn, engagementByUid } = useLoaderData<typeof loader>();
  return (
    <WalkthroughTimelineList
      timelines={timelines}
      engagementByUid={engagementByUid}
      signedIn={signedIn}
      showCreate={me}
    />
  );
}
