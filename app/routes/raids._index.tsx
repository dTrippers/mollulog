import { type LoaderFunctionArgs, redirect, data as routeData } from "react-router";
import { fetchCached } from "~/models/base";
import { getUpcomingRaidContents } from "~/models/content";
import { raidTypeToParam } from "~/models/raid";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;

  const redirectTarget = await fetchCached(
    env,
    "latest-raid-schedule::v2",
    async () => {
      const latestSchedule = (await getUpcomingRaidContents(env)).find(
        (content) => content.raidInfo && ["total_assault", "elimination"].includes(content.raidInfo.raidType),
      );

      if (!latestSchedule?.raidInfo) {
        throw routeData({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }, { status: 404 });
      }

      return `/raids/${raidTypeToParam(latestSchedule.raidInfo.raidType)}/${latestSchedule.raidInfo.seasonIndex}`;
    },
    60 * 10,
  );

  return redirect(redirectTarget);
};
