import { Outlet, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { getRaidDetail, raidTypeToParam } from "~/models/raid";
import { RaidRepository } from "~/repositories";

// Valid URL path params (dash-format)
const VALID_URL_PARAMS = ["total-assault", "grand-assault", "unlimit", "allied"];

export const loader = async ({ context, params }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const { raidType, seasonIndex } = params;
  const raidRepository = new RaidRepository(env);

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

  // Treat as old Raid uid → look up and redirect to new URL
  const oldRaid = await getRaidDetail(env, raidType);
  if (!oldRaid) {
    throw new Response(
      JSON.stringify({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const allSchedules = await raidRepository.getAll();
  const matchingSchedule = allSchedules.find(
    (s) => s.raidType === oldRaid.type && s.jpSchedule?.seasonIndex === oldRaid.raidIndexJp,
  );

  if (matchingSchedule) {
    return redirect(`/raids/${raidTypeToParam(matchingSchedule.raidType)}/${matchingSchedule.seasonIndex}`, 301);
  }

  return redirect("/raids", 302);
};

export default function RaidTypeLayout() {
  return <Outlet />;
}
