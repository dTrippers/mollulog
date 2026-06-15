import { type LoaderFunctionArgs, redirect } from "react-router";
import { createPageErrorBoundary } from "~/components/features/layout";
import { routeError } from "~/lib/http-errors";
import { RaidRepository } from "~/repositories";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const raidRepository = new RaidRepository(env);

  const upcomingRaids = await raidRepository.getUpcoming();
  const latestRaid = upcomingRaids.find((schedule) => ["total_assault", "elimination"].includes(schedule.raidType));
  if (!latestRaid) {
    throw routeError(404, "raid.not_found", "예정된 총력전/대결전 정보를 찾을 수 없어요");
  }
  return redirect(`/raids/${latestRaid.raidType}/${latestRaid.seasonIndex}`);
};

export const ErrorBoundary = createPageErrorBoundary({
  title: "총력전 / 대결전",
  description: "일본 서버에서 개최된 총력전/대결전의 최상위권 편성, 통계, 공략 영상 정보를 확인할 수 있어요",
});
