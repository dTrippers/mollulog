import { Outlet, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { raidTypeToParam } from "~/models/raid";

// Valid URL path params (dash-format)
const VALID_URL_PARAMS = ["total-assault", "grand-assault", "unlimit", "allied"];

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const { raidType, seasonIndex } = params;

  if (!raidType) {
    throw new Response(null, { status: 404 });
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

  throw new Response(
    JSON.stringify({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }),
    { status: 404, headers: { "Content-Type": "application/json" } },
  );
};

export default function RaidTypeLayout() {
  return <Outlet />;
}
