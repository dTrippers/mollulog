import { ArrowsRightLeftIcon, ArrowsUpDownIcon, BarsArrowDownIcon, FireIcon, MagnifyingGlassIcon, ShieldCheckIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import hangul from "hangul-js";
import type { Position, Role, TacticRole } from "~/models/content.d";
import { Attack, Defense } from "~/graphql/graphql";
import { Input } from "~/components/atoms/form";
import { FilterButtons } from "~/components/navigation";

export type StudentFilterState = {
  attackTypes: Attack[];
  defenseTypes: Defense[];
  roles: Role[];
  tacticRoles: TacticRole[];
  positions: Position[];

  sort?: SortBy;
  search?: string;
};

type SortBy = "recent" | "old" | "name" | "tier";

type StudentFilterProps = {
  students: (FilterableStudent & { uid: string })[];
  onFilterChange: (uids: string[]) => void;

  useFilter?: boolean;
  sortBy?: SortBy[];
  useSearch?: boolean;
}

const attackFilterOptions = [
  { text: "폭발", color: "red" as const, value: Attack.Explosive },
  { text: "관통", color: "yellow" as const, value: Attack.Piercing },
  { text: "신비", color: "blue" as const, value: Attack.Mystic },
  { text: "진동", color: "purple" as const, value: Attack.Sonic },
  { text: "분해", color: "green" as const, value: Attack.Chemical },
];

const defenseFilterOptions = [
  { text: "경장갑", color: "red" as const, value: Defense.Light },
  { text: "중장갑", color: "yellow" as const, value: Defense.Heavy },
  { text: "특수장갑", color: "blue" as const, value: Defense.Special },
  { text: "탄력장갑", color: "purple" as const, value: Defense.Elastic },
  { text: "복합장갑", color: "green" as const, value: Defense.Composite },
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

export default function StudentFilter({ students, onFilterChange, useFilter, sortBy, useSearch }: StudentFilterProps) {
  const [state, setState] = useState<StudentFilterState>({
    attackTypes: [],
    defenseTypes: [],
    roles: [],
    tacticRoles: [],
    positions: [],
    sort: sortBy?.[0] || "recent",
  });

  const [localSearch, setLocalSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setState((prev) => ({ ...prev, search: localSearch }));
    }, 150);

    return () => clearTimeout(timer);
  }, [localSearch]);

  useEffect(() => {
    const filtered = applyStudentFilter(students, state);
    onFilterChange(filtered.map((student) => student.uid));
  }, [students, state, onFilterChange]);

  const toggleAttack = (attackType: Attack, activated: boolean) => {
    updateFilterState("attackTypes", attackType, activated, setState);
  };

  const toggleDefense = (defenseType: Defense, activated: boolean) => {
    updateFilterState("defenseTypes", defenseType, activated, setState);
  };

  const toggleRole = (role: Role, activated: boolean) => {
    updateFilterState("roles", role, activated, setState);
  };

  const toggleSort = (sort: SortBy) => {
    setState((prev) => ({ ...prev, sort }));
  };

  const togglePosition = (position: Position, activated: boolean) => {
    updateFilterState("positions", position, activated, setState);
  };

  const toggleTacticRole = (tacticRole: TacticRole, activated: boolean) => {
    updateFilterState("tacticRoles", tacticRole, activated, setState);
  };

  return (
    <>
      {useFilter && (
        <>
          <FilterButtons
            Icon={FireIcon}
            buttonProps={attackFilterOptions.map(({ text, color, value }) => ({
              text,
              color,
              active: state.attackTypes.includes(value),
              onToggle: (activated) => toggleAttack(value, activated),
            }))}
          />
          <FilterButtons
            Icon={ShieldCheckIcon}
            buttonProps={defenseFilterOptions.map(({ text, color, value }) => ({
              text,
              color,
              active: state.defenseTypes.includes(value),
              onToggle: (activated) => toggleDefense(value, activated),
            }))}
          />
          <FilterButtons
            Icon={ArrowsUpDownIcon}
            buttonProps={roleFilterOptions.map(({ text, color, value }) => ({
              text,
              color,
              active: state.roles.includes(value),
              onToggle: (activated) => toggleRole(value, activated),
            }))}
          />
          <FilterButtons
            Icon={ArrowsRightLeftIcon}
            buttonProps={positionFilterOptions.map(({ text, value }) => ({
              text,
              active: state.positions.includes(value),
              onToggle: (activated) => togglePosition(value, activated),
            }))}
          />
          <FilterButtons
            Icon={UserGroupIcon}
            buttonProps={tacticRoleFilterOptions.map(({ text, value }) => ({
              text,
              active: state.tacticRoles.includes(value),
              onToggle: (activated) => toggleTacticRole(value, activated),
            }))}
          />
        </>
      )}
      {sortBy && sortBy.length > 0 && (
        <FilterButtons
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
        />
      )}
      {useSearch && (
        <div className="mb-2 flex items-center">
          <MagnifyingGlassIcon className="size-5 mr-2" strokeWidth={2} />
          <Input
            placeholder="이름으로 찾기" className="-my-4 text-sm"
            value={localSearch}
            onChange={(value: string) => setLocalSearch(value)}
          />
        </div>
      )}
    </>
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

function updateFilterState<K extends keyof Pick<StudentFilterState, "attackTypes" | "defenseTypes" | "roles" | "tacticRoles" | "positions">>(
  key: K,
  value: StudentFilterState[K][number],
  activated: boolean,
  setState: React.Dispatch<React.SetStateAction<StudentFilterState>>,
) {
  setState((prev) => ({
    ...prev,
    [key]: activated
      ? [...prev[key], value]
      : prev[key].filter((item) => item !== value),
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
