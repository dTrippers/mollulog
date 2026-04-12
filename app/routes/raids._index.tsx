import { type LoaderFunctionArgs, redirect, data as routeData } from "react-router";
import { RaidRepository } from "~/repositories";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const raidRepository = new RaidRepository(env);

  const upcomingRaids = await raidRepository.getUpcoming();
  const latestRaid = upcomingRaids.find((schedule) => ["total_assault", "elimination"].includes(schedule.raidType));
  if (!latestRaid) {
    throw routeData({ error: { message: "예정된 총력전/대결전 정보를 찾을 수 없어요" } }, { status: 404 });
  }
  return redirect(`/raids/${latestRaid.raidType}/${latestRaid.seasonIndex}`);
};
