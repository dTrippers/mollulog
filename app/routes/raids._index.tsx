import { type LoaderFunctionArgs, redirect, data as routeData } from "react-router";
import { getUpcomingRaidSchedules } from "~/models/raid";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;

  const upcomingRaids = await getUpcomingRaidSchedules(env);
  const latestRaid = upcomingRaids.find((schedule) => ["total_assault", "elimination"].includes(schedule.raidType));
  if (!latestRaid) {
    throw routeData({ error: { message: "예정된 총력전/대결전 정보를 찾을 수 없어요" } }, { status: 404 });
  }
  return redirect(`/raids/${latestRaid.raidType}/${latestRaid.seasonIndex}`);
};
