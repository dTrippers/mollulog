import { EnvelopeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LoaderFunctionArgs, type MetaFunction, useLoaderData } from "react-router";
import { StudentCard } from "~/components/features/students";
import { Button, EmptyView, HorizontalScroll, Input, SubTitle } from "~/components/primitives";
import {
  type RecruitmentDrawResult,
  type SimulationStudent,
  buildRecruitmentPoolSnapshotFromBaql,
  drawRecruitmentTenPull,
} from "~/domain/recruitment-simulator";
import { getRecruitmentGroupByUid, getRecruitmentPoolStudents } from "~/models/recruitment";
import { getTimelineContent } from "~/models/timeline-content";
import { cn } from "~/lib/utils";

type PullRow = {
  id: string;
  type: "pull";
  startCount: number;
  results: RecruitmentDrawResult[];
};

type ExchangeRow = {
  id: string;
  type: "exchange";
  count: number;
  selectedStudentUid: string | null;
};

type SimulatorRow = PullRow | ExchangeRow;

export const loader = async ({ params, context }: LoaderFunctionArgs) => {
  const timelineUid = params.uid;
  if (!timelineUid) {
    throw new Response("Not Found", { status: 404 });
  }

  const { env } = context.cloudflare;
  const content = await getTimelineContent(env, timelineUid);
  if (!content || !content.recruitmentGroupUid) {
    throw new Response("Not Found", { status: 404 });
  }

  const [recruitmentGroup, students] = await Promise.all([
    getRecruitmentGroupByUid(env, content.recruitmentGroupUid),
    getRecruitmentPoolStudents(env),
  ]);
  if (!recruitmentGroup) {
    throw new Response("Not Found", { status: 404 });
  }

  return {
    eventName: content.name,
    snapshot: buildRecruitmentPoolSnapshotFromBaql({
      recruitmentGroup,
      students,
    }),
  };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  const title = loaderData?.eventName ? `${loaderData.eventName} - 모집 시뮬레이션` : "모집 시뮬레이션";
  return [
    { title: `${title} | 몰루로그` },
    { name: "description", content: "블루 아카이브 모집 결과를 저장 없이 시뮬레이션해보세요." },
  ];
};

function countPulls(rows: SimulatorRow[]) {
  return rows.reduce((count, row) => count + (row.type === "pull" ? row.results.length : 0), 0);
}

function countTier3Pulls(rows: SimulatorRow[]) {
  return rows.reduce(
    (count, row) => count + (row.type === "pull" ? row.results.filter((result) => result.rarity === 3).length : 0),
    0,
  );
}

function createPullRowId(totalCount: number) {
  return `pull-${totalCount + 1}-${Date.now()}`;
}

function createExchangeRowId(totalCount: number) {
  return `exchange-${totalCount}-${Date.now()}`;
}

function appendPullRows(rows: SimulatorRow[], results: RecruitmentDrawResult[]): SimulatorRow[] {
  const totalCount = countPulls(rows);
  const nextTotalCount = totalCount + results.length;
  const nextRows: SimulatorRow[] = [
    {
      id: createPullRowId(totalCount),
      type: "pull",
      startCount: totalCount + 1,
      results,
    },
  ];

  if (nextTotalCount % 200 === 0) {
    nextRows.push({
      id: createExchangeRowId(nextTotalCount),
      type: "exchange",
      count: nextTotalCount,
      selectedStudentUid: null,
    });
  }

  return [...rows, ...nextRows];
}

function hasTargetStudent(results: RecruitmentDrawResult[], targetStudentUid: string | null) {
  return Boolean(targetStudentUid && results.some((result) => result.student.uid === targetStudentUid));
}

function calculatePyroxeneCost(totalRecruitmentCount: number) {
  return Math.floor(totalRecruitmentCount / 10) * 1200;
}

function formatTier3Rate(tier3Count: number, totalRecruitmentCount: number) {
  if (totalRecruitmentCount === 0) {
    return "0.00%";
  }

  return `${((tier3Count / totalRecruitmentCount) * 100).toFixed(2)}%`;
}

