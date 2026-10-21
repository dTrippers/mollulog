import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useOutletContext, useSearchParams } from "react-router";
import { getActiveSensei } from "~/auth/authenticator.server";
import { RaidRankScreen } from "~/components/features/raids";
import RaidRankFilter, {
  mergeFilteredStudents,
  type RaidRankFilterState,
} from "~/components/features/raids/RaidRankFilter";
import { Button } from "~/components/primitives";
import { EXACT_PARTY_SEARCH_PARAM, parseExactParties } from "~/domain/raid-exact-parties";
import { getFilterableRaidDifficulties } from "~/domain/raid-score";
import { nowUtcIso } from "~/lib/date-time";
import { fetchRaidStatisticsByRaid } from "~/lib/ranks/stats";
import { trackGoogleAnalyticsEvent, trackGoogleAnalyticsEventIfAllowed } from "~/lib/google-analytics-events.client";
import type { RaidType } from "~/models/content.d";
import { getRecruitedStudentTiers } from "~/models/recruited-student";
import { getAllStudentsMap } from "~/models/student";
import type { RaidPageContext } from "./raids.$raidType.$seasonIndex";
import RaidUnavailableState from "./raids.$raidType.$seasonIndex._components/RaidUnavailableState";
import {
  hasAppliedRaidRankFilterSettings,
  normalizeRaidRankFilterSettings,
  useRaidRankFilterSettings,
} from "./raids.$raidType.$seasonIndex._components/rank-filter-settings";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  const { env } = context.cloudflare;
  const rawAllStudents = await getAllStudentsMap(env, true);
  const allStudents = Object.fromEntries(
    Object.entries(rawAllStudents).map(([uid, student]) => [
      uid,
      {
        name: student.name,
        attackType: student.attackType,
        defenseType: student.defenseType,
        role: student.role,
      },
    ]),
  );

  const sensei = await getActiveSensei(env, request);
  const recruitedStudentTiers = sensei ? await getRecruitedStudentTiers(env, sensei.id) : {};

  return {
    allStudents,
    recruitedStudentTiers,
  };
};

