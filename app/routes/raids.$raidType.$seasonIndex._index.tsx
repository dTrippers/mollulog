import { useEffect, useMemo, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RaidListItem } from "~/components/features/raids";
import { EmptyView, HorizontalScroll, LoadingSkeleton, SubTitle } from "~/components/primitives";
import { raidTypeToParam } from "~/domain/raid";
import { getSameOccurrenceRaids } from "~/domain/raid-group";
import { fetchRaidOverview } from "~/lib/ranks/overview";
import type { RaidType } from "~/models/content.d";
import { getRaidDefenseTypeSetKey } from "~/models/raid";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudentsMap } from "~/models/student";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";
import RaidScoreHistogram from "./raids.$raidType.$seasonIndex._components/RaidScoreHistogram";
import RaidUnavailableState from "./raids.$raidType.$seasonIndex._components/RaidUnavailableState";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const [rawAllStudents, sensei] = await Promise.all([getAllStudentsMap(env, true), getActiveSensei(env, request)]);
  const allStudents = Object.fromEntries(
    Object.entries(rawAllStudents).map(([uid, student]) => [
      uid,
      {
        name: student.name,
        role: student.role,
        attackType: student.attackType,
        defenseType: student.defenseType,
      },
    ]),
  );
  const recruitedStudentTiers = sensei ? await getRecruitedStudentTiers(env, sensei.id) : {};

  return {
    allStudents,
    recruitedStudentTiers,
    hasRecruitedStudentData: sensei !== null,
  };
};

export default function RaidSummary() {
  const { currentRaid, allRaids, defenseType, defenseTypeSet } = useOutletContext<RaidPageContext>();
  const { allStudents, recruitedStudentTiers, hasRecruitedStudentData } = useLoaderData<typeof loader>();
  const raidPath = `/raids/${raidTypeToParam(currentRaid.raidType)}/${currentRaid.seasonIndex}`;

  // Past hostings of the same boss + terrain (excluding current raid)
  const sameBossRaids = useMemo(() => getSameOccurrenceRaids(allRaids, currentRaid), [allRaids, currentRaid]);

  const [clearLevels, setClearLevels] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const jpSeasonIndex = currentRaid.jpSchedule?.seasonIndex ?? null;

  useEffect(() => {
    if (jpSeasonIndex === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const overviewData = await fetchRaidOverview({
          raidType: currentRaid.raidType as RaidType,
          season: jpSeasonIndex,
          defenseType,
        });
        if (cancelled) {
          return;
        }

        // Convert clear_levels from string keys to numbers
        const clearLevelsMap: Record<string, number> = {};
        if (overviewData.clearLevels) {
          for (const [difficulty, count] of Object.entries(overviewData.clearLevels)) {
            clearLevelsMap[difficulty] = Number(count);
          }
        }
        setClearLevels(clearLevelsMap);

        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load statistics");
        setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [currentRaid.raidType, jpSeasonIndex, defenseType]);

  if (jpSeasonIndex === null) {
    return <RaidUnavailableState />;
  }

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <EmptyView text={`오류가 발생했어요: ${error}`} />;
  }

  const totalClearCount = clearLevels ? Object.values(clearLevels).reduce((sum, count) => sum + count, 0) : 0;
  if (!clearLevels || totalClearCount === 0) {
    return <EmptyView text="통계 정보를 준비중이에요" />;
  }

  return (
    <div className="space-y-4 py-4">
      <SubTitle
        text="플래티넘 통계"
        description="일본 서버 플래티넘 클리어 기준 편성 통계 정보를 확인해보세요."
        className="mt-0"
      />

      <RaidScoreHistogram
        raidType={currentRaid.raidType as RaidType}
        season={jpSeasonIndex}
        defenseType={defenseType}
        clearLevels={clearLevels}
        allStudents={allStudents}
        recruitedStudentTiers={recruitedStudentTiers}
        hasRecruitedStudentData={hasRecruitedStudentData}
      />

      {sameBossRaids.length > 0 && (
        <section className="pt-4">
          <SubTitle text="역대 개최 이력" description="동일 보스의 최근 총력전/대결전 개최 이력" />
          <HorizontalScroll itemWidth={{ mobile: "w-[86%]", desktop: "md:w-2/5" }} gap="gap-3">
            {sameBossRaids.map((raid) => {
              const hasMatchingDefenseType = raid.defenseTypeSets.some(
                ({ primaryDefenseType }) => primaryDefenseType === defenseType,
              );

              const actions = [
                { text: "시즌 정보", to: `/raids/${raidTypeToParam(raid.raidType)}/${raid.seasonIndex}` },
              ];
              if (hasMatchingDefenseType) {
                actions.push({
                  text: "비교",
                  to: `${raidPath}/compare?from=${raid.uid}&defenseType=${defenseType}&defenseTypeSet=${getRaidDefenseTypeSetKey(defenseTypeSet)}`,
                });
              }

              return (
                <RaidListItem
                  key={raid.uid}
                  raid={raid}
                  actions={actions}
                  className="border border-neutral-200 shadow-sm dark:border-neutral-700"
                />
              );
            })}
          </HorizontalScroll>
        </section>
      )}
    </div>
  );
}
