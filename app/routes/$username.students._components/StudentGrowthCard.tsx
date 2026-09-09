import { ChevronRightIcon } from "@heroicons/react/16/solid";
import { PencilSquareIcon } from "@heroicons/react/20/solid";
import { Link } from "react-router";
import { StudentCard, StudentSkillIcon } from "~/components/features/students";
import { SectionCard } from "~/components/primitives";
import { equipmentImageUrl } from "~/models/assets";
import type {
  UserStudent,
  UserStudentsEquipmentVisual,
  UserStudentsGrowthWithVisuals,
  UserStudentsSkillVisual,
} from "~/views/user-students.server";

type GrowthStudent = UserStudent & { growth: UserStudentsGrowthWithVisuals; tier: number };

type StudentGrowthCardProps = {
  student: GrowthStudent;
  editable?: boolean;
};

const skillFields = [
  { key: "ex", label: "EX" },
  { key: "normal", label: "기본" },
  { key: "enhanced", label: "강화" },
  { key: "sub", label: "서브" },
] as const;

const equipmentFields = [
  { key: "equip1", label: "1" },
  { key: "equip2", label: "2" },
  { key: "equip3", label: "3" },
] as const;

const abilityFields = [
  { key: "abilityHp", label: "최대 체력" },
  { key: "abilityAtk", label: "공격력" },
  { key: "abilityHeal", label: "치유력" },
] as const;

function displayValue(value: number | null, prefix = "", maxValue?: number) {
  if (value == null) return "-";
  if (maxValue !== undefined && value === maxValue) return "MAX";
  return `${prefix}${value}`;
}

function valueDescription(value: number | null, prefix = "", maxValue?: number, unavailable = false) {
  if (unavailable) return "해당 없음";
  if (value == null) return "미등록";
  return displayValue(value, prefix, maxValue);
}

function equipmentDisplayValue(visual: UserStudentsEquipmentVisual): string {
  if (!visual.available) return "-";
  if (visual.tier == null) return "미장착";
  return displayValue(visual.tier, "T");
}

function equipmentValueDescription(visual: UserStudentsEquipmentVisual): string {
  if (!visual.available) return "해당 없음";
  if (visual.tier == null) return "미장착";
  return displayValue(visual.tier, "T");
}

function Metric({
  studentName,
  label,
  value,
  prefix = "",
  maxValue,
  unavailable = false,
}: {
  studentName: string;
  label: string;
  value: number | null;
  prefix?: string;
  maxValue?: number;
  unavailable?: boolean;
}) {
  return (
    <div
      className="min-w-0"
      role="img"
      aria-label={`${studentName} ${label} ${valueDescription(value, prefix, maxValue, unavailable)}`}
      aria-disabled={unavailable}
    >
      <dt className="truncate text-xs text-muted-foreground" aria-hidden="true">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-nowrap text-xs font-semibold tabular-nums" aria-hidden="true">
        {unavailable ? "-" : displayValue(value, prefix, maxValue)}
      </dd>
    </div>
  );
}

function MetricGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h4 className="sr-only">{title}</h4>
      {children}
    </section>
  );
}

function SkillTile({
  attackType,
  studentName,
  label,
  visual,
}: {
  attackType: GrowthStudent["attackType"];
  studentName: string;
  label: string;
  visual: UserStudentsSkillVisual;
}) {
  const level = displayValue(visual.level, "Lv.", visual.maxLevel);
  return (
    <div
      className="relative flex h-12 min-w-0 items-center justify-center overflow-hidden"
      role="img"
      aria-label={`${studentName} ${label} 스킬 ${valueDescription(visual.level, "Lv.", visual.maxLevel)}`}
    >
      <StudentSkillIcon attackType={attackType} iconUrl={visual.iconUrl} muted size="sm" />
      <span className="absolute right-1 bottom-1 z-20 rounded-sm bg-card px-1 text-xs font-semibold leading-4 tabular-nums">
        {level}
      </span>
    </div>
  );
}

