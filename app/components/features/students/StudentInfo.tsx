import { AttributeBadge, SectionCard } from "~/components/primitives";
import type { Attack, Defense, RoleEnum } from "~/graphql/graphql";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  roleColor,
  roleLocale,
  schoolNameLocale,
} from "~/locales/ko";
import { studentStandingImageUrl } from "~/models/assets";

type StudentInfoProps = {
  student: {
    name: string;
    uid: string;
    school: string;
    attackType: Attack;
    defenseType: Defense;
    role: RoleEnum;
  };
  className?: string;
};

export default function StudentInfo({ student, className = "" }: StudentInfoProps) {
  return (
    <SectionCard className={`overflow-hidden p-0 md:p-0 ${className}`}>
      <div className="relative min-h-40 overflow-hidden bg-linear-to-r from-neutral-100 via-white to-neutral-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-800">
        <div className="absolute inset-0 z-0">
          <img
            src={studentStandingImageUrl(student.uid)}
            alt={student.name}
            className="absolute right-0 top-2 h-full w-auto origin-top-right scale-150 object-contain object-top opacity-95"
          />
          <div className="absolute inset-0 bg-linear-to-r from-white via-white/85 to-transparent dark:from-neutral-800 dark:via-neutral-800/80 dark:to-transparent" />
        </div>

        <div className="relative z-10 flex min-h-40 flex-col justify-center p-4 md:p-5">
          <p className="text-xl font-bold text-neutral-950 dark:text-neutral-50">{student.name}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{schoolNameLocale[student.school]}</p>
          <div className="mt-3 flex gap-2">
            <AttributeBadge text={attackTypeLocale[student.attackType]} color={attackTypeColor[student.attackType]} />
            <AttributeBadge
              text={defenseTypeLocale[student.defenseType]}
              color={defenseTypeColor[student.defenseType]}
            />
            <AttributeBadge text={roleLocale[student.role]} color={roleColor[student.role]} />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
