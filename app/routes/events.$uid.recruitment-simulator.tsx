import { EnvelopeIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { type LoaderFunctionArgs, type MetaFunction, redirect, useLoaderData } from "react-router";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { PageActionBar, PageMain, useV2Page } from "~/components/v2/layout";
import { Button } from "~/components/v2/primitives/Button";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { StatusNotice } from "~/components/v2/primitives/StatusNotice";
import type { FavoriteLabelState } from "~/domain/futures/futures-view-model";
import {
  buildRecruitmentPoolSnapshotFromBaql,
  drawRecruitmentTenPull,
  type RecruitmentDrawResult,
  type SimulationStudent,
} from "~/domain/recruitment-simulator";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { getRecruitmentGroupByUid, getRecruitmentPoolStudents } from "~/models/recruitment";
import { getTimelineContent } from "~/models/timeline-content.server";

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

export const loader = async ({ params, context, request }: LoaderFunctionArgs) => {
  const timelineUid = params.uid;
  if (!timelineUid) throw new Response("Not Found", { status: 404 });

  const { env, ctx } = context.cloudflare;
  const content = await getTimelineContent(env, timelineUid, { ctx });
  if (content?.contentType === "live")
    return redirect(`/lives/${timelineUid}${new URL(request.url).search}`, { status: 301 });
  if (!content?.recruitmentGroupUid) throw new Response("Not Found", { status: 404 });

  const [recruitmentGroup, students] = await Promise.all([
    getRecruitmentGroupByUid(env, content.recruitmentGroupUid),
    getRecruitmentPoolStudents(env),
  ]);
  if (!recruitmentGroup) throw new Response("Not Found", { status: 404 });

  return {
    eventName: content.name,
    snapshot: buildRecruitmentPoolSnapshotFromBaql({ recruitmentGroup, students }),
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

function appendPullRows(rows: SimulatorRow[], results: RecruitmentDrawResult[]): SimulatorRow[] {
  const totalCount = countPulls(rows);
  const nextTotalCount = totalCount + results.length;
  const nextRows: SimulatorRow[] = [
    { id: `pull-${totalCount + 1}-${Date.now()}`, type: "pull", startCount: totalCount + 1, results },
  ];

  if (nextTotalCount % 200 === 0) {
    nextRows.push({
      id: `exchange-${nextTotalCount}-${Date.now()}`,
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
  return totalRecruitmentCount === 0 ? "0.00%" : `${((tier3Count / totalRecruitmentCount) * 100).toFixed(2)}%`;
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
  const { stacked } = useV2Page();
  const [selectedPickupStudentUid, setSelectedPickupStudentUid] = useState<string | null>(null);
  const [targetChooserOpen, setTargetChooserOpen] = useState(false);
  const [targetStudentUid, setTargetStudentUid] = useState<string | null>(null);
  const [targetSearchText, setTargetSearchText] = useState("");
  const [rows, setRows] = useState<SimulatorRow[]>([]);
  const [runningUntilTarget, setRunningUntilTarget] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const totalCount = useMemo(() => countPulls(rows), [rows]);
  const tier3Count = useMemo(() => countTier3Pulls(rows), [rows]);
  const nonPickupPoolStudents = useMemo(() => getNonPickupPoolStudents(snapshot), [snapshot]);

  const stopUntilTarget = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunningUntilTarget(false);
  };

  const appendTenPull = (targetUid: string | null) => {
    if (!selectedPickupStudentUid) return false;
    const results = drawRecruitmentTenPull({ snapshot, activePickupStudentUid: selectedPickupStudentUid });
    setRows((currentRows) => appendPullRows(currentRows, results));
    return hasTargetStudent(results, targetUid);
  };

  const handleTenPull = () => {
    stopUntilTarget();
    if (!selectedPickupStudentUid) return;
    appendTenPull(null);
    trackGoogleAnalyticsEvent("recruitment_simulated", { mode: "ten_pull" });
  };

  const handleRunUntilTarget = (studentUid: string) => {
    if (!selectedPickupStudentUid) return;
    stopUntilTarget();
    setTargetStudentUid(studentUid);
    setTargetChooserOpen(false);
    setTargetSearchText("");
    const found = appendTenPull(studentUid);
    trackGoogleAnalyticsEvent("recruitment_simulated", { mode: "until_target" });
    if (found) return;

    setRunningUntilTarget(true);
    intervalRef.current = setInterval(() => {
      if (appendTenPull(studentUid)) stopUntilTarget();
    }, 500);
  };

  const handleReset = () => {
    stopUntilTarget();
    setTargetStudentUid(null);
    setTargetChooserOpen(false);
    setTargetSearchText("");
    setRows([]);
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

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    [],
  );

  if (snapshot.pickupStudents.length === 0) {
    return (
      <PageMain>
        <div className="rounded-lg bg-v2-surface p-v2-block-p text-center">
          <SparklesIcon className="mx-auto size-8 text-v2-fg-tertiary" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-v2-fg">시뮬레이션할 픽업 학생이 없어요</h2>
          <p className="mt-1 text-sm text-v2-fg-secondary">
            이 모집 기간에는 모집 시뮬레이션에 사용할 픽업 학생 정보가 없어요.
          </p>
        </div>
      </PageMain>
    );
  }

  const disabled = selectedPickupStudentUid === null || runningUntilTarget;
  const summary = (
    <div className="flex flex-col gap-y-1">
      <span className="font-semibold text-v2-fg">총 {totalCount.toLocaleString()}회 모집</span>
      <span className="text-xs font-normal text-v2-fg-tertiary">
        소비한 청휘석 {calculatePyroxeneCost(totalCount).toLocaleString()}개
      </span>
      <span className="text-xs font-normal text-v2-fg-tertiary">
        3성 학생 모집 확률 {formatTier3Rate(tier3Count, totalCount)}
      </span>
    </div>
  );

  return (
    <PageMain>
      <div className={`space-y-v2-section-gap ${selectedPickupStudentUid ? "pb-32" : ""}`}>
        <section className="space-y-v2-block-gap">
          <div>
            <h2 className="text-base font-semibold text-v2-fg">픽업 학생</h2>
            <p className="mt-1 text-xs text-v2-fg-tertiary">모집할 픽업 학생을 선택해주세요.</p>
          </div>
          <div className="-mx-v2-block-p flex gap-2 overflow-x-auto px-v2-block-p pb-1">
            {snapshot.pickupStudents.map((student) => (
              <RecruitmentStudentThumb
                key={student.uid}
                student={student}
                selected={selectedPickupStudentUid === student.uid}
                dimUnselected={selectedPickupStudentUid !== null}
                onSelect={() => handleSelectPickupStudent(student.uid)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-v2-block-gap">
          <div>
            <h2 className="text-base font-semibold text-v2-fg">모집 결과</h2>
            <p className="mt-1 text-sm text-v2-fg-secondary">총 {totalCount.toLocaleString()}회 모집</p>
          </div>
          {!selectedPickupStudentUid ? (
            <StatusNotice tone="neutral">픽업 학생을 선택해주세요</StatusNotice>
          ) : (
            <>
              {rows.length > 0 ? (
                <div className="space-y-v2-block-gap">
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
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={handleTenPull} disabled={disabled}>
                  10회 모집
                </Button>
                <Button size="sm" onClick={() => setTargetChooserOpen((open) => !open)} disabled={disabled}>
                  특정 학생을 뽑을 때까지 모집
                </Button>
              </div>
              {targetChooserOpen ? (
                <TargetStudentChooser
                  pickupStudents={snapshot.pickupStudents}
                  poolStudents={nonPickupPoolStudents}
                  selectedStudentUid={targetStudentUid}
                  searchText={targetSearchText}
                  onSearchTextChange={setTargetSearchText}
                  onSelect={handleRunUntilTarget}
                  onClose={() => setTargetChooserOpen(false)}
                />
              ) : null}
            </>
          )}
        </section>

        {selectedPickupStudentUid ? (
          <PageActionBar
            placement={stacked ? "fixed" : "sticky"}
            className={stacked ? "px-4 lg:px-v2-block-p" : ""}
            summary={summary}
          >
            <Button size="sm" onClick={stopUntilTarget} disabled={!runningUntilTarget}>
              중지
            </Button>
            <Button variant="danger" size="sm" onClick={handleReset} disabled={totalCount === 0 && !targetChooserOpen}>
              초기화
            </Button>
          </PageActionBar>
        ) : null}
      </div>
    </PageMain>
  );
}

const emptyFavorite: FavoriteLabelState = {
  visible: false,
  icon: "unfavorited",
  countText: null,
  accessibleName: "관심 학생",
};

function getTierAccentClassName(rarity: number) {
  if (rarity <= 1) return "bg-v2-recruitment-tier-1";
  if (rarity === 2) return "bg-v2-recruitment-tier-2";
  return "bg-v2-recruitment-tier-3";
}

function RecruitmentStudentThumb({
  student,
  selected = false,
  dimUnselected = false,
  onSelect,
}: {
  student: SimulationStudent;
  selected?: boolean;
  dimUnselected?: boolean;
  onSelect?: () => void;
}) {
  const { name, variant } = splitVisibleStudentName(student.name);
  return (
    <div className="w-[4.25rem] shrink-0">
      <StudentThumb
        studentUid={student.uid}
        name={name}
        variant={variant}
        recruitmentLabel=""
        isNew={false}
        favorite={emptyFavorite}
        showRecruitmentLabel={false}
        onSelect={onSelect}
        selected={selected}
        selectionActionLabel="선택"
        grayscaleWhenUnselected={dimUnselected}
        captionPlacement="overlay"
        overlayOnMobile
      />
    </div>
  );
}

function TargetStudentChooser({
  pickupStudents,
  poolStudents,
  selectedStudentUid,
  searchText,
  onSearchTextChange,
  onSelect,
  onClose,
}: {
  pickupStudents: SimulationStudent[];
  poolStudents: SimulationStudent[];
  selectedStudentUid: string | null;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSelect: (studentUid: string) => void;
  onClose: () => void;
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
    <section
      className="space-y-v2-block-gap rounded-lg bg-v2-inset p-v2-block-p"
      aria-labelledby="target-student-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="target-student-title" className="text-sm font-semibold text-v2-fg">
            특정 학생까지 모집
          </h3>
          <p className="mt-1 text-xs text-v2-fg-secondary">목표 학생을 선택해주세요.</p>
        </div>
        <Button size="sm" onClick={onClose}>
          닫기
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pickupStudents.map((student) => (
          <RecruitmentStudentThumb
            key={student.uid}
            student={student}
            selected={selectedStudentUid === student.uid}
            dimUnselected={selectedStudentUid !== null}
            onSelect={() => onSelect(student.uid)}
          />
        ))}
      </div>
      <SearchInput
        aria-label="픽업 외 목표 학생 검색"
        placeholder="픽업 외 학생 검색"
        value={searchText}
        onChange={onSearchTextChange}
      />
      {normalizedSearchText ? (
        searchedStudents.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {searchedStudents.map((student) => (
              <RecruitmentStudentThumb
                key={student.uid}
                student={student}
                selected={selectedStudentUid === student.uid}
                dimUnselected={selectedStudentUid !== null}
                onSelect={() => onSelect(student.uid)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-v2-fg-secondary">검색 결과가 없어요.</p>
        )
      ) : null}
    </section>
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
    <div className="space-y-v2-block-gap rounded-lg bg-v2-inset p-v2-block-p">
      <div>
        <h3 className="text-sm font-semibold text-v2-fg">{row.count.toLocaleString()}회 모집 포인트 교환</h3>
        <p className="mt-1 text-xs text-v2-fg-secondary">픽업 학생 중 한 명을 선택할 수 있어요.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pickupStudents.map((student) => (
          <RecruitmentStudentThumb
            key={student.uid}
            student={student}
            selected={row.selectedStudentUid === student.uid}
            dimUnselected={row.selectedStudentUid !== null}
            onSelect={() => onSelect(row.id, student.uid)}
          />
        ))}
      </div>
    </div>
  );
}

function RecruitmentPullRow({ row }: { row: PullRow }) {
  const occurrences = new Map<string, number>();
  const results = row.results.map((result) => {
    const identity = `${result.student.uid}:${result.rarity}:${result.pickup}`;
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { result, key: `${row.id}-${identity}-${occurrence}` };
  });

  return (
    <div className="rounded-lg bg-v2-inset p-v2-block-p">
      <h3 className="mb-v2-list-gap text-xs font-semibold text-v2-fg-secondary">
        {row.startCount.toLocaleString()}회 ~ {(row.startCount + row.results.length - 1).toLocaleString()}회
      </h3>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {results.map(({ result, key }) => (
          <RecruitmentResultCard key={key} result={result} />
        ))}
      </div>
    </div>
  );
}

function RecruitmentResultCard({ result }: { result: RecruitmentDrawResult }) {
  const [revealed, setRevealed] = useState(false);
  const { name, variant } = splitVisibleStudentName(result.student.name);
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 450);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      role="img"
      aria-label={`★${result.rarity} ${result.student.name}${result.pickup ? ", 픽업" : ""}`}
      className="min-w-0 space-y-1"
    >
      <div className="relative">
        <div
          className={`transition-opacity duration-v2-base motion-reduce:transition-none ${revealed ? "opacity-100" : "opacity-0"}`}
        >
          <StudentThumb
            studentUid={result.student.uid}
            name={name}
            variant={variant}
            recruitmentLabel=""
            isNew={false}
            favorite={emptyFavorite}
            showRecruitmentLabel={false}
            captionPlacement="overlay"
            overlayOnMobile
          />
        </div>
        {!revealed ? (
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-md border border-v2-control-border ${getRaritySurface(result.rarity)}`}
          >
            <EnvelopeIcon className="size-8" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <div className={`h-1.5 rounded-full ${getTierAccentClassName(result.rarity)}`} />
    </div>
  );
}

function getRaritySurface(rarity: 1 | 2 | 3) {
  if (rarity === 1) return "bg-v2-inset text-v2-recruitment-tier-1";
  if (rarity === 2) return "bg-v2-inset text-v2-recruitment-tier-2";
  return "bg-v2-inset text-v2-recruitment-tier-3";
}