export default function RaidRanks() {
  const { currentRaid, defenseType, defenseTypeSet, setPanel, signedIn } = useOutletContext<RaidPageContext>();
  const { allStudents, recruitedStudentTiers } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const jpSeasonIndex = currentRaid.jpSchedule?.seasonIndex ?? null;
  const exactParties = useMemo(() => parseExactParties(searchParams), [searchParams]);
  const {
    settings: rankFilterSettings,
    setSettings: setRankFilterSettings,
    clearSettings: clearRankFilterSettings,
  } = useRaidRankFilterSettings({
    raidType: currentRaid.raidType as RaidType,
    seasonIndex: jpSeasonIndex ?? currentRaid.seasonIndex,
    defenseType,
  });
  const rankFilterState = useMemo(() => ({ ...rankFilterSettings, exactParties }), [exactParties, rankFilterSettings]);
  const appliedRankFilterState = useMemo(
    () => (signedIn ? rankFilterState : { ...rankFilterState, filterNotOwned: false, allowBorrowedStudent: false }),
    [rankFilterState, signedIn],
  );
  const setRankFilterState = useCallback<React.Dispatch<React.SetStateAction<RaidRankFilterState>>>(
    (updater) => {
      setRankFilterSettings((previous) => {
        const previousState = { ...previous, exactParties };
        const nextState = typeof updater === "function" ? updater(previousState) : updater;
        const nextWithExactParties = { ...nextState, exactParties };
        const trackedFields: [keyof RaidRankFilterState, string][] = [
          ["difficulty", "difficulty"],
          ["includeStudents", "includeStudents"],
          ["excludeStudents", "excludeStudents"],
          ["filterNotOwned", "filterNotOwned"],
          ["allowBorrowedStudent", "allowBorrowedStudent"],
          ["exactParties", "exactParties"],
        ];
        for (const [field, filter] of trackedFields) {
          if (JSON.stringify(previousState[field]) !== JSON.stringify(nextWithExactParties[field])) {
            trackGoogleAnalyticsEventIfAllowed("filter_apply", { scope: "raid_ranks", filter });
          }
        }
        return normalizeRaidRankFilterSettings(nextState);
      });
    },
    [exactParties, setRankFilterSettings],
  );
  const hasAppliedFilters = hasAppliedRaidRankFilterSettings(rankFilterSettings, signedIn);

  // Get all students for current raid
  const [filterableStudents, setFilterableStudents] = useState<{ uid: string; name: string; tiers: number[] }[]>([]);
  useEffect(() => {
    if (jpSeasonIndex === null) {
      return;
    }
    const loadFilterableStudents = async () => {
      const statistics = await fetchRaidStatisticsByRaid(currentRaid.raidType as RaidType, jpSeasonIndex, defenseType);
      setFilterableStudents(
        statistics
          .map(({ studentUid, slotsByTier, assistsByTier }) => {
            if (!allStudents[studentUid]) {
              return null;
            }
            return {
              uid: studentUid,
              name: allStudents[studentUid].name,
              tiers: Array.from(
                new Set([...slotsByTier.map((slot) => slot.tier), ...assistsByTier.map((assist) => assist.tier)]),
              ),
            };
          })
          .filter((student) => student !== null),
      );
    };
    loadFilterableStudents();
  }, [currentRaid.raidType, jpSeasonIndex, defenseType, allStudents]);

  const filterableDifficulties = useMemo(
    () => getFilterableRaidDifficulties(defenseTypeSet.difficulty),
    [defenseTypeSet.difficulty],
  );

  useEffect(() => {
    if (jpSeasonIndex === null) {
      return;
    }

    setPanel({
      title: "편성 찾기",
      description: "특정 학생을 포함/제외한 편성을 찾아보세요",
      Icon: MagnifyingGlassIcon,
      headerAction: hasAppliedFilters ? (
        <Button
          text="필터 해제"
          size="xs"
          variant="danger-subtle"
          onClick={() => {
            for (const [field, filter] of [
              ["difficulty", "difficulty"],
              ["includeStudents", "includeStudents"],
              ["excludeStudents", "excludeStudents"],
              ["filterNotOwned", "filterNotOwned"],
              ["allowBorrowedStudent", "allowBorrowedStudent"],
            ] as const) {
              const value = rankFilterState[field as keyof RaidRankFilterState];
              if (Array.isArray(value) ? value.length > 0 : Boolean(value)) {
                trackGoogleAnalyticsEvent("filter_apply", { scope: "raid_ranks", filter });
              }
            }
            clearRankFilterSettings();
          }}
        />
      ) : undefined,
      children: (
        <RaidRankFilter
          state={appliedRankFilterState}
          setState={setRankFilterState}
          signedIn={signedIn}
          onClearExactParties={() => {
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.delete(EXACT_PARTY_SEARCH_PARAM);
                return next;
              },
              { replace: true },
            );
          }}
          filterableStudents={filterableStudents}
          filterableDifficulties={filterableDifficulties}
        />
      ),
    });
  }, [
    appliedRankFilterState,
    clearRankFilterSettings,
    filterableDifficulties,
    filterableStudents,
    hasAppliedFilters,
    jpSeasonIndex,
    rankFilterState,
    setPanel,
    setRankFilterState,
    setSearchParams,
    signedIn,
  ]);

  if (jpSeasonIndex === null) {
    return <RaidUnavailableState raidType={currentRaid.raidType as RaidType} />;
  }

  return (
    <RaidRankScreen
      currentRaid={{
        boss: currentRaid.raidBoss.uid,
        since: currentRaid.startAt ?? nowUtcIso(),
        raidType: currentRaid.raidType as RaidType,
        seasonIndex: jpSeasonIndex,
        defenseType,
      }}
      filterState={rankFilterState}
      allStudents={allStudents}
      recruitedStudentTiers={recruitedStudentTiers}
      signedIn={signedIn}
      onIncludeStudent={({ uid }) => {
        setRankFilterState((prev) => ({
          ...prev,
          includeStudents: mergeFilteredStudents(prev.includeStudents, { uid, tiers: [] }),
        }));
      }}
      onExcludeStudent={({ uid }) => {
        setRankFilterState((prev) => ({
          ...prev,
          excludeStudents: mergeFilteredStudents(prev.excludeStudents, { uid, tiers: [] }),
        }));
      }}
    />
  );
}
