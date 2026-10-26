import { IdentificationIcon, MinusCircleIcon, PlayIcon, PlusCircleIcon } from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, EmptyView, Pagination } from "~/components/primitives";
import { getRaidDifficultyScoreRange, normalizeBossUid, scoreToDifficultyAndTime } from "~/domain/raid-score";
import type { Defense } from "~/graphql/graphql";
import type { UtcIsoString } from "~/lib/date-time";
import { convertTier, fetchRanks, type ParsedRaidRankDocument } from "~/lib/ranks/ranks";
import { trackGoogleAnalyticsEvent } from "~/lib/google-analytics-events.client";
import { sanitizeErrorForLogging } from "~/lib/privacy-scrub";
import type { RaidType } from "~/models/content.d";
import RaidPartyCard, { type RaidPartySlot } from "./RaidPartyCard";
import type { RaidRankFilterState } from "./RaidRankFilter";
import { getMaxLevelAt, type RaidPartyStudentMap, toRaidPartyRow } from "./toRaidPartyRow";

type RaidRankScreenProps = {
  currentRaid: {
    boss: string;
    since: UtcIsoString | Date;
    raidType: RaidType;
    seasonIndex: number;
    defenseType: Defense;
  };
  filterState: RaidRankFilterState;

  onIncludeStudent: (student: { uid: string; tier: number }) => void;
  onExcludeStudent: (student: { uid: string; tier: number }) => void;

  allStudents: RaidPartyStudentMap;
  recruitedStudentTiers: Record<string, number>;
  signedIn: boolean;
};

const ITEMS_PER_PAGE = 10;

type RaidRankApiStudentFilter = {
  uid: string;
  tiers: Array<[number] | [number, number]>;
  borrowable?: true;
};

export function buildRaidRankApiFilter({
  filterState,
  allStudents,
  recruitedStudentTiers,
  signedIn,
}: {
  filterState: RaidRankFilterState;
  allStudents: RaidPartyStudentMap;
  recruitedStudentTiers: Record<string, number>;
  signedIn: boolean;
}) {
  const borrowMode = signedIn && filterState.filterNotOwned && filterState.allowBorrowedStudent;
  const toApiStudentFilter = (student: { uid: string; tiers: number[] }): RaidRankApiStudentFilter => ({
    uid: student.uid,
    tiers: student.tiers.map((totalTier) => {
      const { tier, weaponTier } = convertTier(totalTier);
      return weaponTier !== undefined && weaponTier > 0 ? [tier, weaponTier] : [tier];
    }),
  });
  const includeStudents = filterState.includeStudents.map(toApiStudentFilter);
  const excludeStudents = filterState.excludeStudents.map(toApiStudentFilter);

  if (signedIn && filterState.filterNotOwned) {
    const unownedStudentUids = Object.entries(allStudents)
      .filter(([uid, student]) => !recruitedStudentTiers[student.primaryUid ?? uid])
      .map(([uid]) => uid);
    const existingExcludeUids = new Set(excludeStudents.map((student) => student.uid));
    const allTierExcludeUids = new Set(
      excludeStudents.filter((student) => student.tiers.length === 0).map((student) => student.uid),
    );
    for (const uid of unownedStudentUids) {
      if (borrowMode && !allTierExcludeUids.has(uid)) {
        excludeStudents.push({ uid, tiers: [], borrowable: true });
      } else if (!borrowMode && !existingExcludeUids.has(uid)) {
        excludeStudents.push({
          uid,
          tiers: [],
        });
      }
    }
  }

  return {
    exactParties: filterState.exactParties,
    includeStudents,
    excludeStudents,
    score: getRaidDifficultyScoreRange(filterState.difficulty),
    ...(borrowMode ? { maxBorrowedSlots: 1 as const } : {}),
    showUnrecruitedStudents: borrowMode,
  };
}