function getTierAccentClassName(tier: number) {
  if (tier <= 1) {
    return "bg-blue-600 dark:bg-blue-400";
  }
  if (tier === 2) {
    return "bg-amber-500 dark:bg-amber-400";
  }
  return "bg-purple-700 dark:bg-purple-500";
}

function getNonPickupPoolStudents(snapshot: ReturnType<typeof buildRecruitmentPoolSnapshotFromBaql>) {
  const pickupStudentUids = new Set(snapshot.pickupStudents.map((student) => student.uid));
  return [
    ...snapshot.nonPickupStudentsByTier.tier3,
    ...snapshot.nonPickupStudentsByTier.tier2,
    ...snapshot.nonPickupStudentsByTier.tier1,
  ].filter((student) => !pickupStudentUids.has(student.uid));
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}

export default function EventRecruitmentSimulator() {
  const { snapshot } = useLoaderData<typeof loader>();
  const [selectedPickupStudentUid, setSelectedPickupStudentUid] = useState<string | null>(null);
  const [targetChooserOpen, setTargetChooserOpen] = useState(false);
  const [targetStudentUid, setTargetStudentUid] = useState<string | null>(null);
  const [targetSearchText, setTargetSearchText] = useState("");
  const [rows, setRows] = useState<SimulatorRow[]>([]);
  const [runningUntilTarget, setRunningUntilTarget] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const totalCount = useMemo(() => countPulls(rows), [rows]);
  const tier3Count = useMemo(() => countTier3Pulls(rows), [rows]);
  const nonPickupPoolStudents = useMemo(() => getNonPickupPoolStudents(snapshot), [snapshot]);
  const hasPickupStudents = snapshot.pickupStudents.length > 0;

  const stopUntilTarget = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunningUntilTarget(false);
  };

  const appendTenPull = (targetUid: string | null) => {
    if (!selectedPickupStudentUid) {
      return false;
    }

    const results = drawRecruitmentTenPull({ snapshot, activePickupStudentUid: selectedPickupStudentUid });
    setRows((currentRows) => appendPullRows(currentRows, results));
    return hasTargetStudent(results, targetUid);
  };

  const handleTenPull = () => {
    stopUntilTarget();
    appendTenPull(null);
  };

  const handleOpenTargetChooser = () => {
    stopUntilTarget();
    setTargetChooserOpen(true);
  };

  const handleResetRecruitment = () => {
    stopUntilTarget();
    setTargetStudentUid(null);
    setTargetChooserOpen(false);
    setTargetSearchText("");
    setRows([]);
  };

  const handleRunUntilTarget = (studentUid: string) => {
    stopUntilTarget();
    setTargetStudentUid(studentUid);
    setTargetChooserOpen(false);
    setTargetSearchText("");
    const found = appendTenPull(studentUid);
    if (found) {
      return;
    }

    setRunningUntilTarget(true);
    intervalRef.current = setInterval(() => {
      const nextFound = appendTenPull(studentUid);
      if (nextFound) {
        stopUntilTarget();
      }
    }, 500);
  };

  const handleSelectPickupStudent = (studentUid: string) => {
    stopUntilTarget();
    setSelectedPickupStudentUid(studentUid);
    setTargetStudentUid(null);
    setTargetChooserOpen(false);
    setTargetSearchText("");
    setRows([]);
  };

  const selectExchangeStudent = (rowId: string, studentUid: string) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId && row.type === "exchange" ? { ...row, selectedStudentUid: studentUid } : row,
      ),
    );
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (totalCount === 0) {
      return;
    }

    window.requestAnimationFrame(() => {
      actionsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [totalCount]);

  if (!hasPickupStudents) {
    return (
      <EmptyView
        Icon={SparklesIcon}
        text="시뮬레이션할 픽업 학생이 없어요"
        description="이 모집 기간에는 모집 시뮬레이션에 사용할 픽업 학생 정보가 없어요."
      />
    );
  }

  return (
    <div className="space-y-8 pb-16">
      <section className="space-y-4">
        <SubTitle text="픽업 학생" />
        <StudentCardScroller
          students={snapshot.pickupStudents}
          selectedStudentUid={selectedPickupStudentUid}
          onSelect={handleSelectPickupStudent}
        />
      </section>

      <section className="space-y-4">
        <div>
          <SubTitle text="모집 결과" />
          {selectedPickupStudentUid && (
            <p className="mt-1 text-sm text-muted-foreground">총 {totalCount.toLocaleString()}회 모집</p>
          )}
        </div>

        {!selectedPickupStudentUid ? (
          <div className="rounded-md bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
            픽업 대상 학생을 선택해주세요
          </div>
        ) : (
          <>
            {rows.length > 0 && (
              <div className="space-y-4">
                {rows.map((row) =>
                  row.type === "exchange" ? (
                    <RecruitmentPointExchangeRow
                      key={row.id}
                      row={row}
                      pickupStudents={snapshot.pickupStudents}
                      onSelect={selectExchangeStudent}
                    />
                  ) : (
                    <RecruitmentPullRow key={row.id} row={row} />
                  ),
                )}
              </div>
            )}

            <div ref={actionsRef} className="flex flex-wrap gap-2">
              <Button text="10회 모집" variant="primary" onClick={handleTenPull} disabled={runningUntilTarget} />
              <Button
                text="특정 학생을 뽑을 때까지 모집"
                variant="secondary"
                onClick={handleOpenTargetChooser}
                disabled={runningUntilTarget}
              />
            </div>

            {targetChooserOpen && (
              <TargetStudentChooser
                pickupStudents={snapshot.pickupStudents}
                poolStudents={nonPickupPoolStudents}
                selectedStudentUid={targetStudentUid}
                searchText={targetSearchText}
                onSearchTextChange={setTargetSearchText}
                onSelect={handleRunUntilTarget}
              />
            )}

            {totalCount > 0 && (
              <RecruitmentStatusBar
                totalCount={totalCount}
                tier3Count={tier3Count}
                running={runningUntilTarget}
                onStop={stopUntilTarget}
                onReset={handleResetRecruitment}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function RecruitmentStatusBar({
  totalCount,
  tier3Count,
  running,
  onStop,
  onReset,
}: {
  totalCount: number;
  tier3Count: number;
  running: boolean;
  onStop: () => void;
  onReset: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-layer-navigation px-4 py-3 lg:bottom-0 lg:left-72 xl:left-84">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">총 {totalCount.toLocaleString()}회 모집</p>
          <p className="mt-1 text-xs text-muted-foreground">
            소비한 청휘석 {calculatePyroxeneCost(totalCount).toLocaleString()}개
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            3성 학생 모집 확률 {formatTier3Rate(tier3Count, totalCount)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onStop} disabled={!running}>
            중지
          </Button>
          <Button type="button" size="sm" variant="danger" onClick={onReset}>
            초기화
          </Button>
        </div>
      </div>
    </div>
  );
}

function StudentCardScroller({
  students,
  selectedStudentUid,
  onSelect,
}: {
  students: SimulationStudent[];
  selectedStudentUid?: string | null;
  onSelect?: (studentUid: string) => void;
}) {
  const studentCards = students.map((student) => (
    <StudentCard
      key={student.uid}
      uid={student.uid}
      name={student.name}
      attackType={student.attackType}
      defenseType={student.defenseType}
      role={student.role}
      grayscale={Boolean(selectedStudentUid && selectedStudentUid !== student.uid)}
      checked={selectedStudentUid === student.uid}
      namePlacement="overlay"
      onSelect={onSelect}
    />
  ));

  return (
    <HorizontalScroll itemWidth={{ mobile: "w-20", desktop: "md:w-20" }} gap="gap-2" className="-mx-4 px-4" fadeEdges>
      {studentCards}
    </HorizontalScroll>
  );
}

function TargetStudentChooser({
  pickupStudents,
  poolStudents,
  selectedStudentUid,
  searchText,
  onSearchTextChange,
  onSelect,
}: {
  pickupStudents: SimulationStudent[];
  poolStudents: SimulationStudent[];
  selectedStudentUid: string | null;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSelect: (studentUid: string) => void;
}) {
  const normalizedSearchText = normalizeSearchText(searchText);
  const searchedStudents = normalizedSearchText
    ? poolStudents.filter(
        (student) =>
          normalizeSearchText(student.name).includes(normalizedSearchText) ||
          normalizeSearchText(student.uid).includes(normalizedSearchText),
      )
    : [];

  return (
    <div className="space-y-4 rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
      <div>
        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">목표 학생을 선택해주세요</p>
        <p className="mt-1 text-xs text-blue-700 dark:text-blue-200">
          픽업 학생을 바로 고르거나, 모집 pool의 다른 학생을 검색할 수 있어요.
        </p>
      </div>
      <StudentCardScroller students={pickupStudents} selectedStudentUid={selectedStudentUid} onSelect={onSelect} />
      <Input
        type="search"
        size="sm"
        value={searchText}
        onChange={onSearchTextChange}
        placeholder="픽업 외 학생 검색"
        className="max-w-full bg-white dark:bg-neutral-950"
        aria-label="픽업 외 목표 학생 검색"
      />
      {normalizedSearchText && (
        <StudentCardScroller students={searchedStudents} selectedStudentUid={selectedStudentUid} onSelect={onSelect} />
      )}
      {normalizedSearchText && searchedStudents.length === 0 && (
        <p className="text-xs text-blue-700 dark:text-blue-200">검색 결과가 없어요.</p>
      )}
    </div>
  );
}

function RecruitmentPointExchangeRow({
  row,
  pickupStudents,
  onSelect,
}: {
  row: ExchangeRow;
  pickupStudents: SimulationStudent[];
  onSelect: (rowId: string, studentUid: string) => void;
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">
            {row.count.toLocaleString()}회 모집 포인트 교환
          </p>
          <p className="mt-1 text-xs text-blue-700 dark:text-blue-200">픽업 학생 중 한 명을 선택할 수 있어요.</p>
        </div>
      </div>
      <HorizontalScroll itemWidth={{ mobile: "w-20", desktop: "md:w-20" }} gap="gap-2" className="-mx-4 px-4" fadeEdges>
        {pickupStudents.map((student) => (
          <StudentCard
            key={student.uid}
            uid={student.uid}
            name={student.name}
            attackType={student.attackType}
            defenseType={student.defenseType}
            role={student.role}
            grayscale={Boolean(row.selectedStudentUid && row.selectedStudentUid !== student.uid)}
            checked={row.selectedStudentUid === student.uid}
            namePlacement="overlay"
            onSelect={() => onSelect(row.id, student.uid)}
          />
        ))}
      </HorizontalScroll>
    </div>
  );
}

function RecruitmentPullRow({ row }: { row: PullRow }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900/60">
      <p className="mb-2 text-xs font-semibold text-neutral-700 dark:text-neutral-200">
        {row.startCount.toLocaleString()}회 ~ {(row.startCount + row.results.length - 1).toLocaleString()}회
      </p>
      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
        {row.results.map((result, index) => (
          <RecruitmentResultCard key={`${row.id}-${index}`} result={result} />
        ))}
      </div>
    </div>
  );
}

function RecruitmentResultCard({ result }: { result: RecruitmentDrawResult }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 450);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-w-0 space-y-1">
      <div className="relative">
        <div className={cn(`transition-opacity duration-300 ${revealed ? "opacity-100" : "opacity-0"}`)}>
          <StudentCard
            uid={result.student.uid}
            name={result.student.name}
            attackType={result.student.attackType}
            defenseType={result.student.defenseType}
            role={result.student.role}
            namePlacement="overlay"
          />
        </div>
        {!revealed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <RecruitmentEnvelope rarity={result.rarity} />
          </div>
        )}
      </div>
      <div className={`h-1.5 rounded-full ${getTierAccentClassName(result.rarity)}`} />
    </div>
  );
}

function RecruitmentEnvelope({ rarity }: { rarity: 1 | 2 | 3 }) {
  const className = {
    1: "border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200",
    2: "border-yellow-300 bg-yellow-100 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200",
    3: "border-purple-300 bg-purple-100 text-purple-700 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-200",
  }[rarity];

  return (
    <div className={cn(`flex aspect-5/6 w-full items-center justify-center rounded-lg border ${className}`)}>
      <EnvelopeIcon className="size-8" />
    </div>
  );
}
