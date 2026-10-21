import {
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  BarsArrowDownIcon,
  FireIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import hangul from "hangul-js";
import { useCallback, useEffect, useState } from "react";
import { Button, PanelBody, PanelFilterButtonRow, PanelSearchField } from "~/components/primitives";
import { Attack, Defense } from "~/graphql/graphql";
import { trackGoogleAnalyticsEventIfAllowed } from "~/lib/google-analytics-events.client";
import { defenseTypeShortLocale } from "~/locales/ko";
import type { Position, Role, TacticRole } from "~/models/content.d";

export type StudentFilterState = {
  attackTypes: Attack[];
  defenseTypes: Defense[];
  roles: Role[];
  tacticRoles: TacticRole[];
  positions: Position[];
  sort?: SortBy;
  search?: string;
};

export type SortBy = "recent" | "old" | "name" | "tier";

type StudentFilterProps = {
  students: (FilterableStudent & { uid: string })[];
  onFilterChange?: (uids: string[]) => void;
  state?: StudentFilterState;
  onStateChange?: (state: StudentFilterState) => void;
  useFilter?: boolean;
  sortBy?: SortBy[];
  useSearch?: boolean;
  searchScope?: "students" | "my_students";
};

const attackFilterOptions = [
  { text: "폭발", color: "red" as const, value: Attack.Explosive },
  { text: "관통", color: "yellow" as const, value: Attack.Piercing },
  { text: "신비", color: "blue" as const, value: Attack.Mystic },
  { text: "진동", color: "purple" as const, value: Attack.Sonic },
  { text: "분해", color: "green" as const, value: Attack.Chemical },
];
const defenseFilterOptions = [
  { text: defenseTypeShortLocale.light, color: "red" as const, value: Defense.Light },
  { text: defenseTypeShortLocale.heavy, color: "yellow" as const, value: Defense.Heavy },
  { text: defenseTypeShortLocale.special, color: "blue" as const, value: Defense.Special },
  { text: defenseTypeShortLocale.elastic, color: "purple" as const, value: Defense.Elastic },
  { text: defenseTypeShortLocale.composite, color: "green" as const, value: Defense.Composite },
];
const roleFilterOptions = [
  { text: "스트라이커", color: "red" as const, value: "striker" as const },
  { text: "스페셜", color: "blue" as const, value: "special" as const },
];
const positionFilterOptions = [
  { text: "FRONT", value: "front" as const },
  { text: "MIDDLE", value: "middle" as const },
  { text: "BACK", value: "back" as const },
];
const tacticRoleFilterOptions = [
  { text: "딜러", value: "attacker" as const },
  { text: "탱커", value: "tank" as const },
  { text: "힐러", value: "healer" as const },
  { text: "서포터", value: "support" as const },
  { text: "T.S.", value: "tactical_support" as const },
];
const sortFilterOptions: Record<SortBy, string> = {
  recent: "최신순",
  old: "과거순",
  name: "이름순",
  tier: "★ 순",
};

export const STUDENT_FILTER_OPTION_VALUES = {
  attackTypes: attackFilterOptions.map(({ value }) => value),
  defenseTypes: defenseFilterOptions.map(({ value }) => value),
  roles: roleFilterOptions.map(({ value }) => value),
  tacticRoles: tacticRoleFilterOptions.map(({ value }) => value),
  positions: positionFilterOptions.map(({ value }) => value),
} as const;

export function createStudentFilterState(sort: SortBy = "recent"): StudentFilterState {
  return {
    attackTypes: [],
    defenseTypes: [],
    roles: [],
    tacticRoles: [],
    positions: [],
    sort,
  };
}

export function hasActiveStudentFilters(state: StudentFilterState): boolean {
  return Boolean(
    state.search ||
      state.attackTypes.length ||
      state.defenseTypes.length ||
      state.roles.length ||
      state.tacticRoles.length ||
      state.positions.length,
  );
}

export function clearStudentFilters(state: StudentFilterState): StudentFilterState {
  return { ...createStudentFilterState(state.sort), search: "" };
}

export function trackStudentFilterChanges(
  scope: "students" | "my_students",
  previous: StudentFilterState,
  next: StudentFilterState,
) {
  for (const key of ["attackTypes", "defenseTypes", "roles", "tacticRoles", "positions", "sort"] as const) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) trackFilterApply(scope, key);
  }
}

