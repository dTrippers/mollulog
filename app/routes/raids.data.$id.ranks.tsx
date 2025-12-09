import type { ActionFunctionArgs } from "react-router";
import { getAuthenticator } from "~/auth/authenticator.server";
import { graphql } from "~/graphql";
import type { Defense, RaidRank } from "~/graphql/graphql";
import { runQuery } from "~/lib/baql";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudents } from "~/models/student";
import { RaidRankFilterState } from "~/components/raids/RaidRankFilter";

const raidRanksQuery = graphql(`
  query RaidRanks($defenseType: Defense, $raidUid: String!, $includeStudents: [RaidRankFilter!], $excludeStudents: [RaidRankFilter!], $rankAfter: Int, $rankBefore: Int) {
    raid(uid: $raidUid) {
      rankVisible
      ranks(defenseType: $defenseType, first: 11, rankAfter: $rankAfter, rankBefore: $rankBefore, includeStudents: $includeStudents, excludeStudents: $excludeStudents) {
        rank score
        parties {
          partyIndex
          slots {
            slotIndex tier level isAssist
            student { uid name attackType defenseType role }
          }
        }
        video { youtubeId }
      }
    }
  }
`);

export type RaidRanksData = {
  rankVisible: boolean;
  ranks: RaidRank[];
  hasMore: boolean;
};

// @deprecated
export const action = async ({ request, context, params }: ActionFunctionArgs) => {
  const raidUid = params.id;
  if (!raidUid) {
    throw new Response("Raid ID is required", { status: 400 });
  }

  const filter = await request.json<RaidRankFilterState>();

  let excludeStudentUids: { uid: string; tiers: number[] }[] = filter.excludeStudents;
  if (filter.filterNotOwned) {
    const sensei = await getAuthenticator(context.cloudflare.env).isAuthenticated(request);
    if (sensei) {
      const allStudents = await getAllStudents(context.cloudflare.env);
      const recruitedStudentTiers = await getRecruitedStudentTiers(context.cloudflare.env, sensei.id);
      const unrecruitedStudentUids = allStudents
        .filter((student) => !recruitedStudentTiers[student.uid])
        .map((student) => student.uid);
      excludeStudentUids = excludeStudentUids.concat(unrecruitedStudentUids.map((uid) => ({ uid, tiers: [3, 4, 5, 6, 7, 8, 9] })));
    }
  }

  const { data, error } = await runQuery(raidRanksQuery, {
    raidUid,
    defenseType: filter.defenseType ? (filter.defenseType as Defense) : null,
    includeStudents: filter.includeStudents,
    excludeStudents: excludeStudentUids,
    rankAfter: filter.rankAfter,
    rankBefore: filter.rankBefore,
  });
  if (error || !data?.raid?.ranks) {
    return { error: error?.message ?? "순위 정보를 가져오는 중 오류가 발생했어요" };
  }

  return {
    rankVisible: data.raid.rankVisible,
    ranks: filter.rankBefore && data.raid.ranks.length > 10 ? data.raid.ranks.slice(1, 11) : data.raid.ranks.slice(0, 10),
    hasMore: data.raid.ranks.length === 11,
  };
};
