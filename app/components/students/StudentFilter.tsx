import { ArrowsRightLeftIcon, ArrowsUpDownIcon, BarsArrowDownIcon, FireIcon, MagnifyingGlassIcon, ShieldCheckIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import hangul from "hangul-js";
import type { AttackType, DefenseType, Position, Role, TacticRole } from "~/models/content.d";
import { FilterButtons } from "~/components/navigation";
import { Input } from "../atoms/form";

export type StudentFilterState = {
  attackTypes: AttackType[];
  defenseTypes: DefenseType[];
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

  const toggleAttackType = (attackType: AttackType, activated: boolean) => {
    setState((prev) => ({
      ...prev,
      attackTypes: activated ? [...prev.attackTypes, attackType] : prev.attackTypes.filter((type) => type !== attackType),
    }));
  };

  const toggleDefenseType = (defenseType: DefenseType, activated: boolean) => {
    setState((prev) => ({
      ...prev,
      defenseTypes: activated ? [...prev.defenseTypes, defenseType] : prev.defenseTypes.filter((type) => type !== defenseType),
    }));
  };

  const toggleRole = (role: Role, activated: boolean) => {
    setState((prev) => ({
      ...prev,
      roles: activated ? [...prev.roles, role] : prev.roles.filter((r) => r !== role),
    }));
  };

  const toggleSort = (sort: SortBy) => {
    setState((prev) => ({ ...prev, sort }));
  };

  const togglePosition = (position: Position, activated: boolean) => {
    setState((prev) => ({
      ...prev,
      positions: activated ? [...prev.positions, position] : prev.positions.filter((p) => p !== position),
    }));
  };

  const toggleTacticRole = (tacticRole: TacticRole, activated: boolean) => {
    setState((prev) => ({
      ...prev,
      tacticRoles: activated ? [...prev.tacticRoles, tacticRole] : prev.tacticRoles.filter((r) => r !== tacticRole),
    }));
  };

  return (
    <>
      {useFilter && (
        <>
          <FilterButtons
            Icon={FireIcon}
            buttonProps={[
              { text: "폭발", color: "red", active: state.attackTypes.includes("explosive"), onToggle: (activated) => toggleAttackType("explosive", activated) },
              { text: "관통", color: "yellow", active: state.attackTypes.includes("piercing"), onToggle: (activated) => toggleAttackType("piercing", activated) },
              { text: "신비", color: "blue", active: state.attackTypes.includes("mystic"), onToggle: (activated) => toggleAttackType("mystic", activated) },
              { text: "진동", color: "purple", active: state.attackTypes.includes("sonic"), onToggle: (activated) => toggleAttackType("sonic", activated) },
            ]}
          />
          <FilterButtons
            Icon={ShieldCheckIcon}
            buttonProps={[
              { text: "경장갑", color: "red", active: state.defenseTypes.includes("light"), onToggle: (activated) => toggleDefenseType("light", activated) },
              { text: "중장갑", color: "yellow", active: state.defenseTypes.includes("heavy"), onToggle: (activated) => toggleDefenseType("heavy", activated) },
              { text: "특수", color: "blue", active: state.defenseTypes.includes("special"), onToggle: (activated) => toggleDefenseType("special", activated) },
              { text: "탄력", color: "purple", active: state.defenseTypes.includes("elastic"), onToggle: (activated) => toggleDefenseType("elastic", activated) },
            ]}
          />
          <FilterButtons
            Icon={ArrowsUpDownIcon}
            buttonProps={[
              { text: "스트라이커", color: "red", active: state.roles.includes("striker"), onToggle: (activated) => toggleRole("striker", activated) },
              { text: "스페셜", color: "blue", active: state.roles.includes("special"), onToggle: (activated) => toggleRole("special", activated) },
            ]}
          />
          <FilterButtons
            Icon={ArrowsRightLeftIcon}
            buttonProps={[
              { text: "FRONT", active: state.positions.includes("front"), onToggle: (activated) => togglePosition("front", activated) },
              { text: "MIDDLE", active: state.positions.includes("middle"), onToggle: (activated) => togglePosition("middle", activated) },
              { text: "BACK", active: state.positions.includes("back"), onToggle: (activated) => togglePosition("back", activated) },
            ]}
          />
          <FilterButtons
            Icon={UserGroupIcon}
            buttonProps={[
              { text: "딜러", active: state.tacticRoles.includes("attacker"), onToggle: (activated) => toggleTacticRole("attacker", activated) },
              { text: "탱커", active: state.tacticRoles.includes("tank"), onToggle: (activated) => toggleTacticRole("tank", activated) },
              { text: "힐러", active: state.tacticRoles.includes("healer"), onToggle: (activated) => toggleTacticRole("healer", activated) },
              { text: "서포터", active: state.tacticRoles.includes("support"), onToggle: (activated) => toggleTacticRole("support", activated) },
              { text: "T.S.", active: state.tacticRoles.includes("tactical_support"), onToggle: (activated) => toggleTacticRole("tactical_support", activated) },
            ]}
          />
        </>
      )}
      {sortBy && sortBy.length > 0 && (
        <FilterButtons
          Icon={BarsArrowDownIcon}
          buttonProps={[
            sortBy.includes("recent") ? { text: "최신순", active: state.sort === "recent", onToggle: (activated: boolean) => activated ? toggleSort("recent") : undefined } : null,
            sortBy.includes("old") ? { text: "과거순", active: state.sort === "old", onToggle: (activated: boolean) => activated ? toggleSort("old") : undefined } : null,
            sortBy.includes("name") ? { text: "이름순", active: state.sort === "name", onToggle: (activated: boolean) => activated ? toggleSort("name") : undefined } : null,
            sortBy.includes("tier") ? { text: "★ 등급순", active: state.sort === "tier", onToggle: (activated: boolean) => activated ? toggleSort("tier") : undefined } : null,
          ].filter((button) => button !== null)}
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
            onChange={(value) => setLocalSearch(value)}
          />
        </div>
      )}
    </>
  );
}

type FilterableStudent = {
  attackType: AttackType;
  defenseType: DefenseType;
  role: Role;
  position: Position;
  tacticRole: TacticRole;
  name: string;
  tier?: number;
  initialTier?: number;

  order: number;
};

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
  } else if (state.sort === "old") {
    return filtered.sort((a, b) => a.order - b.order);
  } else if (state.sort === "name") {
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (state.sort === "tier") {
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
