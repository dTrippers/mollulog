import { type LoaderFunctionArgs, redirect, useRouteError } from "react-router";
import { ErrorPage, Page, ServerErrorPage } from "~/components/features/layout";
import { routeError } from "~/lib/http-errors";
import { isServerRouteError, normalizeRouteError } from "~/lib/route-error";
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

export function ErrorBoundary() {
  const error = useRouteError();
  const normalized = normalizeRouteError(error);

  if (isServerRouteError(normalized)) {
    return (
      <ServerErrorPage
        status={normalized.status}
        title={normalized.title}
        message={normalized.message}
      />
    );
  }

  return (
    <Page
      title="총력전 정보"
      description="일본 서버에서 개최된 총력전/대결전의 최상위권 편성, 통계, 공략 영상 정보를 확인할 수 있어요"
    >
      <ErrorPage
        status={normalized.status}
        title={normalized.title}
        message={normalized.message}
      />
    </Page>
  );
}
