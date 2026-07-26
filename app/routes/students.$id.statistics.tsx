import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/16/solid";
import { BarsArrowDownIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RaidStatisticsSlotCount } from "~/components/features/raids";
import { Callout, EmptyView, FilterButtons, LoadingSkeleton, SubTitle } from "~/components/primitives";
import type { Defense } from "~/graphql/graphql";
import { compareInstantAsc, compareInstantDesc, getInstantTime, type UtcIsoString } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { fetchRaidStatisticsByStudent, type RaidStatistics } from "~/lib/ranks/stats";
import { fetchStudentAnalysis, type StudentAnalysisSynergyPartner } from "~/lib/ranks/student-analysis";
import { canonicalLink } from "~/lib/seo";
import type { RaidType, Terrain } from "~/models/content.d";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudents } from "~/models/recruited-student";
import { formatStudentFullName, getAllStudentsMap, getMaxTierAt } from "~/models/student";
import type { StudentDetailPageContext } from "./students.$id";
import StudentBossUsageChart from "./students.$id._components/StudentBossUsageChart";
import StudentDifficultyUsageChart from "./students.$id._components/StudentDifficultyUsageChart";
import {
  aggregateBossUsage,
  aggregateDifficultyUsage,
  buildStudentAnalysisScopeLookup,
  type StudentBossUsageSummary,
  type StudentDifficultyUsage,
} from "./students.$id._components/StudentDifficultyUsageModel";
import StudentRaidInvestmentChart from "./students.$id._components/StudentRaidInvestmentChart";
import StudentRaidSummaryCard from "./students.$id._components/StudentRaidSummaryCard";
import {
  buildStudentRaidInvestment,
  buildStudentRaidSummary,
} from "./students.$id._components/StudentRaidSummaryModel";
import StudentRaidUsageChart from "./students.$id._components/StudentRaidUsageChart";
import StudentSynergyPartners from "./students.$id._components/StudentSynergyPartners";

type EnrichedRaidStatistics = Omit<RaidStatistics, "raid"> & {
  raid: {
    raidType: RaidType;
    seasonIndex: number;
    name: string;
    boss: string;
    jpSeasonIndex: number;
    startAt: UtcIsoString;
    endAt: UtcIsoString;
    terrain: Terrain;
    defenseType: Defense;
    difficulty: string | null;
  };
};

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const uid = params.id;
  if (!uid) {
    throw routeError(404, "student.not_found", "해당하는 학생 정보가 없어요");
  }

  const env = context.cloudflare.env;
  const currentUserPromise = getActiveSensei(env, request);
  const allStudentsPromise = getAllStudentsMap(env, true);
  const allRaidsPromise = getAllRaidSchedules(env);
  const [currentUser, rawAllStudents, allRaids] = await Promise.all([
    currentUserPromise,
    allStudentsPromise,
    allRaidsPromise,
  ]);
  const recruitedStudents = currentUser ? await getRecruitedStudents(env, currentUser.id) : [];
  const studentMeta = rawAllStudents[uid] ?? null;

  return {
    signedIn: currentUser !== null,
    studentMeta: studentMeta
      ? {
          uid: studentMeta.uid,
          name: studentMeta.name,
          familyName: studentMeta.familyName,
        }
      : null,
    recruitedStudentTiers: Object.fromEntries(
      recruitedStudents.map((recruitedStudent) => [recruitedStudent.studentUid, recruitedStudent.tier]),
    ),
    allStudents: Object.fromEntries(
      Object.entries(rawAllStudents).map(([studentUid, student]) => [studentUid, { name: student.name }]),
    ),
    allRaids,
  };
};

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  if (!data?.studentMeta) {
    return [{ title: "학생 통계 | 몰루로그" }, canonicalLink(location.pathname)];
  }
  const studentFullName = formatStudentFullName(data.studentMeta);
  const title = `${studentFullName} - 총력전/대결전 통계`;
  const description = `블루 아카이브 ${data.studentMeta.name}의 편성 추이, 성장도, 보스별 활용도와 함께 편성한 학생을 확인해보세요.`;
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: description },
    { name: "og:title", content: title },
    { name: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    canonicalLink(location.pathname),
  ];
};

