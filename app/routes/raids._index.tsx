import dayjs from "dayjs";
import { redirect, data as routeData, type LoaderFunctionArgs } from "react-router";
import { graphql } from "~/graphql";
import { runQuery } from "~/lib/baql";
import { fetchCached } from "~/models/base";

const latestRaidQuery = graphql(`
  query LatestRaid($endAfter: ISO8601DateTime!) {
    raids(types: [total_assault, elimination], endAfter: $endAfter) {
      nodes { uid type name boss since until terrain attackType rankVisible }
    }
  }
`);

export const loader = async ({ context }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;

  const raidUid = await fetchCached(env, "latest-raid", async () => {
    const { data, error } = await runQuery(latestRaidQuery, { endAfter: new Date() });
    if (error || !data) {
      throw routeData(
        { error: { message: "총력전/대결전 정보를 찾을 수 없어요" } },
        { status: 404 },
      );
    }

    const latestRaid = data.raids.nodes.filter((raid) => raid.rankVisible).sort((a, b) => dayjs(a.since).diff(dayjs(b.since)))[0];
    if (!latestRaid) {
      throw routeData(
        { error: { message: "총력전/대결전 정보를 찾을 수 없어요" } },
        { status: 404 },
      );
    }
    return latestRaid.uid;
  }, 60 * 10);
  return redirect(`/raids/${raidUid}`);
};
