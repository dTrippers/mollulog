import {
  countStudentDirectoryFilterGroup,
  getStudentDirectoryFilterOptions,
  STUDENT_DIRECTORY_ACQUISITION_TYPES,
  STUDENT_DIRECTORY_ATTACK_TYPES,
  STUDENT_DIRECTORY_CLASSES,
  STUDENT_DIRECTORY_DEFENSE_TYPES,
  STUDENT_DIRECTORY_INITIAL_TIERS,
  STUDENT_DIRECTORY_POSITIONS,
  STUDENT_DIRECTORY_ROLES,
  STUDENT_DIRECTORY_SKILL_EFFECTS,
  STUDENT_DIRECTORY_TERRAIN_RANKS,
  type StudentDirectoryFilterState,
  type StudentDirectoryPersonalState,
} from "~/domain/student-directory";
import { cn } from "~/lib/utils";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeShortLocale,
  positionLocale,
  roleColor,
  roleLocale,
  schoolShortLocale,
  tacticRoleLocale,
} from "~/locales/ko";
import { terrainAdaptationIconUrl } from "~/models/assets";
import type { StudentDirectoryStudent } from "~/models/student-directory";
import { ToggleChip } from "../../primitives/ToggleChip";
import { FilterGroupDisclosure } from "./FilterGroupDisclosure";
import { StarTierLabel } from "./StarTierLabel";

const skillLabels: Record<string, string> = {
  debuff: "디버프",
  crowd_control: "군중 제어",
  heal: "회복",
  shield: "보호막",
  cleanse: "정화",
  knockback: "넉백",
  self_reposition: "위치 이동",
  summon: "소환",
  obstacle: "장애물",
};
const acquisitionLabels: Record<string, string> = {
  regular: "통상",
  limited: "한정",
  festival: "페스",
  event_reward: "배포",
  archive: "아카이브",
};
const terrainLabels = { street: "시가지", outdoor: "야외", indoor: "실내" } as const;

