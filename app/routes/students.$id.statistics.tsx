import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useOutletContext } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { StudentStatisticsState } from "~/components/v2/features/raids/StudentStatisticsState";
import { IconButton } from "~/components/v2/primitives/IconButton";
import { Popover } from "~/components/v2/primitives/Popover";
import type { Defense } from "~/graphql/graphql";
import { compareInstantAsc, compareInstantDesc, getInstantTime, type UtcIsoString } from "~/lib/date-time";
import { routeError } from "~/lib/http-errors";
import { fetchRaidStatisticsByStudent, type RaidStatistics } from "~/lib/ranks/stats";
import { fetchStudentAnalysis, type StudentAnalysisSynergyPartner } from "~/lib/ranks/student-analysis";
import { canonicalLink } from "~/lib/seo";
import type { RaidType, Terrain } from "~/models/content.d";
import { getAllRaidSchedules } from "~/models/raid";
import { getRecruitedStudents } from "~/models/recruited-student";
import { getAllStudentsMap, getStudentForms } from "~/models/student";
import { formatStudentFullName } from "~/models/student-name";
import type { StudentDetailPageContext } from "./students.$id";
import { StudentRaidRecordList } from "./students.$id._components/StudentRaidRecordList";
import StudentBossUsageChart from "./students.$id._components/StudentBossUsageChart";
import StudentDifficultyUsageChart from "./students.$id._components/StudentDifficultyUsageChart";
import {
  aggregateBossUsage,
  aggregateDifficultyUsage,
  buildStudentAnalysisScopeLookup,
  getStudentAnalysisFailedAreas,
  type StudentBossUsageSummary,
  type StudentDifficultyUsage,
  type StudentAnalysisFailedAreas,
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
  const studentFormsPromise = getStudentForms(env);
  const [currentUser, rawAllStudents, allRaids, studentForms] = await Promise.all([
    currentUserPromise,
    allStudentsPromise,
    allRaidsPromise,
    studentFormsPromise,
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
    primaryStudentUid: studentForms[uid]?.primaryUid ?? uid,
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
    const canonicalPath = data ? `/students/${data.primaryStudentUid}/statistics` : location.pathname;
    return [{ title: "학생 통계 | 몰루로그" }, canonicalLink(canonicalPath)];
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
    canonicalLink(`/students/${data.primaryStudentUid}/statistics`),
  ];
};

export function shouldShowMergedStatisticsNote({
  pageUid,
  primaryUid,
  statistics,
}: {
  pageUid: string;
  primaryUid: string;
  statistics: Pick<RaidStatistics, "studentUid">[];
}) {
  return pageUid !== primaryUid && statistics.length > 0 && statistics.every(({ studentUid }) => studentUid === primaryUid);
}

export default function StudentStatisticsPage() {
  const { student } = useOutletContext<StudentDetailPageContext>();
  const { signedIn, recruitedStudentTiers, allStudents, allRaids } = useLoaderData<typeof loader>();
  const [raidShowMore, setRaidShowMore] = useState(false);
  const [sort, setSort] = useState<"recent" | "old">("recent");
  const [statisticsLoading, setStatisticsLoading] = useState(true);
  const [rawStatistics, setRawStatistics] = useState<RaidStatistics[]>([]);
  const [statisticsFailed, setStatisticsFailed] = useState(false);
  const [statisticsAttempt, setStatisticsAttempt] = useState(0);
  const [studentAnalysisLoading, setStudentAnalysisLoading] = useState(true);
  const [studentAnalysisAttempt, setStudentAnalysisAttempt] = useState(0);
  const [analysisFailedAreas, setAnalysisFailedAreas] = useState<StudentAnalysisFailedAreas>({
    bossUsage: false,
    difficultyUsage: false,
    synergy: false,
  });
  const [bossUsage, setBossUsage] = useState<StudentBossUsageSummary | null>(null);
  const [difficultyUsage, setDifficultyUsage] = useState<StudentDifficultyUsage[]>([]);
  const [synergyPartners, setSynergyPartners] = useState<StudentAnalysisSynergyPartner[]>([]);
  const [scopeInfoOpen, setScopeInfoOpen] = useState(false);
  const scopeInfoRef = useRef<HTMLButtonElement>(null);
  const scopeInfoAnchorRef = useRef<HTMLDivElement>(null);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: this state counter is the explicit retry trigger.
  useEffect(() => {
    let cancelled = false;
    const loadStatistics = async () => {
      setStatisticsLoading(true);
      setStatisticsFailed(false);
      try {
        const response = await fetchRaidStatisticsByStudent(student.uid);
        if (!cancelled) {
          setRawStatistics(response);
          setStatisticsFailed(false);
        }
      } catch {
        if (!cancelled) setStatisticsFailed(true);
      } finally {
        if (!cancelled) setStatisticsLoading(false);
      }
    };
    loadStatistics();
    return () => {
      cancelled = true;
    };
  }, [student.uid, statisticsAttempt]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: this state counter is the explicit retry trigger.
  useEffect(() => {
    let cancelled = false;
    const loadStudentAnalysis = async () => {
      try {
        setStudentAnalysisLoading(true);
        const response = await fetchStudentAnalysis({ studentUid: student.uid });
        if (cancelled) return;
        setAnalysisFailedAreas(getStudentAnalysisFailedAreas({ response, scopeLookup: analysisScopeLookup }));
        setBossUsage(aggregateBossUsage({ response, scopeLookup: analysisScopeLookup }));
        setDifficultyUsage(aggregateDifficultyUsage({ response }));
        setSynergyPartners(response.synergy);
      } catch {
        if (cancelled) return;
        setAnalysisFailedAreas({ bossUsage: true, difficultyUsage: true, synergy: true });
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
  }, [analysisScopeLookup, student.uid, studentAnalysisAttempt]);

  const listedStatistics = useMemo(() => {
    return statistics
      .filter((stat) => stat.slotsCount > 100)
      .sort((a, b) =>
        sort === "recent"
          ? compareInstantDesc(a.raid.startAt, b.raid.startAt)
          : compareInstantAsc(a.raid.startAt, b.raid.startAt),
      );
  }, [statistics, sort]);
  const raidSummary = useMemo(() => buildStudentRaidSummary({ statistics }), [statistics]);
  const raidInvestment = useMemo(
    () => buildStudentRaidInvestment({ statistics, myStudentTier }),
    [statistics, myStudentTier],
  );

  const statsState = statisticsLoading ? "loading" : statisticsFailed ? "failed" : rawStatistics.length === 0 ? "empty" : null;
  const showMergedStatisticsNote = shouldShowMergedStatisticsNote({
    pageUid: student.uid,
    primaryUid: student.studentVariant.primaryStudent.uid,
    statistics: rawStatistics,
  });
  return (
    <section>
      <div ref={scopeInfoAnchorRef} className={`-mt-1.5 ${showMergedStatisticsNote ? "mb-0" : "mb-3"} flex min-h-8 items-center gap-0.5 text-[13px] leading-[1.43] text-v2-fg-secondary`}>
        <span>총력전/대결전 통계만 포함되어 있어요</span>
        <span className="relative -ml-1 inline-flex">
          <IconButton
            ref={scopeInfoRef}
            icon={InformationCircleIcon}
            label="통계 범위 안내"
            aria-haspopup="dialog"
            aria-expanded={scopeInfoOpen}
            onClick={() => setScopeInfoOpen((open) => !open)}
          />
          <Popover open={scopeInfoOpen} label="통계 범위 안내" onClose={() => setScopeInfoOpen(false)} returnFocusRef={scopeInfoRef} anchorRef={scopeInfoAnchorRef} className="w-72 p-5 max-sm:p-4 text-[13px] leading-[1.43] text-v2-fg backdrop-blur-[4px] data-[placement=below]:-mt-2 data-[placement=above]:mt-2">
            제약해제결전 등 다른 컨텐츠에서 활약하는 학생은 추천도가 낮게 표현될 수 있어요
          </Popover>
        </span>
      </div>
      {showMergedStatisticsNote ? <p className="-mt-1 mb-3 text-[13px] leading-[1.43] text-v2-fg-secondary">모든 폼의 기록을 합친 통계예요</p> : null}
      {statsState ? (
        <StudentStatisticsState state={statsState} onRetry={() => setStatisticsAttempt((value) => value + 1)} />
      ) : (
        <>
          <StudentRaidUsageChart releaseAt={student.releaseAt} raids={allRaids} statistics={rawStatistics} />

          <div className="mt-6 grid gap-y-6 md:grid-cols-2 md:gap-x-4">
            <StudentRaidSummaryCard summary={raidSummary} />
            <StudentRaidInvestmentChart investment={raidInvestment} signedIn={signedIn} />
          </div>
          <div className="mt-6 grid gap-y-6 md:grid-cols-2 md:gap-x-4">
            <StudentBossUsageChart summary={bossUsage} loading={studentAnalysisLoading} failed={analysisFailedAreas.bossUsage} onRetry={() => setStudentAnalysisAttempt((value) => value + 1)} />
            <StudentDifficultyUsageChart rows={difficultyUsage} loading={studentAnalysisLoading} failed={analysisFailedAreas.difficultyUsage} onRetry={() => setStudentAnalysisAttempt((value) => value + 1)} />
          </div>
          <StudentSynergyPartners
            className="mt-6"
            partners={synergyPartners}
            loading={studentAnalysisLoading}
            failed={analysisFailedAreas.synergy}
            onRetry={() => setStudentAnalysisAttempt((value) => value + 1)}
            signedIn={signedIn}
            allStudents={allStudents}
            recruitedStudentTiers={recruitedStudentTiers}
          />

          <StudentRaidRecordList
            records={listedStatistics}
            showMore={raidShowMore}
            sortDirection={sort}
            onSortDirectionChange={setSort}
            onShowMoreChange={setRaidShowMore}
            forms={student.studentVariant.isMulticlass ? student.studentVariant.students : []}
            currentStudentUid={student.uid}
          />
        </>
      )}
    </section>
  );
}