function EquipmentTile({
  studentName,
  label,
  visual,
}: {
  studentName: string;
  label: string;
  visual: UserStudentsEquipmentVisual;
}) {
  const value = equipmentDisplayValue(visual);
  return (
    <div
      className="relative flex h-12 min-w-0 items-center justify-center overflow-hidden rounded-md bg-muted/20 sm:aspect-square sm:h-auto"
      role="img"
      aria-label={`${studentName} 장비 ${label} ${equipmentValueDescription(visual)}`}
      aria-disabled={!visual.available}
    >
      {visual.uid ? (
        <img src={equipmentImageUrl(visual.uid)} alt="" className="size-10 shrink-0 object-contain" />
      ) : null}
      <span className="absolute right-1 bottom-1 whitespace-nowrap rounded-sm bg-card px-0.5 text-[10px] font-semibold leading-4 tabular-nums">
        {value}
      </span>
    </div>
  );
}

function SpecialEquipmentTile({
  studentName,
  visual,
  value,
}: {
  studentName: string;
  visual: UserStudentsEquipmentVisual;
  value: number | null;
}) {
  const displayValueText = visual.available ? (value == null ? "미장착" : displayValue(value, "T")) : "-";
  const accessibleValue = visual.available ? (value == null ? "미장착" : displayValue(value, "T")) : "해당 없음";
  return (
    <div
      className="relative flex h-12 min-w-0 flex-col justify-between rounded-md bg-muted/20 p-1 sm:aspect-square sm:h-auto"
      role="img"
      aria-label={`${studentName} 애용품 ${accessibleValue}`}
      aria-disabled={!visual.available}
    >
      <span className="whitespace-nowrap text-[10px] font-semibold leading-4 text-muted-foreground">애용품</span>
      <span className="self-end whitespace-nowrap text-[10px] font-semibold tabular-nums">{displayValueText}</span>
    </div>
  );
}

export default function StudentGrowthCard({ student, editable = false }: StudentGrowthCardProps) {
  return (
    <SectionCard className="min-w-0 space-y-2.5 p-3 md:p-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="w-11 shrink-0">
          <StudentCard uid={student.uid} name={student.name} hideName tier={student.tier} flush />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-keep text-sm font-semibold">
            <Link
              to={`/students/${encodeURIComponent(student.uid)}`}
              className="group inline-flex min-w-0 max-w-full items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <span className="min-w-0 truncate break-keep">{student.name}</span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span role="img" aria-label={`${student.name} 학생 레벨 ${valueDescription(student.growth.level)}`}>
              학생 Lv. <span aria-hidden="true">{displayValue(student.growth.level)}</span>
            </span>
          </p>
        </div>
        {editable ? (
          <Link
            to={`/students/${encodeURIComponent(student.uid)}#student-basic-info`}
            aria-label={`${student.name} 성장 상태 편집`}
            className="ml-auto inline-flex shrink-0 self-start rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <PencilSquareIcon className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>

      <MetricGroup title="스킬">
        <div className="space-y-0">
          <div
            className="grid h-4 grid-cols-4 gap-1 text-center text-[10px] font-semibold leading-4 text-muted-foreground"
            aria-hidden="true"
          >
            {skillFields.map((field) => (
              <span key={field.key}>{field.label}</span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {skillFields.map((field) => (
              <SkillTile
                key={field.key}
                attackType={student.attackType}
                studentName={student.name}
                label={field.label}
                visual={student.growth.skillVisuals[field.key]}
              />
            ))}
          </div>
        </div>
      </MetricGroup>

      <MetricGroup title="장비">
        <div className="grid grid-cols-4 gap-1">
          {equipmentFields.map((field, index) => (
            <EquipmentTile
              key={field.key}
              studentName={student.name}
              label={field.label}
              visual={student.growth.equipmentVisuals[index]}
            />
          ))}
          {student.growth.equipSpecialAvailable ? (
            <SpecialEquipmentTile
              studentName={student.name}
              visual={{ available: true, uid: null, tier: student.growth.equipSpecial }}
              value={student.growth.equipSpecial}
            />
          ) : null}
        </div>
      </MetricGroup>

      {student.growth.abilityAvailable ? (
        <MetricGroup title="개방">
          <dl className="grid grid-cols-3 gap-x-1 gap-y-1.5">
            {abilityFields.map((field) => (
              <Metric
                key={field.key}
                studentName={student.name}
                label={field.label}
                value={student.growth[field.key]}
              />
            ))}
          </dl>
        </MetricGroup>
      ) : null}
    </SectionCard>
  );
}

export type { GrowthStudent, StudentGrowthCardProps };
