import { ChevronDownIcon, StarIcon } from "@heroicons/react/16/solid";
import {
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  BarsArrowDownIcon,
  FireIcon,
  ShieldCheckIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import hangul from "hangul-js";
import { useCallback, useEffect, useId, useState } from "react";
import {
  Button,
  Dropdown,
  FilterButtons,
  PanelActionRow,
  PanelBody,
  PanelFilterButtonRow,
  PanelFilterButtonsSection,
  PanelSearchField,
} from "~/components/primitives";
import { Attack, Defense } from "~/graphql/graphql";
import {
  attackTypeLocale,
  defenseTypeShortLocale,
  equipmentTypeLocale,
  equipmentTypeOrder,
  positionLocale,
  roleLocale,
  schoolShortLocale,
  tacticRoleLocale,
} from "~/locales/ko";
import type { Position, Role, TacticRole } from "~/models/content.d";
import type { StudentDirectoryDisplayField, StudentDirectoryGroupBy } from "~/models/student-directory";

export type StudentFilterState = {
  attackTypes: Attack[];
  defenseTypes: Defense[];
  roles: Role[];
  tacticRoles: TacticRole[];
  positions: Position[];
  schools: string[];
  equipmentSlots: [string[], string[], string[]];
  initialTiers: number[];

  sort?: SortBy;
  groupBy?: StudentDirectoryGroupBy;
  displayBy?: StudentDirectoryDisplayField;
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
  directory?: boolean;
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

const equipmentTypesBySlot = [
  equipmentTypeOrder.slice(0, 3),
  equipmentTypeOrder.slice(3, 6),
  equipmentTypeOrder.slice(6, 9),
] as const;

const equipmentSlotDescriptors = [
  { key: "equipment1", slotIndex: 0, title: "장비 1" },
  { key: "equipment2", slotIndex: 1, title: "장비 2" },
  { key: "equipment3", slotIndex: 2, title: "장비 3" },
] as const;

const responsiveFilterIconClassName = "lg:[&>svg]:hidden xl:[&>svg]:block";

export const STUDENT_FILTER_OPTION_VALUES = {
  attackTypes: attackFilterOptions.map(({ value }) => value),
  defenseTypes: defenseFilterOptions.map(({ value }) => value),
  roles: roleFilterOptions.map(({ value }) => value),
  positions: positionFilterOptions.map(({ value }) => value),
  tacticRoles: tacticRoleFilterOptions.map(({ value }) => value),
  schools: Object.keys(schoolShortLocale),
  equipmentTypes: [...equipmentTypeOrder],
  initialTiers: [1, 2, 3],
} as const;

export const STUDENT_DIRECTORY_GROUP_VALUES = [
  "none",
  "school",
  "attackType",
  "defenseType",
  "role",
  "position",
] as const satisfies readonly StudentDirectoryGroupBy[];

export const STUDENT_DIRECTORY_DISPLAY_VALUES = [
  "none",
  "school",
  "attackType",
  "defenseType",
  "role",
  "tacticRole",
  "position",
  "equipment1",
  "equipment2",
  "equipment3",
  "initialTier",
  "age",
  "schoolYear",
  "height",
  "street",
  "outdoor",
  "indoor",
] as const satisfies readonly StudentDirectoryDisplayField[];

const sortFilterOptions: Record<SortBy, string> = {
  recent: "최신순",
  old: "과거순",
  name: "이름순",
  tier: "★ 성급순",
};

export function createStudentFilterState(sort: SortBy = "recent"): StudentFilterState {
  return {
    attackTypes: [],
    defenseTypes: [],
    roles: [],
    tacticRoles: [],
    positions: [],
    schools: [],
    equipmentSlots: [[], [], []],
    initialTiers: [],
    sort,
    groupBy: "none",
    displayBy: "none",
  };
}

export function hasActiveStudentFilters(state: StudentFilterState): boolean {
  return Boolean(
    state.search ||
      state.attackTypes?.length ||
      state.defenseTypes?.length ||
      state.roles?.length ||
      state.tacticRoles?.length ||
      state.positions?.length ||
      state.schools?.length ||
      state.equipmentSlots?.some((slot) => slot.length) ||
      state.initialTiers?.length,
  );
}

export function getActiveStudentDirectoryFilterCount(state: StudentFilterState): number {
  return (
    (state.schools?.length ?? 0) +
    (state.equipmentSlots?.reduce((count, slot) => count + (slot?.length ?? 0), 0) ?? 0) +
    (state.initialTiers?.length ?? 0)
  );
}

export function clearStudentFilters(state: StudentFilterState): StudentFilterState {
  return {
    ...createStudentFilterState(state.sort),
    groupBy: state.groupBy ?? "none",
    displayBy: state.displayBy ?? "none",
    search: "",
  };
}

type StudentDirectoryDisplaySettingsProps = {
  state: StudentFilterState;
  onStateChange: (state: StudentFilterState) => void;
};

export function StudentDirectoryDisplaySettings({ state, onStateChange }: StudentDirectoryDisplaySettingsProps) {
  return (
    <PanelBody className="space-y-0">
      <PanelActionRow
        title="표시 정보"
        actions={
          <Dropdown
            aria-label="학생 카드 표시 정보"
            value={state.displayBy ?? "none"}
            options={studentDisplayOptions}
            onChange={(displayBy) => onStateChange({ ...state, displayBy })}
            size="xs"
          />
        }
      />
      <PanelActionRow
        title="그룹"
        actions={
          <Dropdown
            aria-label="학생 그룹"
            value={state.groupBy ?? "none"}
            options={studentGroupOptions}
            onChange={(groupBy) => onStateChange({ ...state, groupBy })}
            size="xs"
          />
        }
      />
    </PanelBody>
  );
}

export function getStudentDirectoryDisplaySettingsSummary(state: StudentFilterState): string {
  const displayLabel = studentDisplayOptions.find((option) => option.value === state.displayBy)?.label ?? "없음";
  const groupLabel = studentGroupOptions.find((option) => option.value === state.groupBy)?.label ?? "그룹 없음";
  return `${displayLabel} · ${groupLabel}`;
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
  directory = false,
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
  const advancedFiltersId = useId();
  const activeAdvancedFilterCount = getActiveStudentDirectoryFilterCount(state);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(() => directory && activeAdvancedFilterCount > 0);

  useEffect(() => {
    if (directory && activeAdvancedFilterCount > 0) {
      setAdvancedFiltersOpen(true);
    }
  }, [activeAdvancedFilterCount, directory]);

  const controlledSearch = controlledState?.search;
  const isControlled = controlledState !== undefined;
  const [localSearch, setLocalSearch] = useState(() => controlledSearch ?? "");

  useEffect(() => {
    setLocalSearch(isControlled ? (controlledSearch ?? "") : "");
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

  const toggleSchool = (school: string, activated: boolean) => {
    updateFilterState("schools", school, activated, setFilterState);
  };

  const toggleEquipment = (slotIndex: number, equipment: string, activated: boolean) => {
    setFilterState((prev) => {
      const equipmentSlots: [string[], string[], string[]] = [
        [...(prev.equipmentSlots?.[0] ?? [])],
        [...(prev.equipmentSlots?.[1] ?? [])],
        [...(prev.equipmentSlots?.[2] ?? [])],
      ];
      const currentSlot = equipmentSlots[slotIndex] ?? [];
      equipmentSlots[slotIndex] = activated
        ? currentSlot.includes(equipment)
          ? currentSlot
          : [...currentSlot, equipment]
        : currentSlot.filter((item) => item !== equipment);
      return { ...prev, equipmentSlots };
    });
  };

  const toggleInitialTier = (initialTier: number, activated: boolean) => {
    setFilterState((prev) => {
      const initialTiers = prev.initialTiers ?? [];
      return {
        ...prev,
        initialTiers: activated
          ? initialTiers.includes(initialTier)
            ? initialTiers
            : [...initialTiers, initialTier]
          : initialTiers.filter((tier) => tier !== initialTier),
      };
    });
  };

  const schoolOptions = getSchoolOptions(students);
  const equipmentOptionsBySlot = equipmentSlotDescriptors.map((descriptor) => ({
    ...descriptor,
    options: getEquipmentOptions(descriptor.slotIndex),
  }));

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
            className={directory ? responsiveFilterIconClassName : undefined}
            buttonGroupClassName={directory ? "flex-nowrap gap-x-0.5 md:gap-x-0.5" : undefined}
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
            className={directory ? responsiveFilterIconClassName : undefined}
            buttonGroupClassName={directory ? "flex-nowrap gap-x-0.5 md:gap-x-0.5" : undefined}
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
            className={directory ? responsiveFilterIconClassName : undefined}
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
            className={directory ? responsiveFilterIconClassName : undefined}
            buttonProps={positionFilterOptions.map(({ text, value }) => ({
              text,
              active: state.positions.includes(value),
              onToggle: (activated) => togglePosition(value, activated),
            }))}
            size="sm"
          />
          <PanelFilterButtonRow
            Icon={UserGroupIcon}
            className={directory ? responsiveFilterIconClassName : undefined}
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
          className={directory ? responsiveFilterIconClassName : undefined}
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
      {directory && useFilter && (
        <>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            aria-expanded={advancedFiltersOpen}
            aria-controls={advancedFiltersId}
            onClick={() => setAdvancedFiltersOpen((current) => !current)}
          >
            <span className="inline-flex items-center gap-2">
              <span>더 보기</span>
              {activeAdvancedFilterCount > 0 && <span>{activeAdvancedFilterCount}개 적용</span>}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className={`size-4 transition-transform ${advancedFiltersOpen ? "rotate-180" : ""}`}
            />
          </button>
          {advancedFiltersOpen && (
            <div id={advancedFiltersId} className="space-y-2 pt-1">
              {schoolOptions.length > 0 && (
                <PanelFilterButtonsSection
                  title="학교"
                  buttonProps={schoolOptions.map(({ text, value }) => ({
                    text,
                    active: state.schools?.includes(value),
                    onToggle: (activated: boolean) => toggleSchool(value, activated),
                  }))}
                  size="sm"
                />
              )}
              {equipmentOptionsBySlot.map(({ key, options, slotIndex, title }) => (
                <PanelActionRow
                  key={key}
                  title={title}
                  actions={
                    <FilterButtons
                      buttonProps={options.map(({ text, value }) => ({
                        text,
                        active: state.equipmentSlots?.[slotIndex]?.includes(value),
                        onToggle: (activated: boolean) => toggleEquipment(slotIndex, value, activated),
                      }))}
                      size="sm"
                      className="my-0 shrink-0"
                      buttonGroupClassName="flex-nowrap"
                    />
                  }
                />
              ))}
              <PanelActionRow
                title="초기 성급"
                actions={
                  <InitialTierFilterButtons selectedTiers={state.initialTiers ?? []} onToggle={toggleInitialTier} />
                }
              />
            </div>
          )}
        </>
      )}
      {hasActiveStudentFilters(state) ? (
        <div className="flex justify-end pt-1">
          <Button
            text="필터 해제"
            size="xs"
            variant="danger-subtle"
            onClick={() => setFilterState(clearStudentFilters)}
          />
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
  school?: string;
  equipments?: string[];
  tier?: number;
  initialTier?: number;

  order: number;
};

function updateFilterState<
  K extends keyof Pick<
    StudentFilterState,
    "attackTypes" | "defenseTypes" | "roles" | "tacticRoles" | "positions" | "schools"
  >,
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
    if (state.attackTypes?.length && !state.attackTypes.includes(student.attackType)) {
      return false;
    }
    if (state.defenseTypes?.length && !state.defenseTypes.includes(student.defenseType)) {
      return false;
    }
    if (state.roles?.length && !state.roles.includes(student.role)) {
      return false;
    }
    if (state.positions?.length && !state.positions.includes(student.position)) {
      return false;
    }
    if (state.tacticRoles?.length && !state.tacticRoles.includes(student.tacticRole)) {
      return false;
    }
    if (state.schools?.length && (!student.school || !state.schools.includes(student.school))) {
      return false;
    }
    if (
      state.equipmentSlots?.some(
        (slot, index) =>
          Boolean(slot?.length) && (!student.equipments || !slot.includes(student.equipments[index] ?? "")),
      )
    ) {
      return false;
    }
    if (state.initialTiers?.length && (!student.initialTier || !state.initialTiers.includes(student.initialTier))) {
      return false;
    }
    if (
      state.search &&
      !getSearchableStudentNames(student).some((name) => hangul.search(name, state.search ?? "") >= 0)
    ) {
      return false;
    }

    return true;
  });

  return filtered.sort((a, b) => compareStudents(a, b, state.sort ?? "recent"));
}

function getSearchableStudentNames(student: FilterableStudent): string[] {
  return [student.name, student.familyName ?? "", ...(student.altNames ?? [])].filter(Boolean);
}

function compareStudents(a: FilterableStudent, b: FilterableStudent, sort: SortBy): number {
  if (sort === "name") {
    return a.name.localeCompare(b.name, "ko") || a.order - b.order || (a.uid ?? "").localeCompare(b.uid ?? "");
  }

  if (sort === "tier") {
    const tierA = a.tier ?? a.initialTier ?? 0;
    const tierB = b.tier ?? b.initialTier ?? 0;
    return (
      tierB - tierA ||
      a.order - b.order ||
      a.name.localeCompare(b.name, "ko") ||
      (a.uid ?? "").localeCompare(b.uid ?? "")
    );
  }

  const orderDirection = sort === "old" ? 1 : -1;
  return (
    orderDirection * (a.order - b.order) ||
    a.name.localeCompare(b.name, "ko") ||
    (a.uid ?? "").localeCompare(b.uid ?? "")
  );
}

function getSchoolOptions<T extends FilterableStudent>(students: T[]) {
  return [...new Set(students.map((student) => student.school).filter((school): school is string => Boolean(school)))]
    .sort(compareSchoolValues)
    .map((value) => ({ value, text: schoolShortLocale[value] ?? "정보 없음" }));
}

function getEquipmentOptions(slotIndex: number) {
  return (equipmentTypesBySlot[slotIndex] ?? []).map((value) => ({
    value,
    text: equipmentTypeLocale[value] ?? "정보 없음",
  }));
}

type InitialTierFilterButtonsProps = {
  selectedTiers: number[];
  onToggle: (initialTier: number, activated: boolean) => void;
};

function InitialTierFilterButtons({ selectedTiers, onToggle }: InitialTierFilterButtonsProps) {
  return (
    <fieldset className="flex flex-nowrap items-center gap-1" aria-label="초기 성급">
      {STUDENT_FILTER_OPTION_VALUES.initialTiers.map((initialTier) => {
        const active = selectedTiers.includes(initialTier);
        return (
          <button
            key={initialTier}
            type="button"
            className={`inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 lg:h-7 lg:px-1.5 ${
              active
                ? "bg-foreground text-background hover:bg-foreground/90"
                : "bg-muted text-foreground shadow-sm shadow-black/5 hover:bg-muted/80 dark:shadow-none"
            }`}
            aria-label={`초기 성급 ${initialTier}성`}
            aria-pressed={active}
            onClick={() => onToggle(initialTier, !active)}
          >
            <StarIcon aria-hidden="true" className="size-3.5 text-yellow-500" />
            <span>{initialTier}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

function compareSchoolValues(a: string, b: string): number {
  return (
    (schoolShortLocale[a] ?? "정보 없음").localeCompare(schoolShortLocale[b] ?? "정보 없음", "ko") || a.localeCompare(b)
  );
}

export type StudentDirectoryGroup<T extends FilterableStudent = FilterableStudent> = {
  key: string;
  label: string | null;
  students: T[];
};

export function groupStudentDirectoryStudents<T extends FilterableStudent>(
  students: T[],
  groupBy: StudentDirectoryGroupBy = "none",
): StudentDirectoryGroup<T>[] {
  if (groupBy === "none") {
    return students.length > 0 ? [{ key: "all", label: null, students }] : [];
  }

  const grouped = new Map<string, T[]>();
  for (const student of students) {
    const value = getStudentGroupValue(student, groupBy);
    const key = value ?? "__missing__";
    const current = grouped.get(key);
    if (current) {
      current.push(student);
    } else {
      grouped.set(key, [student]);
    }
  }

  return [...grouped.entries()]
    .map(([key, groupedStudents]) => ({
      key,
      label: getStudentGroupLabel(key, groupBy),
      students: groupedStudents,
    }))
    .sort((a, b) => compareStudentGroups(a.key, b.key, groupBy));
}

export function getStudentDirectoryLabel(
  student: FilterableStudent & {
    catalog?: {
      profile: { age: string | null; schoolYear: string | null; height: string | null };
      terrainAdaptations: { street: string; outdoor: string; indoor: string };
    } | null;
  },
  displayBy: StudentDirectoryDisplayField = "none",
): { value: string; ariaLabel: string } {
  const value = getStudentDirectoryDisplayValue(student, displayBy);
  return { value, ariaLabel: value };
}

function getStudentGroupValue(
  student: FilterableStudent,
  groupBy: Exclude<StudentDirectoryGroupBy, "none">,
): string | null {
  if (groupBy === "school") {
    return student.school ?? null;
  }
  if (groupBy === "attackType") {
    return student.attackType;
  }
  if (groupBy === "defenseType") {
    return student.defenseType;
  }
  if (groupBy === "role") {
    return student.role;
  }
  return student.position;
}

function getStudentGroupLabel(key: string, groupBy: Exclude<StudentDirectoryGroupBy, "none">): string {
  if (key === "__missing__") {
    return "정보 없음";
  }
  if (groupBy === "school") {
    return schoolShortLocale[key] ?? "정보 없음";
  }
  if (groupBy === "attackType") {
    return attackTypeLocale[key as Attack] ?? "정보 없음";
  }
  if (groupBy === "defenseType") {
    return defenseTypeShortLocale[key as Defense] ?? "정보 없음";
  }
  if (groupBy === "role") {
    return roleLocale[key as Role] ?? "정보 없음";
  }
  return positionLocale[key as Position] ?? "정보 없음";
}

function compareStudentGroups(a: string, b: string, groupBy: Exclude<StudentDirectoryGroupBy, "none">): number {
  if (a === "__missing__") return b === "__missing__" ? 0 : 1;
  if (b === "__missing__") return -1;
  if (groupBy === "school") {
    return compareSchoolValues(a, b);
  }

  const order = getGroupOrder(groupBy);
  const aIndex = order.indexOf(a);
  const bIndex = order.indexOf(b);
  return (
    (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex) ||
    a.localeCompare(b)
  );
}

function getGroupOrder(groupBy: Exclude<StudentDirectoryGroupBy, "none">): readonly string[] {
  if (groupBy === "attackType") {
    return STUDENT_FILTER_OPTION_VALUES.attackTypes;
  }
  if (groupBy === "defenseType") {
    return STUDENT_FILTER_OPTION_VALUES.defenseTypes;
  }
  if (groupBy === "role") {
    return STUDENT_FILTER_OPTION_VALUES.roles;
  }
  return STUDENT_FILTER_OPTION_VALUES.positions;
}

function getStudentDirectoryDisplayValue(
  student: FilterableStudent & {
    catalog?: {
      profile: { age: string | null; schoolYear: string | null; height: string | null };
      terrainAdaptations: { street: string; outdoor: string; indoor: string };
    } | null;
  },
  displayBy: StudentDirectoryDisplayField,
): string {
  if (displayBy === "none") {
    return "";
  }
  if (displayBy === "school") {
    return schoolShortLocale[student.school ?? ""] ?? "정보 없음";
  }
  if (displayBy === "attackType") {
    return attackTypeLocale[student.attackType] ?? "정보 없음";
  }
  if (displayBy === "defenseType") {
    return defenseTypeShortLocale[student.defenseType] ?? "정보 없음";
  }
  if (displayBy === "role") {
    return roleLocale[student.role] ?? "정보 없음";
  }
  if (displayBy === "tacticRole") {
    return tacticRoleLocale[student.tacticRole] ?? "정보 없음";
  }
  if (displayBy === "position") {
    return positionLocale[student.position] ?? "정보 없음";
  }
  if (displayBy === "equipment1" || displayBy === "equipment2" || displayBy === "equipment3") {
    const index = Number(displayBy.slice(-1)) - 1;
    return equipmentTypeLocale[student.equipments?.[index] ?? ""] ?? "정보 없음";
  }
  if (displayBy === "initialTier") {
    return typeof student.initialTier === "number" && student.initialTier > 0
      ? `${student.initialTier}성`
      : "정보 없음";
  }
  if (displayBy === "age" || displayBy === "schoolYear" || displayBy === "height") {
    return getAvailablePublicString(student.catalog?.profile?.[displayBy]);
  }
  return getAvailablePublicString(student.catalog?.terrainAdaptations?.[displayBy]);
}

function getAvailablePublicString(value: string | null | undefined): string {
  return value === null || value === undefined || value === "" ? "정보 없음" : value;
}

const studentGroupOptions = [
  { value: "none" as const, label: "그룹 없음" },
  { value: "school" as const, label: "학교" },
  { value: "attackType" as const, label: "공격 타입" },
  { value: "defenseType" as const, label: "방어 타입" },
  { value: "role" as const, label: "클래스" },
  { value: "position" as const, label: "포지션" },
];

const studentDisplayOptions = [
  { value: "none" as const, label: "없음" },
  { value: "school" as const, label: "학교" },
  { value: "attackType" as const, label: "공격 타입" },
  { value: "defenseType" as const, label: "방어 타입" },
  { value: "role" as const, label: "클래스" },
  { value: "tacticRole" as const, label: "전술 역할" },
  { value: "position" as const, label: "포지션" },
  { value: "equipment1" as const, label: "장비 1" },
  { value: "equipment2" as const, label: "장비 2" },
  { value: "equipment3" as const, label: "장비 3" },
  { value: "initialTier" as const, label: "초기 성급" },
  { value: "age" as const, label: "나이" },
  { value: "schoolYear" as const, label: "학년" },
  { value: "height" as const, label: "키" },
  { value: "street" as const, label: "시가지 적성" },
  { value: "outdoor" as const, label: "야외 적성" },
  { value: "indoor" as const, label: "실내 적성" },
];