export default function RaidRankScreen({
  currentRaid,
  filterState,
  onIncludeStudent,
  onExcludeStudent,
  allStudents,
  recruitedStudentTiers,
  signedIn,
}: RaidRankScreenProps) {
  const [ranks, setRanks] = useState<ParsedRaidRankDocument[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousResetKeyRef = useRef<string | null>(null);

  const apiFilter = useMemo(
    () => buildRaidRankApiFilter({ filterState, allStudents, recruitedStudentTiers, signedIn }),
    [allStudents, filterState, recruitedStudentTiers, signedIn],
  );

  const resetKey = JSON.stringify({
    raidType: currentRaid.raidType,
    seasonIndex: currentRaid.seasonIndex,
    defenseType: currentRaid.defenseType,
    apiFilter,
  });

  useEffect(() => {
    let cancelled = false;

    if (previousResetKeyRef.current !== null && previousResetKeyRef.current !== resetKey && currentPage !== 1) {
      previousResetKeyRef.current = resetKey;
      setLoading(true);
      setError(null);
      setCurrentPage(1);
      return;
    }

    previousResetKeyRef.current = resetKey;
    setLoading(true);
    setError(null);

    const loadRanks = async () => {
      try {
        const { exactParties, includeStudents, excludeStudents, maxBorrowedSlots } = apiFilter;

        const result = await fetchRanks({
          raidType: currentRaid.raidType,
          season: currentRaid.seasonIndex,
          defenseType: currentRaid.defenseType,
          score: apiFilter.score,
          exactParties,
          includeStudents,
          excludeStudents,
          maxBorrowedSlots,
          perPage: ITEMS_PER_PAGE,
          page: currentPage,
        });

        if (cancelled) {
          return;
        }

        setRanks(result.ranks);
        setTotalCount(result.totalCount);
        setLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load ranks");
        setLoading(false);
      }
    };

    loadRanks();

    return () => {
      cancelled = true;
    };
  }, [apiFilter, currentPage, currentRaid.defenseType, currentRaid.raidType, currentRaid.seasonIndex, resetKey]);

  if (loading) {
    return <LoadingRanks />;
  }

  if (error) {
    return <EmptyView text={`오류가 발생했어요: ${error}`} />;
  }

  if (ranks.length === 0) {
    return <EmptyView text="조건에 맞는 순위 정보가 없어요." />;
  }

  // Calculate pagination
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const filteredRanks = ranks;
  const maxLevel = getMaxLevelAt(currentRaid.since);
  return (
    <div className="space-y-3">
      {filteredRanks.map(({ rank, score, parties, youtubeIds }) => {
        const clearTimeLabel = getClearTimeLabel({
          raidType: currentRaid.raidType,
          bossUid: currentRaid.boss,
          score,
        });
        const rows = parties.map((party) =>
          toRaidPartyRow({
            party,
            allStudents,
            maxLevel,
            recruitedStudentTiers,
            showUnrecruitedStudents: apiFilter.showUnrecruitedStudents,
          }),
        );
        return (
          <RaidPartyCard
            key={`rank-${rank}-${score}`}
            primaryLabel={`${rank.toLocaleString()}위`}
            rows={rows}
            summaryItems={[
              { label: "점수", value: `${score.toLocaleString()}점` },
              ...(clearTimeLabel ? [{ label: "클리어 시간", value: clearTimeLabel }] : []),
            ]}
            actions={youtubeIds.map((youtubeId) => (
              <Button
                key={youtubeId}
                href={`https://www.youtube.com/watch?v=${youtubeId}`}
                onClick={() =>
                  trackGoogleAnalyticsEvent("raid_video_opened", { raid_type: currentRaid.raidType })
                }
                target="_blank"
                variant="default"
                size="xs"
                icon={PlayIcon}
                text="영상 보기"
              />
            ))}
            popupIdPrefix={`rank-${rank}-${score}`}
            showStartingSkillOrder
            compactLevel
            getStudentActions={(slot) => getRankStudentActions(slot, onIncludeStudent, onExcludeStudent)}
          />
        );
      })}

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
    </div>
  );
}

function getRankStudentActions(
  slot: RaidPartySlot,
  onIncludeStudent: RaidRankScreenProps["onIncludeStudent"],
  onExcludeStudent: RaidRankScreenProps["onExcludeStudent"],
) {
  const uid = slot.uid;
  const tier = slot.tier;

  if (!uid) {
    return [];
  }

  return [
    ...(tier
      ? [
          {
            Icon: PlusCircleIcon,
            text: "이 학생을 포함한 편성만 보기",
            onClick: () => onIncludeStudent({ uid, tier }),
          },
          {
            Icon: MinusCircleIcon,
            text: "이 학생을 제외한 편성만 보기",
            onClick: () => onExcludeStudent({ uid, tier }),
          },
        ]
      : []),
    {
      Icon: IdentificationIcon,
      text: "학생부 보기 (평가/통계)",
      link: `/students/${uid}`,
    },
  ];
}

function getClearTimeLabel({
  raidType,
  bossUid,
  score,
}: {
  raidType: RaidType;
  bossUid: string;
  score: number;
}): string | null {
  if (raidType !== "total_assault" && raidType !== "elimination") {
    return null;
  }

  const boss = normalizeBossUid(bossUid);
  if (!boss) {
    console.error("Failed to resolve raid boss for clear time label.", { raidType, bossUid, score });
    return null;
  }

  try {
    return formatClearTime(scoreToDifficultyAndTime(boss, score).clearTimeMillisec);
  } catch (error) {
    console.error("Failed to format clear time label.", {
      raidType,
      bossUid,
      score,
      error: sanitizeErrorForLogging(error),
    });
    return null;
  }
}

function formatClearTime(clearTimeMillisec: number): string {
  const clearMinutes = Math.floor(clearTimeMillisec / 60000);
  const clearSeconds = Math.floor((clearTimeMillisec % 60000) / 1000);
  const clearMilliseconds = clearTimeMillisec % 1000;

  return `${clearMinutes.toString().padStart(2, "0")}:${clearSeconds.toString().padStart(2, "0")}.${clearMilliseconds.toString().padStart(3, "0")}`;
}

// Spinner animation
function LoadingRanks() {
  return (
    <div className="my-16 flex flex-col items-center justify-center gap-y-4 text-foreground">
      <div
        className="animate-spin inline-block size-10 border-3 border-current border-t-transparent rounded-full"
        role="status"
        aria-label="loading"
      >
        <span className="sr-only">Loading...</span>
      </div>
      <p>데이터를 불러오고 있어요...</p>
    </div>
  );
}
