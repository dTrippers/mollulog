import dayjs from "dayjs";
import { redirect, data as routeData, type LoaderFunctionArgs } from "react-router";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "~/models/base";
import { raidTypeToParam } from "~/models/raid";

const latestRaidScheduleQuery = graphql(`
  query LatestRaidSchedule($endAfter: ISO8601DateTime!) {
    raidSchedules(region: "gl", endAfter: $endAfter) {
      nodes { uid raidType seasonIndex jpSchedule { uid seasonIndex } }
    }
  }
`);

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;

  const redirectTarget = await fetchCached(env, "latest-raid-schedule", async () => {
    const { data, error } = await runQuery(latestRaidScheduleQuery, { endAfter: new Date() });
    if (error || !data) {
      throw routeData(
        { error: { message: "총력전/대결전 정보를 찾을 수 없어요" } },
        { status: 404 },
      );
    }

    const latestSchedule = data.raidSchedules.nodes
      .filter((s) => ["total_assault", "elimination"].includes(s.raidType) && s.jpSchedule !== null)
      .sort((a, b) => a.seasonIndex - b.seasonIndex)[0];

    if (!latestSchedule) {
      throw routeData(
        { error: { message: "총력전/대결전 정보를 찾을 수 없어요" } },
        { status: 404 },
      );
    }
    return `/raids/${raidTypeToParam(latestSchedule.raidType)}/${latestSchedule.seasonIndex}`;
  }, 60 * 10);

  return redirect(redirectTarget);
};
