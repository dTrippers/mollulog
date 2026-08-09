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
import { PanelBody, PanelFilterButtonRow, PanelSearchField } from "~/components/primitives";
import { Attack, Defense } from "~/graphql/graphql";
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
  tier: "★ 등급순",
};

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
}: StudentFilterProps) {
  const [internalState, setInternalState] = useState<StudentFilterState>(() =>
    createStudentFilterState(sortBy?.[0] || "recent"),
  );
  const state = controlledState ?? internalState;
  const setFilterState = useCallback(
    (updater: React.SetStateAction<StudentFilterState>) => {
      const nextState = typeof updater === "function" ? updater(state) : updater;
      if (!controlledState) {
        setInternalState(nextState);
      }
      onStateChange?.(nextState);
    },
    [controlledState, onStateChange, state],
  );

  const [localSearch, setLocalSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterState((prev) => (prev.search === localSearch ? prev : { ...prev, search: localSearch }));
    }, 150);

    return () => clearTimeout(timer);
  }, [localSearch, setFilterState]);

  useEffect(() => {
    onFilterChange?.(getFilteredStudentUids(students, state));
  }, [students, state, onFilterChange]);

  const toggleAttack = (attackType: Attack, activated: boolean) => {
    updateFilterState("attackTypes", attackType, activated, setFilterState);
  };

  const toggleDefense = (defenseType: Defense, activated: boolean) => {
    updateFilterState("defenseTypes", defenseType, activated, setFilterState);
  };

  const toggleRole = (role: Role, activated: boolean) => {
    updateFilterState("roles", role, activated, setFilterState);
  };

  const toggleSort = (sort: SortBy) => {
    setFilterState((prev) => ({ ...prev, sort }));
  };

  const togglePosition = (position: Position, activated: boolean) => {
    updateFilterState("positions", position, activated, setFilterState);
  };

  const toggleTacticRole = (tacticRole: TacticRole, activated: boolean) => {
    updateFilterState("tacticRoles", tacticRole, activated, setFilterState);
  };

  return (
    <PanelBody className="space-y-2">
      {useSearch && (
        <PanelSearchField
          label="이름으로 찾기"
          value={localSearch}
          placeholder="학생 이름"
          className="pt-1"
          onChange={setLocalSearch}
        />
      )}
      {useFilter && (
        <>
          <PanelFilterButtonRow
            Icon={FireIcon}
            buttonProps={attackFilterOptions.map(({ text, color, value }) => ({
              text,
              color,
              active: state.attackTypes.includes(value),
              onToggle: (activated) => toggleAttack(value, activated),
            }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={ShieldCheckIcon}
            buttonProps={defenseFilterOptions.map(({ text, color, value }) => ({
              text,
              color,
              active: state.defenseTypes.includes(value),
              onToggle: (activated) => toggleDefense(value, activated),
            }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={ArrowsUpDownIcon}
            buttonProps={roleFilterOptions.map(({ text, color, value }) => ({
              text,
              color,
              active: state.roles.includes(value),
              onToggle: (activated) => toggleRole(value, activated),
            }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={ArrowsRightLeftIcon}
            buttonProps={positionFilterOptions.map(({ text, value }) => ({
              text,
              active: state.positions.includes(value),
              onToggle: (activated) => togglePosition(value, activated),
            }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={UserGroupIcon}
            buttonProps={tacticRoleFilterOptions.map(({ text, value }) => ({
              text,
              active: state.tacticRoles.includes(value),
              onToggle: (activated) => toggleTacticRole(value, activated),
            }))}
            size="sm"
          />
        </>
      )}
      {sortBy && sortBy.length > 0 && (
        <PanelFilterButtonRow
          Icon={BarsArrowDownIcon}
          buttonProps={sortBy.map((sort) => ({
            text: sortFilterOptions[sort],
            active: state.sort === sort,
            onToggle: (activated: boolean) => {
              if (activated) {
                toggleSort(sort);
              }
            },
          }))}
          exclusive
          atLeastOne
          size="sm"
        />
      )}
    </PanelBody>
  );
}

type FilterableStudent = {
  attackType: Attack;
  defenseType: Defense;
  role: Role;
  position: Position;
  tacticRole: TacticRole;
  name: string;
  tier?: number;
  initialTier?: number;

  order: number;
};

function updateFilterState<
  K extends keyof Pick<StudentFilterState, "attackTypes" | "defenseTypes" | "roles" | "tacticRoles" | "positions">,
>(
  key: K,
  value: StudentFilterState[K][number],
  activated: boolean,
  setState: (updater: React.SetStateAction<StudentFilterState>) => void,
) {
  setState((prev) => ({
    ...prev,
    [key]: activated ? [...prev[key], value] : prev[key].filter((item) => item !== value),
  }));
}

export function applyStudentFilter<T extends FilterableStudent>(students: T[], state: StudentFilterState): T[] {
  const filtered = students.filter((student) => {
    if (state.attackTypes.length > 0 && !state.attackTypes.includes(student.attackType)) {
      return false;
    }
    if (state.defenseTypes.length > 0 && !state.defenseTypes.includes(student.defenseType)) {
      return false;
    }
    if (state.roles.length > 0 && !state.roles.includes(student.role)) {
      return false;
    }
    if (state.positions.length > 0 && !state.positions.includes(student.position)) {
      return false;
    }
    if (state.tacticRoles.length > 0 && !state.tacticRoles.includes(student.tacticRole)) {
      return false;
    }
    if (state.search && hangul.search(student.name, state.search) < 0) {
      return false;
    }

    return true;
  });

  if (state.sort === "recent") {
    return filtered.sort((a, b) => b.order - a.order);
  }
  if (state.sort === "old") {
    return filtered.sort((a, b) => a.order - b.order);
  }
  if (state.sort === "name") {
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (state.sort === "tier") {
    return filtered.sort((a, b) => {
      const tierA = a.tier ?? a.initialTier ?? 0;
      const tierB = b.tier ?? b.initialTier ?? 0;
      if (tierA === tierB) {
        return a.order - b.order;
      }
      return tierB - tierA;
    });
  }
  return filtered;
}
