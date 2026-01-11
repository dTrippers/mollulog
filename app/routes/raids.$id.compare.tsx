import { useEffect, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";
import dayjs from "dayjs";
import { LoadingSkeleton } from "~/components/atoms/layout";
import { EmptyView } from "~/components/atoms/typography";
import { OptionBadge } from "~/components/atoms/student";
import { Section } from "~/components/ui/Section";
import { getAllStudentsMap } from "~/models/student";
import { fetchRaidStatisticsByRaid } from "~/models/raid-statistics.client";
import { fetchRaidOverview } from "~/models/raid-overview.client";
import { getRaidDetail } from "~/models/raid";
import { difficultyLocale, defenseTypeColor, raidTypeLocale } from "~/locales/ko";
import RaidDifficultyComparison from "~/components/raids/RaidDifficultyComparison";
import RaidStudentComparison from "~/components/raids/RaidStudentComparison";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

export const loader = async ({ context, params, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const currentRaidUid = params.id!;

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
            season: toRaid.raidIndexJp!,
            defenseType,
          }),
          fetchRaidOverview({
            raidType: fromRaid.type,
            season: fromRaid.raidIndexJp!,
            defenseType,
          }),
          fetchRaidStatisticsByRaid(toRaid.type, toRaid.raidIndexJp!, defenseType),
          fetchRaidStatisticsByRaid(fromRaid.type, fromRaid.raidIndexJp!, defenseType),
        ]);

        if (cancelled) {
          return;
        }

        // Convert clear levels
        const currentClearLevels: Record<string, number> = {};
        if (currentOverviewData.clearLevels) {
          Object.entries(currentOverviewData.clearLevels).forEach(([difficulty, count]) => {
            currentClearLevels[difficulty] = Number(count);
          });
        }

        const fromClearLevels: Record<string, number> = {};
        if (fromOverviewData.clearLevels) {
          Object.entries(fromOverviewData.clearLevels).forEach(([difficulty, count]) => {
            fromClearLevels[difficulty] = Number(count);
          });
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
  }, [toRaid, fromRaid, allStudents, loaderDefenseType]);

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
      {/* Comparison Header */}
      <div className="flex items-center gap-2 md:gap-4 mb-6">
        {/* From Raid */}
        <div className="flex-1 bg-white dark:bg-neutral-900 rounded-lg p-3 md:p-4 border border-neutral-200 dark:border-neutral-700">
          <div className="text-sm md:text-base font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            과거 개최
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
            {dayjs(fromRaid.since).format("YYYY/M/D")} ~ {dayjs(fromRaid.until).format("M/D")}
          </div>
          {fromDifficulty && (
            <div className="flex mt-2 gap-x-1">
              <OptionBadge text={raidTypeLocale[fromRaid.type]} />
              <OptionBadge
                text={difficultyLocale[fromDifficulty]}
                color={defenseTypeColor[loaderDefenseType as keyof typeof defenseTypeColor]}
              />
            </div>
          )}
        </div>

        <ArrowRightIcon className="size-4 text-neutral-600 dark:text-neutral-300 shrink-0" strokeWidth={2} />

        {/* Current Raid */}
        <div className="flex-1 bg-white dark:bg-neutral-900 rounded-lg p-3 md:p-4 border border-neutral-200 dark:border-neutral-700">
          <div className="text-sm md:text-base font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
            현재 개최
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-1">
            {dayjs(toRaid.since).format("YYYY/M/D")} ~ {dayjs(toRaid.until).format("M/D")}
          </div>
          {currentDifficulty && (
            <div className="flex mt-2 gap-x-1">
              <OptionBadge text={raidTypeLocale[toRaid.type]} />
              <OptionBadge
                text={difficultyLocale[currentDifficulty]}
                color={defenseTypeColor[loaderDefenseType as keyof typeof defenseTypeColor]}
              />
            </div>
          )}
        </div>
      </div>

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
