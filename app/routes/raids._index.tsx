import { type LoaderFunctionArgs, redirect, data as routeData } from "react-router";
import { fetchCached } from "~/models/base";
import { getUpcomingRaidSchedules, raidTypeToParam } from "~/models/raid";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;

  const redirectTarget = await fetchCached(
    env,
    "latest-raid-schedule::v3",
    async () => {
      const latestSchedule = (await getUpcomingRaidSchedules(env)).find(
        (schedule) => ["total_assault", "elimination"].includes(schedule.raidType),
      );

      if (!latestSchedule) {
        throw routeData({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }, { status: 404 });
      }

      return `/raids/${raidTypeToParam(latestSchedule.raidType)}/${latestSchedule.seasonIndex}`;
    },
    60 * 10,
  );

  return redirect(redirectTarget);
};
