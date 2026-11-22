import {
  AttributeMark,
  ChipRow,
  DirectoryToggleChip,
  StaticGroup,
} from "~/components/v2/features/students/DirectoryFilterPanel";
import { SearchInput } from "~/components/v2/primitives/SearchInput";
import { trackGoogleAnalyticsEventIfAllowed } from "~/lib/google-analytics-events.client";
import {
  ATTACK_OPTIONS,
  DEFENSE_OPTIONS,
  POSITION_OPTIONS,
  ROLE_OPTIONS,
  SORT_LABELS,
  STUDENTS_FILTER_SORTS,
  type StudentsFilterState,
  TACTIC_ROLE_OPTIONS,
} from "./students-filter";

type ListKey = "attackTypes" | "defenseTypes" | "roles" | "tacticRoles" | "positions";

function trackFilter(filter: string) {
  trackGoogleAnalyticsEventIfAllowed("filter_apply", { scope: "students", filter });
}

// The filter, search and sort controls of the recruited students screen. The Aside panel, the mobile sheet and the
// edit mode popover all show this one body.
export function StudentsFilterBody({
  state,
  onChange,
}: {
  state: StudentsFilterState;
  onChange: (updater: (current: StudentsFilterState) => StudentsFilterState) => void;
}) {
  const toggle = <K extends ListKey>(key: K, value: StudentsFilterState[K][number], pressed: boolean) => {
    if (state[key].includes(value as never) !== pressed) trackFilter(key);
    onChange((current) => ({
      ...current,
      [key]: pressed
        ? current[key].includes(value as never)
          ? current[key]
          : [...current[key], value]
        : current[key].filter((item) => item !== value),
    }));
  };

  return (
    <div className="space-y-2">
      <StaticGroup title="이름으로 찾기">
        <SearchInput
          value={state.search}
          onChange={(search) => onChange((current) => ({ ...current, search }))}
          aria-label="이름으로 찾기"
          placeholder="학생 이름"
        />
      </StaticGroup>
      <StaticGroup title="공격 유형">
        <ChipRow>
          {ATTACK_OPTIONS.map(({ value, label, color }) => (
            <DirectoryToggleChip
              key={value}
              pressed={state.attackTypes.includes(value)}
              onPressedChange={(pressed) => toggle("attackTypes", value, pressed)}
            >
              <AttributeMark color={color} />
              {label}
            </DirectoryToggleChip>
          ))}
        </ChipRow>
      </StaticGroup>
      <StaticGroup title="방어 유형">
        <ChipRow>
          {DEFENSE_OPTIONS.map(({ value, label, color }) => (
            <DirectoryToggleChip
              key={value}
              pressed={state.defenseTypes.includes(value)}
              onPressedChange={(pressed) => toggle("defenseTypes", value, pressed)}
            >
              <AttributeMark color={color} />
              {label}
            </DirectoryToggleChip>
          ))}
        </ChipRow>
      </StaticGroup>
      <StaticGroup title="역할">
        <ChipRow>
          {ROLE_OPTIONS.map(({ value, label }) => (
            <DirectoryToggleChip
              key={value}
              pressed={state.roles.includes(value)}
              onPressedChange={(pressed) => toggle("roles", value, pressed)}
            >
              {label}
            </DirectoryToggleChip>
          ))}
        </ChipRow>
      </StaticGroup>
      <StaticGroup title="포지션">
        <ChipRow>
          {POSITION_OPTIONS.map(({ value, label }) => (
            <DirectoryToggleChip
              key={value}
              pressed={state.positions.includes(value)}
              onPressedChange={(pressed) => toggle("positions", value, pressed)}
            >
              {label}
            </DirectoryToggleChip>
          ))}
        </ChipRow>
      </StaticGroup>
      <StaticGroup title="전술 역할">
        <ChipRow>
          {TACTIC_ROLE_OPTIONS.map(({ value, label }) => (
            <DirectoryToggleChip
              key={value}
              pressed={state.tacticRoles.includes(value)}
              onPressedChange={(pressed) => toggle("tacticRoles", value, pressed)}
            >
              {label}
            </DirectoryToggleChip>
          ))}
        </ChipRow>
      </StaticGroup>
      <StaticGroup title="정렬">
        <ChipRow>
          {STUDENTS_FILTER_SORTS.map((sort) => (
            <DirectoryToggleChip
              key={sort}
              pressed={state.sort === sort}
              onPressedChange={(pressed) => {
                if (!pressed || state.sort === sort) return;
                trackFilter("sort");
                onChange((current) => ({ ...current, sort }));
              }}
            >
              {SORT_LABELS[sort]}
            </DirectoryToggleChip>
          ))}
        </ChipRow>
      </StaticGroup>
    </div>
  );
}