export default function StudentStatisticsPage() {
  const { student } = useOutletContext<StudentDetailPageContext>();
  const { signedIn, recruitedStudentTiers, allStudents, allRaids } = useLoaderData<typeof loader>();
  const [raidShowMore, setRaidShowMore] = useState(false);
  const [sort, setSort] = useState<"recent" | "old">("recent");
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [rawStatistics, setRawStatistics] = useState<RaidStatistics[]>([]);
  const [studentAnalysisLoading, setStudentAnalysisLoading] = useState(false);
  const [bossUsage, setBossUsage] = useState<StudentBossUsageSummary | null>(null);
  const [difficultyUsage, setDifficultyUsage] = useState<StudentDifficultyUsage[]>([]);
  const [synergyPartners, setSynergyPartners] = useState<StudentAnalysisSynergyPartner[]>([]);

  const enrichRaidStatistics = useMemo(() => {
    return (stats: RaidStatistics[]): EnrichedRaidStatistics[] => {
      return stats
        .map((stat): EnrichedRaidStatistics | null => {
          const raid = allRaids.find(
            (currentRaid) =>
              currentRaid.raidType === stat.raid.raidType && currentRaid.jpSchedule?.seasonIndex === stat.raid.season,
          );
          if (!raid?.startAt || !raid.endAt) return null;
          if (Number.isNaN(getInstantTime(raid.startAt)) || Number.isNaN(getInstantTime(raid.endAt))) return null;

          const defenseTypeSet = raid.defenseTypeSets.find(
            ({ primaryDefenseType }) => primaryDefenseType === stat.raid.defenseType,
          );
          return {
            ...stat,
            raid: {
              raidType: raid.raidType as RaidType,
              seasonIndex: raid.seasonIndex,
              name: raid.raidBoss.name,
              boss: raid.raidBoss.uid,
              jpSeasonIndex: stat.raid.season,
              startAt: raid.startAt,
              endAt: raid.endAt,
              terrain: raid.terrain as Terrain,
              defenseType: stat.raid.defenseType,
              difficulty: defenseTypeSet?.difficulty ?? null,
            },
          };
        })
        .filter((stat): stat is EnrichedRaidStatistics => stat !== null);
    };
  }, [allRaids]);

  const statistics = useMemo(() => enrichRaidStatistics(rawStatistics), [enrichRaidStatistics, rawStatistics]);
  const analysisScopeLookup = useMemo(() => buildStudentAnalysisScopeLookup({ allRaids }), [allRaids]);
  const myStudentTier = recruitedStudentTiers[student.studentVariant.primaryStudent.uid] ?? null;

  useEffect(() => {
    let cancelled = false;
    const loadStatistics = async () => {
      try {
        const response = await fetchRaidStatisticsByStudent(student.uid);
        if (!cancelled) setRawStatistics(response);
      } catch {
        // Keep the existing graceful empty-state behavior without alerting.
      } finally {
        if (!cancelled) setStatisticsLoading(false);
      }
    };
    loadStatistics();
    return () => {
      cancelled = true;
    };
  }, [student.uid]);

  useEffect(() => {
    let cancelled = false;
    const loadStudentAnalysis = async () => {
      try {
        setStudentAnalysisLoading(true);
        const response = await fetchStudentAnalysis({ studentUid: student.uid });
        if (cancelled) return;
        setBossUsage(aggregateBossUsage({ response, scopeLookup: analysisScopeLookup }));
        setDifficultyUsage(aggregateDifficultyUsage({ response }));
        setSynergyPartners(response.synergy);
      } catch {
        if (cancelled) return;
        setBossUsage(null);
        setDifficultyUsage([]);
        setSynergyPartners([]);
      } finally {
        if (!cancelled) setStudentAnalysisLoading(false);
      }
    };
    loadStudentAnalysis();
    return () => {
      cancelled = true;
    };
  }, [analysisScopeLookup, student.uid]);

  const listedStatistics = useMemo(() => {
    return statistics
      .filter((stat) => stat.slotsCount > 100)
      .sort((a, b) =>
        sort === "recent"
          ? compareInstantDesc(a.raid.startAt, b.raid.startAt)
          : compareInstantAsc(a.raid.startAt, b.raid.startAt),
      );
  }, [statistics, sort]);
  const filteredStatistics = raidShowMore ? listedStatistics : listedStatistics.slice(0, 5);
  const raidSummary = useMemo(() => buildStudentRaidSummary({ statistics }), [statistics]);
  const raidInvestment = useMemo(
    () => buildStudentRaidInvestment({ statistics, myStudentTier }),
    [statistics, myStudentTier],
  );

  return (
    <section className="mt-6 md:mt-8">
      <Callout
        className="mb-3 md:mb-4"
        tone="warning"
        title="총력전/대결전 통계만 포함되어 있어요"
        description="제약해제결전 등 다른 컨텐츠에서 활약하는 학생은 추천도가 낮게 표현될 수 있어요"
      />

      {statisticsLoading ? (
        <LoadingSkeleton />
      ) : rawStatistics.length === 0 ? (
        <EmptyView text="편성된 총력전/대결전 정보가 없어요" />
      ) : (
        <>
          <StudentRaidUsageChart releaseAt={student.releaseAt} raids={allRaids} statistics={rawStatistics} />

          <div className="mt-3 grid gap-3 md:mt-4 md:grid-cols-2 md:gap-4">
            <StudentRaidSummaryCard summary={raidSummary} />
            <StudentRaidInvestmentChart investment={raidInvestment} signedIn={signedIn} />
          </div>
          <div className="mt-3 grid gap-3 md:mt-4 md:grid-cols-2 md:gap-4">
            <StudentBossUsageChart summary={bossUsage} loading={studentAnalysisLoading} />
            <StudentDifficultyUsageChart rows={difficultyUsage} loading={studentAnalysisLoading} />
          </div>
          <StudentSynergyPartners
            className="mt-3 md:mt-4"
            partners={synergyPartners}
            loading={studentAnalysisLoading}
            allStudents={allStudents}
            recruitedStudentTiers={recruitedStudentTiers}
          />

          <div className="mt-8 md:mt-10">
            <SubTitle text="총력전/대결전 상세 기록" />
            <div className="mt-3 md:mt-4">
              <FilterButtons
                surface="page"
                Icon={BarsArrowDownIcon}
                buttonProps={[
                  { text: "최신순", onToggle: () => setSort("recent"), active: sort === "recent" },
                  { text: "과거순", onToggle: () => setSort("old"), active: sort === "old" },
                ]}
                exclusive
                atLeastOne
              />
              {listedStatistics.length === 0 ? (
                <div className="mt-4">
                  <EmptyView text="100회를 초과해 편성된 총력전/대결전 정보가 없어요" />
                </div>
              ) : (
                filteredStatistics.map((stat) => {
                  const { raid, slotsByTier, slotsCount, assistsCount, assistsByTier } = stat;
                  return (
                    <RaidStatisticsSlotCount
                      key={`${raid.raidType}-${raid.seasonIndex}-${raid.defenseType}`}
                      raid={raid}
                      slotsCount={slotsCount}
                      slotsByTier={slotsByTier}
                      assistsCount={assistsCount}
                      assistsByTier={assistsByTier}
                      maxTier={getMaxTierAt(raid.startAt)}
                    />
                  );
                })
              )}
              {listedStatistics.length > 5 ? (
                <button
                  type="button"
                  className="mb-4 flex w-full items-center justify-center py-2 text-center hover:underline"
                  onClick={() => setRaidShowMore((expanded) => !expanded)}
                >
                  {raidShowMore ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
                  <span className="ml-1">{raidShowMore ? "접기" : "더 보기"}</span>
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
