import { useEffect, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import dayjs from "dayjs";
import { EmptyView, LoadingSkeleton, Section } from "~/components/primitives";
import { getAllStudentsMap } from "~/models/student";
import { fetchRaidStatisticsByRaid } from "~/models/raid-statistics.client";
import { fetchRaidOverview } from "~/models/raid-overview.client";
import { getRaidDetail } from "~/models/raid";
import { type defenseTypeColor, difficultyLocale, type raidTypeLocale } from "~/locales/ko";
import RaidDifficultyComparison from "~/components/features/raids/RaidDifficultyComparison";
import RaidStudentComparison from "~/components/features/raids/RaidStudentComparison";
import RaidComparisonHeader from "./raids.$id._components/RaidComparisonHeader";

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const currentRaidUid = params.id;
  if (!currentRaidUid) {
    throw new Response(
      JSON.stringify({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(request.url);
  const fromRaidUid = url.searchParams.get("from");
  const defenseTypeParam = url.searchParams.get("defenseType");
  
  if (!fromRaidUid) {
    throw new Response(
      JSON.stringify({ error: { message: "비교할 총력전/대결전을 선택해주세요" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!defenseTypeParam) {
    throw new Response(
      JSON.stringify({ error: { message: "방어 타입을 선택해주세요" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const [toRaid, fromRaid, rawAllStudents] = await Promise.all([
    getRaidDetail(env, currentRaidUid),
    getRaidDetail(env, fromRaidUid),
    getAllStudentsMap(env, true),
  ]);

  if (!toRaid || !fromRaid) {
    throw new Response(
      JSON.stringify({ error: { message: "총력전/대결전 정보를 찾을 수 없어요" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const allStudents = Object.fromEntries(Object.entries(rawAllStudents).map(([uid, student]) => [uid, {
    name: student.name,
    role: student.role,
    attackType: student.attackType,
    defenseType: student.defenseType,
  }]));

  if (dayjs(toRaid.since).isAfter(dayjs(fromRaid.since))) {
    return { toRaid, fromRaid, allStudents, defenseType: defenseTypeParam };
  }
  return {
    toRaid: fromRaid,
    fromRaid: toRaid,
    allStudents,
    defenseType: defenseTypeParam,
  };
};

export default function RaidCompare() {
  const { fromRaid, toRaid, allStudents, defenseType: loaderDefenseType } = useLoaderData<typeof loader>();

  const [currentOverview, setCurrentOverview] = useState<{
    clearLevels: Record<string, number>;
    studentStats: { studentUid: string; slotsCount: number; assistsCount: number; }[];
  } | null>(null);
  const [fromOverview, setFromOverview] = useState<{
    clearLevels: Record<string, number>;
    studentStats: { studentUid: string; slotsCount: number; assistsCount: number; }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!toRaid.rankVisible || !toRaid.raidIndexJp || !fromRaid.rankVisible || !fromRaid.raidIndexJp) {
      setLoading(false);
      return;
    }
    const toRaidIndexJp = toRaid.raidIndexJp;
    const fromRaidIndexJp = fromRaid.raidIndexJp;

    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Use defense type from query parameter
        const defenseType = loaderDefenseType as typeof toRaid.defenseTypes[number]["defenseType"];

        // Verify defense type exists in both raids
        const toHasDefenseType = toRaid.defenseTypes.some((dt) => dt.defenseType === defenseType);
        const fromHasDefenseType = fromRaid.defenseTypes.some((dt) => dt.defenseType === defenseType);

        if (!toHasDefenseType || !fromHasDefenseType) {
          setError("비교할 수 있는 방어 타입이 없어요");
          setLoading(false);
          return;
        }

        // Load both overviews and statistics in parallel
        const [currentOverviewData, fromOverviewData, currentStats, fromStats] = await Promise.all([
          fetchRaidOverview({
            raidType: toRaid.type,
            season: toRaidIndexJp,
            defenseType,
          }),
          fetchRaidOverview({
            raidType: fromRaid.type,
            season: fromRaidIndexJp,
            defenseType,
          }),
          fetchRaidStatisticsByRaid(toRaid.type, toRaidIndexJp, defenseType),
          fetchRaidStatisticsByRaid(fromRaid.type, fromRaidIndexJp, defenseType),
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
  }, [fromRaid, loaderDefenseType, toRaid]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <EmptyView text={`오류가 발생했어요: ${error}`} />;
  }

  if (!currentOverview || !fromOverview) {
    return <EmptyView text="비교 데이터를 준비중이에요" />;
  }

  // Get difficulty for defense type
  const getDifficultyForDefenseType = (raid: typeof toRaid, defenseType: string) => {
    const defenseTypeInfo = raid.defenseTypes.find((dt) => dt.defenseType === defenseType);
    return defenseTypeInfo?.difficulty || null;
  };

  const currentDifficulty = getDifficultyForDefenseType(toRaid, loaderDefenseType);
  const fromDifficulty = getDifficultyForDefenseType(fromRaid, loaderDefenseType);

  return (
    <div>
      <RaidComparisonHeader
        fromRaid={fromRaid as typeof fromRaid & { type: keyof typeof raidTypeLocale }}
        toRaid={toRaid as typeof toRaid & { type: keyof typeof raidTypeLocale }}
        defenseType={loaderDefenseType as keyof typeof defenseTypeColor}
        fromDifficulty={fromDifficulty}
        currentDifficulty={currentDifficulty}
      />

      <Section
        title="난이도별 클리어 비율 증감"
        description="과거 시즌 대비 난이도별 클리어 비율 변화"
      >
        <RaidDifficultyComparison
          currentClearLevels={currentOverview.clearLevels}
          fromClearLevels={fromOverview.clearLevels}
        />
      </Section>

      <Section
        title="학생별 출전 횟수 증감"
        description="과거 시즌 대비 학생별 출전 횟수 변화"
      >
        <RaidStudentComparison
          currentStudentStats={currentOverview.studentStats}
          fromStudentStats={fromOverview.studentStats}
          allStudents={allStudents}
        />
      </Section>
    </div>
  );
}
