import { Link } from "react-router";
import { AttributeBadge, ProfileImage, SectionCard } from "~/components/primitives";
import type { StudentHeaderQuery, StudentTerrainAdaptationRank, TacticRole } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import {
  attackTypeColor,
  attackTypeLocale,
  defenseTypeColor,
  defenseTypeLocale,
  roleColor,
  roleLocale,
  schoolNameLocale,
} from "~/locales/ko";
import { studentStandingImageUrl, terrainAdaptationIconUrl } from "~/models/assets";

const tacticRoleLocale: Record<TacticRole, string> = {
  attacker: "딜러",
  healer: "힐러",
  support: "서포터",
  tactical_support: "T.S.",
  tank: "탱커",
};

type StudentInfoProps = {
  student: Pick<
    NonNullable<StudentHeaderQuery["student"]>,
    | "name"
    | "uid"
    | "school"
    | "attackType"
    | "defenseType"
    | "role"
    | "position"
    | "tacticRole"
    | "club"
    | "catalog"
    | "character"
    | "studentVariant"
  >;
  className?: string;
};

export default function StudentInfo({ student, className = "" }: StudentInfoProps) {
  return (
    <SectionCard className={`space-y-0 overflow-hidden p-0 md:p-0 ${className}`}>
      <div className="relative min-h-36 overflow-hidden bg-linear-to-r from-neutral-100 via-white to-neutral-50 dark:from-neutral-900 dark:via-neutral-800 dark:to-neutral-800 md:min-h-40">
        <div className="absolute inset-0 z-0">
          <img
            src={studentStandingImageUrl(student.uid)}
            alt={student.name}
            className="absolute right-0 top-2 h-full w-auto origin-top-right scale-150 object-contain object-top opacity-95"
          />
          <div className="absolute inset-0 bg-linear-to-r from-white via-white/85 to-transparent dark:from-neutral-800 dark:via-neutral-800/80 dark:to-transparent" />
        </div>

        <div className="relative z-10 flex min-h-36 flex-col justify-center p-3 md:min-h-40 md:p-4">
          <p className="text-lg font-bold text-neutral-950 dark:text-neutral-50 md:text-xl">{student.name}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {[schoolNameLocale[student.school], student.catalog?.profile.schoolYear].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <AttributeBadge text={attackTypeLocale[student.attackType]} color={attackTypeColor[student.attackType]} />
            <AttributeBadge
              text={defenseTypeLocale[student.defenseType]}
              color={defenseTypeColor[student.defenseType]}
            />
            <AttributeBadge text={roleLocale[student.role]} color={roleColor[student.role]} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <AttributeBadge text={student.position.toUpperCase()} />
            <AttributeBadge text={tacticRoleLocale[student.tacticRole]} />
          </div>
        </div>
      </div>

      <div className="px-3 pb-3 pt-2 md:px-4 md:pb-4 md:pt-2.5">
        {student.studentVariant.isMulticlass ? (
          <fieldset className="mb-2 grid grid-cols-2 gap-1 rounded-md bg-muted p-1" aria-label="클래스 전환">
            {student.studentVariant.students.map((variantStudent, index) => (
              <Link
                key={variantStudent.uid}
                to={`/students/${variantStudent.uid}`}
                aria-label={`${student.name} 클래스 ${index + 1}`}
                aria-current={variantStudent.uid === student.uid ? "page" : undefined}
                title={`${student.name} 클래스 ${index + 1}`}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-center text-xs font-medium transition-colors",
                  variantStudent.uid === student.uid
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {index + 1}
              </Link>
            ))}
          </fieldset>
        ) : null}

        <dl className="text-sm">
          {student.club?.name ? (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">동아리</dt>
              <dd className="truncate font-medium">{student.club.name}</dd>
            </div>
          ) : null}
          {student.catalog?.profile.age ? (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">나이</dt>
              <dd className="font-medium">{student.catalog.profile.age}</dd>
            </div>
          ) : null}
          {student.catalog?.profile.height ? (
            <div className="flex items-center justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">키</dt>
              <dd className="font-medium">{student.catalog.profile.height}</dd>
            </div>
          ) : null}
          {student.catalog?.profile.hobby ? (
            <div className="flex items-start justify-between gap-3 py-1.5">
              <dt className="shrink-0 text-muted-foreground">취미</dt>
              <dd className="max-w-[70%] text-right font-medium leading-snug">{student.catalog.profile.hobby}</dd>
            </div>
          ) : null}
        </dl>

        {student.catalog?.terrainAdaptations ? (
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center md:mt-3">
            {(
              [
                ["시가지", student.catalog.terrainAdaptations.street],
                ["야외", student.catalog.terrainAdaptations.outdoor],
                ["실내", student.catalog.terrainAdaptations.indoor],
              ] as const satisfies ReadonlyArray<readonly [string, StudentTerrainAdaptationRank]>
            ).map(([label, rank]) => (
              <div key={label} className="rounded-md bg-muted px-1.5 py-1">
                <span className="block text-xs text-muted-foreground">{label}</span>
                <img
                  src={terrainAdaptationIconUrl(rank)}
                  alt={`${rank} 적성`}
                  className="mx-auto mt-0.5 h-6 w-auto object-contain"
                />
              </div>
            ))}
          </div>
        ) : null}

        {student.character.studentVariants.some((variant) => variant.uid !== student.studentVariant.uid) ? (
          <div className="mt-3.5 md:mt-4">
            <span className="text-xs text-muted-foreground">다른 의상</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {student.character.studentVariants
                .filter((variant) => variant.uid !== student.studentVariant.uid)
                .map((variant) => (
                  <Link
                    key={variant.uid}
                    to={`/students/${variant.primaryStudent.uid}`}
                    aria-label={variant.primaryStudent.name}
                    title={variant.primaryStudent.name}
                    className="rounded-full ring-offset-background transition hover:ring-2 hover:ring-primary/40 hover:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  >
                    <ProfileImage studentUid={variant.primaryStudent.uid} imageSize={8} />
                  </Link>
                ))}
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
