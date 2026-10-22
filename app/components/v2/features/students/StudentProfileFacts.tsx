import { Link } from "react-router";
import { ResourceTypeEnum, type StudentHeaderQuery } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { RoundStudentImage } from "./RoundStudentImage";
import { ResourceThumb } from "../resources/ResourceThumb";

type Student = Pick<NonNullable<StudentHeaderQuery["student"]>, "club" | "catalog" | "character" | "studentVariant" | "interactionFurnitures">;

export function StudentProfileFacts({ student, compact = false }: { student: Student; compact?: boolean }) {
  const profile = student.catalog?.profile;
  const facts = [
    ["동아리", student.club?.name],
    ["나이", profile?.age],
    ["키", profile?.height],
    ["취미", profile?.hobby],
  ] as const;
  const outfits = student.character.studentVariants.filter((variant) => variant.uid !== student.studentVariant.uid);

  return (
    <section aria-label="프로필" className={cn("min-w-0 rounded-lg bg-v2-surface p-v2-block-p", compact && "mt-0.5 -mb-1 px-v2-block-p py-3")}>
      <dl className={cn(compact ? "grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[13px] leading-5" : "grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm leading-[1.43]")}>
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="shrink-0 text-v2-fg-tertiary">{label}</dt>
            <dd className={cn("min-w-0 text-v2-fg", compact ? "pr-1 text-left [overflow-wrap:anywhere]" : "text-right", compact ? "[overflow-wrap:anywhere]" : label === "취미" ? "break-words" : "truncate")}>
              {value || "알 수 없음"}
            </dd>
          </div>
        ))}
      </dl>

      <div className={cn(compact ? "mt-[10px] flex flex-wrap gap-x-6 gap-y-3" : "")}>
      {outfits.length > 0 ? (
        <div className={cn(!compact && "mt-4")}>
          <h2 className={cn("text-xs leading-[1.43] font-semibold text-v2-fg-tertiary", compact ? "mb-1.5" : "mb-2")}>다른 의상</h2>
          <ul className="flex flex-wrap gap-3">
            {outfits.map((variant) => (
              <li key={variant.uid}>
                <Link
                  to={`/students/${variant.primaryStudent.uid}`}
                  aria-label={variant.primaryStudent.name}
                  title={variant.primaryStudent.name}
                  className="block rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus"
                  {...getV2LinkTransitionProps("crossfade")}
                >
                  <RoundStudentImage studentUid={variant.primaryStudent.uid} size={8} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {student.interactionFurnitures.length > 0 ? (
        <div className={cn(!compact && "mt-4")}>
          <h2 className={cn("text-xs leading-[1.43] font-semibold text-v2-fg-tertiary", compact ? "mb-1.5" : "mb-2")}>상호작용 가구</h2>
          <ul className="flex flex-wrap gap-3">
            {student.interactionFurnitures.map((furniture) => (
              <li key={furniture.uid} aria-label={furniture.name} title={furniture.name} className={cn("[&>span]:!size-13", compact && "size-11 [&>span]:!size-11")}>
                <ResourceThumb itemUid={furniture.uid} resourceType={ResourceTypeEnum.Furniture} name={furniture.name} size="sm" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>
    </section>
  );
}
