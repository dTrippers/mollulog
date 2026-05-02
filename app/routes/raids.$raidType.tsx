import { Outlet, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { createPageErrorBoundary } from "~/components/features/layout";
import { routeError } from "~/lib/http-errors";
import { raidTypeToParam } from "~/models/raid";

// Valid URL path params (dash-format)
const VALID_URL_PARAMS = ["total-assault", "grand-assault", "unlimit", "allied"];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { raidType, seasonIndex } = params;

  if (!raidType) {
    throw routeError(404, "raid.not_found", "총력전/대결전 정보를 찾을 수 없어요");
  }

  // Valid dash-format param → child route handles it
  if (VALID_URL_PARAMS.includes(raidType)) {
    return null;
  }

  // Old underscore/internal format (e.g. "total_assault", "elimination") → redirect to dash format
  const dashParam = raidTypeToParam(raidType);
  if (dashParam !== raidType) {
    const newPath = seasonIndex ? `/raids/${dashParam}/${seasonIndex}` : `/raids/${dashParam}`;
    return redirect(newPath, 301);
  }

  throw routeError(404, "raid.not_found", "총력전/대결전 정보를 찾을 수 없어요");
};

export default function RaidTypeLayout() {
  return <Outlet />;
}

export const ErrorBoundary = createPageErrorBoundary({
  title: "총력전 정보",
  description: "일본 서버에서 개최된 총력전/대결전의 최상위권 편성, 통계, 공략 영상 정보를 확인할 수 있어요",
});