export function DirectoryFilterPanel({
  students,
  state,
  personalStatus,
  onChange,
  onRequestSignIn,
}: {
  students: StudentDirectoryStudent[];
  state: StudentDirectoryFilterState;
  personalStatus: StudentDirectoryPersonalState["status"];
  onChange: React.Dispatch<React.SetStateAction<StudentDirectoryFilterState>>;
  onRequestSignIn: () => void;
}) {
  const options = getStudentDirectoryFilterOptions(students);
  const personalDisabled = personalStatus !== "loaded";
  const toggle = <T extends string | number | boolean>(current: T[], value: T, pressed: boolean): T[] =>
    pressed ? (current.includes(value) ? current : [...current, value]) : current.filter((item) => item !== value);
  const toggleList = <
    K extends
      | "attackTypes"
      | "defenseTypes"
      | "classes"
      | "roles"
      | "recruitment"
      | "schools"
      | "positions"
      | "weaponTypes"
      | "cover"
      | "skillEffects"
      | "acquisitionTypes"
      | "initialTiers",
  >(
    key: K,
    value: StudentDirectoryFilterState[K][number],
    pressed: boolean,
  ) => onChange((current) => ({ ...current, [key]: toggle(current[key] as never[], value as never, pressed) }));
  const groupCount = (name: Parameters<typeof countStudentDirectoryFilterGroup>[0]) =>
    countStudentDirectoryFilterGroup(name, state);

  return (
    <div className="space-y-1 sm:space-y-2">
      <div className="space-y-2 pb-1 sm:pb-0">
        <StaticGroup title="공격 타입">
          <ChipRow>
            {STUDENT_DIRECTORY_ATTACK_TYPES.map((value) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.attackTypes.includes(value)}
                onPressedChange={(pressed) => toggleList("attackTypes", value, pressed)}
              >
                <AttributeMark color={attackTypeColor[value]} />
                {attackTypeLocale[value]}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </StaticGroup>
        <StaticGroup title="방어 타입">
          <ChipRow>
            {STUDENT_DIRECTORY_DEFENSE_TYPES.map((value) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.defenseTypes.includes(value)}
                onPressedChange={(pressed) => toggleList("defenseTypes", value, pressed)}
              >
                <AttributeMark color={defenseTypeColor[value]} />
                {defenseTypeShortLocale[value]}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </StaticGroup>
        <StaticGroup title="클래스">
          <ChipRow>
            {STUDENT_DIRECTORY_CLASSES.map((value) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.classes.includes(value)}
                onPressedChange={(pressed) => toggleList("classes", value, pressed)}
              >
                <AttributeMark color={roleColor[value]} />
                {roleLocale[value]}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </StaticGroup>
        <StaticGroup title="역할">
          <ChipRow>
            {STUDENT_DIRECTORY_ROLES.map((value) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.roles.includes(value)}
                onPressedChange={(pressed) => toggleList("roles", value, pressed)}
              >
                {tacticRoleLocale[value]}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </StaticGroup>
        <StaticGroup
          title="모집 여부"
          action={personalStatus === "signed-out" ? <SignInAction onClick={onRequestSignIn} /> : null}
        >
          <ChipRow>
            {(["recruited", "unrecruited"] as const).map((value) => (
              <DirectoryToggleChip
                key={value}
                disabled={personalDisabled}
                pressed={!personalDisabled && state.recruitment.includes(value)}
                onPressedChange={(pressed) => toggleList("recruitment", value, pressed)}
              >
                {value === "recruited" ? "모집함" : "미모집"}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </StaticGroup>
      </div>


      <div>
        <FilterGroupDisclosure title="학교" selectedCount={groupCount("schools")}>
          <ChipRow>
            {options.schools.map(({ value, label }) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.schools.includes(value)}
                onPressedChange={(pressed) => toggleList("schools", value, pressed)}
              >
                {label}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="동아리" selectedCount={groupCount("clubUids")}>
          <div className="space-y-2 sm:space-y-3">
            {options.clubGroups
              .filter(({ school }) => state.schools.length === 0 || state.schools.includes(school))
              .map((group) => (
                <div key={group.school} className="space-y-1">
                  <h4 className="text-xs text-v2-fg-tertiary">{schoolShortLocale[group.school] ?? "알 수 없음"}</h4>
                  <ChipRow>
                    {group.clubs.map(({ uid, label }) => (
                      <DirectoryToggleChip
                        key={uid}
                        pressed={state.clubUids.includes(uid)}
                        onPressedChange={(pressed) =>
                          onChange((current) => ({ ...current, clubUids: toggle(current.clubUids, uid, pressed) }))
                        }
                      >
                        {label}
                      </DirectoryToggleChip>
                    ))}
                  </ChipRow>
                </div>
              ))}
            <div className="space-y-1.5">
              <h4 className="text-xs text-v2-fg-tertiary">소속 없음</h4>
              <ChipRow>
                <DirectoryToggleChip
                  pressed={state.unaffiliatedClub}
                  onPressedChange={(pressed) => onChange((current) => ({ ...current, unaffiliatedClub: pressed }))}
                >
                  없음
                </DirectoryToggleChip>
              </ChipRow>
            </div>
          </div>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="포지션" selectedCount={groupCount("positions")}>
          <ChipRow>
            {STUDENT_DIRECTORY_POSITIONS.map((value) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.positions.includes(value)}
                onPressedChange={(pressed) => toggleList("positions", value, pressed)}
              >
                {positionLocale[value]}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="지형 적성" selectedCount={groupCount("terrain")}>
          <div className="space-y-2">
            {(Object.keys(terrainLabels) as (keyof typeof terrainLabels)[]).map((field) => (
              <div key={field} className="space-y-1">
                <h4 className="text-xs text-v2-fg-tertiary">{terrainLabels[field]}</h4>
                <ChipRow>
                  {STUDENT_DIRECTORY_TERRAIN_RANKS.map((rank) => (
                    <DirectoryToggleChip
                      key={rank}
                      ariaLabel={`${terrainLabels[field]} 적성 ${rank}`}
                      pressed={state.terrain[field].includes(rank)}
                      onPressedChange={(pressed) =>
                        onChange((current) => ({
                          ...current,
                          terrain: { ...current.terrain, [field]: toggle(current.terrain[field], rank, pressed) },
                        }))
                      }
                    >
                      <img
                        src={terrainAdaptationIconUrl(rank)}
                        alt=""
                        aria-hidden="true"
                        className="size-4 shrink-0 object-contain sm:size-3.5"
                      />
                    </DirectoryToggleChip>
                  ))}
                </ChipRow>
              </div>
            ))}
          </div>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="무기 종류" selectedCount={groupCount("weaponTypes")}>
          <ChipRow>
            {options.weaponTypes.map(({ value, label }) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.weaponTypes.includes(value)}
                onPressedChange={(pressed) => toggleList("weaponTypes", value, pressed)}
              >
                {label}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="엄폐" selectedCount={groupCount("cover")}>
          <ChipRow>
            {([true, false] as const).map((value) => (
              <DirectoryToggleChip
                key={String(value)}
                pressed={state.cover.includes(value)}
                onPressedChange={(pressed) => toggleList("cover", value, pressed)}
              >
                {value ? "엄폐 가능" : "엄폐 불가"}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="스킬 효과" selectedCount={groupCount("skillEffects")}>
          <ChipRow>
            {STUDENT_DIRECTORY_SKILL_EFFECTS.map((value) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.skillEffects.includes(value)}
                onPressedChange={(pressed) => toggleList("skillEffects", value, pressed)}
              >
                {skillLabels[value]}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="획득 유형" selectedCount={groupCount("acquisitionTypes")}>
          <ChipRow>
            {STUDENT_DIRECTORY_ACQUISITION_TYPES.map((value) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.acquisitionTypes.includes(value)}
                onPressedChange={(pressed) => toggleList("acquisitionTypes", value, pressed)}
              >
                {acquisitionLabels[value]}
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="초기 성급" selectedCount={groupCount("initialTiers")}>
          <ChipRow>
            {STUDENT_DIRECTORY_INITIAL_TIERS.map((value) => (
              <DirectoryToggleChip
                key={value}
                pressed={state.initialTiers.includes(value)}
                onPressedChange={(pressed) => toggleList("initialTiers", value, pressed)}
              >
                <StarTierLabel tier={value} />
              </DirectoryToggleChip>
            ))}
          </ChipRow>
        </FilterGroupDisclosure>
        <FilterGroupDisclosure title="장비" selectedCount={groupCount("equipmentSlots")}>
          <div className="space-y-2">
            {options.equipmentSlots.map((slot, index) => {
              const slotNumber = index + 1;
              return (
                <div key={`slot-${slotNumber}`} className="space-y-1">
                  <h4 className="text-xs text-v2-fg-tertiary">장비 {slotNumber}</h4>
                  <ChipRow>
                    {slot.map(({ value, label }) => (
                      <DirectoryToggleChip
                        key={value}
                        pressed={state.equipmentSlots[index].includes(value)}
                        onPressedChange={(pressed) =>
                          onChange((current) => ({
                            ...current,
                            equipmentSlots: current.equipmentSlots.map((items, itemIndex) =>
                              itemIndex === index ? toggle(items, value, pressed) : items,
                            ) as StudentDirectoryFilterState["equipmentSlots"],
                          }))
                        }
                      >
                        {label}
                      </DirectoryToggleChip>
                    ))}
                  </ChipRow>
                </div>
              );
            })}
          </div>
        </FilterGroupDisclosure>
      </div>
    </div>
  );
}

function StaticGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = `student-directory-${title.replaceAll(" ", "-")}`;
  return (
    <section aria-labelledby={titleId} className="space-y-1.5 sm:space-y-0.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 id={titleId} className="text-sm font-semibold text-v2-fg-tertiary sm:text-xs">
          {title}
        </h3>
        {action}
      </div>
      <fieldset aria-labelledby={titleId} className="m-0 min-w-0 border-0 p-0">
        {children}
      </fieldset>
    </section>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-x-1.5 gap-y-1.5 sm:gap-x-0.5">{children}</div>;
}

function DirectoryToggleChip({
  pressed,
  onPressedChange,
  disabled = false,
  ariaLabel,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <ToggleChip
      pressed={pressed}
      onPressedChange={onPressedChange}
      disabled={disabled}
      ariaLabel={ariaLabel}
      className="group min-h-8 shrink-0 justify-center bg-transparent px-0 hover:bg-transparent active:bg-transparent disabled:bg-transparent disabled:hover:bg-transparent sm:min-h-6 sm:min-w-0 sm:px-0"
    >
      <span
        className={cn(
          "inline-flex min-h-8 items-center justify-center rounded-md px-2.5 text-sm font-normal whitespace-nowrap sm:min-h-6 sm:min-w-0 sm:px-1.5 sm:text-[13px]",
          pressed ? "bg-v2-selected text-v2-on-selected" : "bg-v2-inset text-v2-fg-secondary",
          !disabled && !pressed && "group-hover:bg-v2-filled-hover",
          !disabled && "group-active:bg-v2-filled-hover",
          disabled && "text-v2-fg-disabled",
        )}
      >
        {children}
      </span>
    </ToggleChip>
  );
}

function AttributeMark({ color }: { color: string }) {
  return <span aria-hidden="true" className={cn("mr-1 inline-block h-3 w-0.5 rounded-full", `bg-v2-attr-${color}`)} />;
}

function SignInAction({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="로그인 후 사용 가능: 로그인하고 내 기록으로 정렬·필터하기"
      onClick={onClick}
      className="min-h-6 cursor-pointer rounded-md px-1 text-xs text-v2-fg-secondary hover:bg-v2-hover hover:text-v2-fg active:bg-v2-filled-hover active:text-v2-fg"
    >
      로그인 후 사용 가능
    </button>
  );
}