export function getFilteredStudentUids<T extends FilterableStudent & { uid: string }>(
  students: T[],
  state: StudentFilterState,
): string[] {
  return applyStudentFilter(students, state).map((student) => student.uid);
}

export default function StudentFilter({
  students,
  onFilterChange,
  state: controlledState,
  onStateChange,
  useFilter,
  sortBy,
  useSearch,
  searchScope = "students",
}: StudentFilterProps) {
  const [internalState, setInternalState] = useState<StudentFilterState>(() => createStudentFilterState(sortBy?.[0] || "recent"));
  const state = controlledState ?? internalState;
  const setFilterState = useCallback(
    (updater: React.SetStateAction<StudentFilterState>) => {
      const nextState = typeof updater === "function" ? updater(state) : updater;
      if (!controlledState) setInternalState(nextState);
      onStateChange?.(nextState);
    },
    [controlledState, onStateChange, state],
  );
  const controlledSearch = controlledState?.search;
  const isControlled = controlledState !== undefined;
  const [localSearch, setLocalSearch] = useState(() => controlledSearch ?? "");

  useEffect(() => {
    setLocalSearch(isControlled ? controlledSearch ?? "" : "");
  }, [controlledSearch, isControlled]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterState((prev) => (prev.search === localSearch ? prev : { ...prev, search: localSearch }));
    }, 150);
    return () => clearTimeout(timer);
  }, [localSearch, setFilterState]);
  useEffect(() => {
    onFilterChange?.(getFilteredStudentUids(students, state));
  }, [students, state, onFilterChange]);

  const toggle = <K extends "attackTypes" | "defenseTypes" | "roles" | "tacticRoles" | "positions">(key: K, value: StudentFilterState[K][number], active: boolean) => {
    if ((state[key] as StudentFilterState[K][number][]).includes(value) !== active) trackFilterApply(searchScope, key);
    updateFilterState(key, value, active, setFilterState);
  };
  const toggleAttack = (value: Attack, active: boolean) => toggle("attackTypes", value, active);
  const toggleDefense = (value: Defense, active: boolean) => toggle("defenseTypes", value, active);
  const toggleRole = (value: Role, active: boolean) => toggle("roles", value, active);
  const togglePosition = (value: Position, active: boolean) => toggle("positions", value, active);
  const toggleTacticRole = (value: TacticRole, active: boolean) => toggle("tacticRoles", value, active);

  return (
    <PanelBody className="space-y-2">
      {useSearch ? (
        <PanelSearchField label="이름으로 찾기" value={localSearch} placeholder="학생 이름" className="pt-1" onChange={setLocalSearch} />
      ) : null}
      {useFilter ? (
        <>
          <PanelFilterButtonRow
            Icon={FireIcon}
            buttonProps={attackFilterOptions.map(({ text, color, value }) => ({ text, color, active: state.attackTypes.includes(value), onToggle: (active) => toggleAttack(value, active) }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={ShieldCheckIcon}
            buttonProps={defenseFilterOptions.map(({ text, color, value }) => ({ text, color, active: state.defenseTypes.includes(value), onToggle: (active) => toggleDefense(value, active) }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={ArrowsUpDownIcon}
            buttonProps={roleFilterOptions.map(({ text, color, value }) => ({ text, color, active: state.roles.includes(value), onToggle: (active) => toggleRole(value, active) }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={ArrowsRightLeftIcon}
            buttonProps={positionFilterOptions.map(({ text, value }) => ({ text, active: state.positions.includes(value), onToggle: (active) => togglePosition(value, active) }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={UserGroupIcon}
            buttonProps={tacticRoleFilterOptions.map(({ text, value }) => ({ text, active: state.tacticRoles.includes(value), onToggle: (active) => toggleTacticRole(value, active) }))}
            size="sm"
          />
        </>
      ) : null}
      {sortBy?.length ? (
        <PanelFilterButtonRow
          Icon={BarsArrowDownIcon}
          buttonProps={sortBy.map((sort) => ({ text: sortFilterOptions[sort], active: state.sort === sort, onToggle: (active: boolean) => { if (active && state.sort !== sort) trackFilterApply(searchScope, "sort"); if (active) setFilterState((current) => ({ ...current, sort })); } }))}
          exclusive
          atLeastOne
          size="sm"
        />
      ) : null}
      {hasActiveStudentFilters(state) ? (
        <div className="flex justify-end pt-1">
          <Button text="필터 해제" size="xs" variant="danger-subtle" onClick={() => { const nextState = clearStudentFilters(state); trackStudentFilterChanges(searchScope, state, nextState); setFilterState(nextState); }} />
        </div>
      ) : null}
    </PanelBody>
  );
}

type FilterableStudent = {
  uid?: string;
  attackType: Attack;
  defenseType: Defense;
  role: Role;
  position: Position;
  tacticRole: TacticRole;
  name: string;
  familyName?: string | null;
  altNames?: string[];
  tier?: number;
  initialTier?: number;
  order: number;
};

function trackFilterApply(_scope: "students" | "my_students", filter: string) {
  trackGoogleAnalyticsEventIfAllowed("filter_apply", { scope: "students", filter });
}

function updateFilterState<K extends "attackTypes" | "defenseTypes" | "roles" | "tacticRoles" | "positions">(
  key: K,
  value: StudentFilterState[K][number],
  active: boolean,
  setState: (updater: React.SetStateAction<StudentFilterState>) => void,
) {
  setState((prev) => ({
    ...prev,
    [key]: active ? [...prev[key], value] : prev[key].filter((item) => item !== value),
  }));
}

export function applyStudentFilter<T extends FilterableStudent>(students: T[], state: StudentFilterState): T[] {
  const filtered = students.filter((student) => {
    if (state.attackTypes.length && !state.attackTypes.includes(student.attackType)) return false;
    if (state.defenseTypes.length && !state.defenseTypes.includes(student.defenseType)) return false;
    if (state.roles.length && !state.roles.includes(student.role)) return false;
    if (state.positions.length && !state.positions.includes(student.position)) return false;
    if (state.tacticRoles.length && !state.tacticRoles.includes(student.tacticRole)) return false;
    if (state.search && ![student.name, student.familyName ?? "", ...(student.altNames ?? [])].some((name) => hangul.search(name, state.search ?? "") >= 0)) return false;
    return true;
  });
  return filtered.sort((a, b) => compareStudents(a, b, state.sort ?? "recent"));
}

function compareStudents(a: FilterableStudent, b: FilterableStudent, sort: SortBy): number {
  if (sort === "name") {
    return a.name.localeCompare(b.name, "ko") || a.order - b.order || (a.uid ?? "").localeCompare(b.uid ?? "");
  }
  if (sort === "tier") {
    const tierA = a.tier ?? a.initialTier ?? 0;
    const tierB = b.tier ?? b.initialTier ?? 0;
    return tierB - tierA || a.order - b.order || a.name.localeCompare(b.name, "ko") || (a.uid ?? "").localeCompare(b.uid ?? "");
  }
  const orderDirection = sort === "old" ? 1 : -1;
  return orderDirection * (a.order - b.order) || a.name.localeCompare(b.name, "ko") || (a.uid ?? "").localeCompare(b.uid ?? "");
}
