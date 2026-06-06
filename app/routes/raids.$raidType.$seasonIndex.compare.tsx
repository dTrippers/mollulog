import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import RaidDifficultyComparison from "~/components/features/raids/RaidDifficultyComparison";
import RaidStudentComparison from "~/components/features/raids/RaidStudentComparison";
import { EmptyView, LoadingSkeleton, Section } from "~/components/primitives";
import type { Defense } from "~/graphql/graphql";
import { fetchRaidOverview } from "~/lib/ranks/overview";
import { fetchRaidStatisticsByRaid } from "~/lib/ranks/stats";
import { type defenseTypeColor, defenseTypeLocale, difficultyLocale, type raidTypeLocale } from "~/locales/ko";
import type { RaidType } from "~/models/content.d";
import { getRaidDefenseTypeSetKey } from "~/models/raid";
import { getAllStudentsMap } from "~/models/student";
import { RaidRepository } from "~/repositories";
import RaidComparisonHeader from "./raids.$raidType.$seasonIndex._components/RaidComparisonHeader";

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const { raidType, seasonIndex } = params;
  const raidRepository = new RaidRepository(env);
  if (!raidType || !seasonIndex) {
    throw new Response(JSON.stringify({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsedSeasonIndex = Number.parseInt(seasonIndex, 10);
  if (Number.isNaN(parsedSeasonIndex)) {
    throw new Response(JSON.stringify({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const fromRaidUid = url.searchParams.get("from");
  const defenseTypeParam = url.searchParams.get("defenseType");
  const defenseTypeSetParam = url.searchParams.get("defenseTypeSet");

  if (!fromRaidUid) {
    throw new Response(JSON.stringify({ error: { message: "비교할 총력전/대결전을 선택해주세요" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!defenseTypeParam) {
    throw new Response(JSON.stringify({ error: { message: "방어 타입을 선택해주세요" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [toSchedule, fromSchedule, rawAllStudents] = await Promise.all([
    raidRepository.getByTypeAndSeason(raidType, parsedSeasonIndex),
    raidRepository.getSchedule(fromRaidUid),
    getAllStudentsMap(env, true),
  ]);

  if (!toSchedule || !fromSchedule) {
    throw new Response(JSON.stringify({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  if (toSchedule.startAt && fromSchedule.startAt && dayjs(toSchedule.startAt).isAfter(dayjs(fromSchedule.startAt))) {
    return { toRaid: toSchedule, fromRaid: fromSchedule, allStudents, defenseType: defenseTypeParam, defenseTypeSet: defenseTypeSetParam };
  }
  return {
    toRaid: fromSchedule,
    fromRaid: toSchedule,
    allStudents,
    defenseType: defenseTypeParam,
    defenseTypeSet: defenseTypeSetParam,
  };
};

export default function RaidCompare() {
  const {
    fromRaid,
    toRaid,
    allStudents,
    defenseType: loaderDefenseType,
    defenseTypeSet: loaderDefenseTypeSet,
  } = useLoaderData<typeof loader>();

  const [currentOverview, setCurrentOverview] = useState<{
    clearLevels: Record<string, number>;
    studentStats: { studentUid: string; slotsCount: number; assistsCount: number }[];
  } | null>(null);
  const [fromOverview, setFromOverview] = useState<{
    clearLevels: Record<string, number>;
    studentStats: { studentUid: string; slotsCount: number; assistsCount: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const toJp = toRaid.jpSchedule?.seasonIndex ?? null;
    const fromJp = fromRaid.jpSchedule?.seasonIndex ?? null;
    if (toJp === null || fromJp === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const defenseType = loaderDefenseType as Defense;

        const toDefenseTypeSet = getDefenseTypeSet(toRaid, loaderDefenseTypeSet, defenseType);
        const fromDefenseTypeSet = getDefenseTypeSet(fromRaid, null, defenseType);

        if (!toDefenseTypeSet || !fromDefenseTypeSet) {
          setError("비교할 수 있는 방어 타입이 없어요");
          setLoading(false);
          return;
        }

        // Load both overviews and statistics in parallel
        const [currentOverviewData, fromOverviewData, currentStats, fromStats] = await Promise.all([
          fetchRaidOverview({
            raidType: toRaid.raidType as RaidType,
            season: toJp,
            defenseType,
          }),
          fetchRaidOverview({
            raidType: fromRaid.raidType as RaidType,
            season: fromJp,
            defenseType,
          }),
          fetchRaidStatisticsByRaid(toRaid.raidType as RaidType, toJp, defenseType),
          fetchRaidStatisticsByRaid(fromRaid.raidType as RaidType, fromJp, defenseType),
        ]);

        if (cancelled) {
          return;
        }

        // Convert clear levels
        const currentClearLevels: Record<string, number> = {};
        if (currentOverviewData.clearLevels) {
          for (const [difficulty, count] of Object.entries(currentOverviewData.clearLevels)) {
            currentClearLevels[difficulty] = Number(count);
          }
        }

        const fromClearLevels: Record<string, number> = {};
        if (fromOverviewData.clearLevels) {
          for (const [difficulty, count] of Object.entries(fromOverviewData.clearLevels)) {
            fromClearLevels[difficulty] = Number(count);
          }
        }

        // Convert student statistics
        setCurrentOverview({
          clearLevels: currentClearLevels,
          studentStats: currentStats.map((stat) => ({
            studentUid: stat.studentUid,
            slotsCount: stat.slotsCount,
            assistsCount: stat.assistsCount,
          })),
        });

        setFromOverview({
          clearLevels: fromClearLevels,
          studentStats: fromStats.map((stat) => ({
            studentUid: stat.studentUid,
            slotsCount: stat.slotsCount,
            assistsCount: stat.assistsCount,
          })),
        });

        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load comparison data");
        setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [fromRaid, loaderDefenseType, loaderDefenseTypeSet, toRaid]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <EmptyView text={`오류가 발생했어요: ${error}`} />;
  }

  if (!currentOverview || !fromOverview) {
    return <EmptyView text="비교 데이터를 준비중이에요" />;
  }

  const defenseType = loaderDefenseType as Defense;
  const currentDefenseTypeSet = getDefenseTypeSet(toRaid, loaderDefenseTypeSet, defenseType);
  const fromDefenseTypeSet = getDefenseTypeSet(fromRaid, null, defenseType);
  const currentDifficulty = currentDefenseTypeSet?.difficulty ?? null;
  const fromDifficulty = fromDefenseTypeSet?.difficulty ?? null;
  const defenseTypeLabel = currentDefenseTypeSet
    ? currentDefenseTypeSet.defenseTypes.map((dt) => defenseTypeLocale[dt]).join(" / ")
    : defenseTypeLocale[defenseType];

  return (
    <div>
      <RaidComparisonHeader
        fromRaid={fromRaid as typeof fromRaid & { raidType: keyof typeof raidTypeLocale }}
        toRaid={toRaid as typeof toRaid & { raidType: keyof typeof raidTypeLocale }}
        defenseType={defenseType as keyof typeof defenseTypeColor}
        defenseTypeLabel={defenseTypeLabel}
        fromDifficulty={fromDifficulty}
        currentDifficulty={currentDifficulty}
      />

      <Section title="난이도별 클리어 비율 증감" description="과거 시즌 대비 난이도별 클리어 비율 변화">
        <RaidDifficultyComparison
          currentClearLevels={currentOverview.clearLevels}
          fromClearLevels={fromOverview.clearLevels}
        />
      </Section>

      <Section title="학생별 출전 횟수 증감" description="과거 시즌 대비 학생별 출전 횟수 변화">
        <RaidStudentComparison
          currentStudentStats={currentOverview.studentStats}
          fromStudentStats={fromOverview.studentStats}
          allStudents={allStudents}
        />
      </Section>
    </div>
  );
}

type RaidWithDefenseTypeSets = {
  defenseTypeSets: Array<{
    difficulty: string | null;
    defenseTypes: Defense[];
    primaryDefenseType: Defense;
  }>;
};

function getDefenseTypeSet(
  raid: RaidWithDefenseTypeSets,
  defenseTypeSetKey: string | null,
  primaryDefenseType: Defense,
) {
  return (
    raid.defenseTypeSets.find((defenseTypeSet) => getRaidDefenseTypeSetKey(defenseTypeSet) === defenseTypeSetKey) ??
    raid.defenseTypeSets.find((defenseTypeSet) => defenseTypeSet.primaryDefenseType === primaryDefenseType) ??
    null
  );
}
