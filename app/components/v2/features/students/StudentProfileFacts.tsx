import { Link } from "react-router";
import { ResourceTypeEnum, type StudentHeaderQuery } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";
import { RoundStudentImage } from "./RoundStudentImage";
import { ResourceThumb } from "../resources/ResourceThumb";
import { TooltipButton } from "../../primitives/TooltipButton";
import { v2FocusRing } from "../../layout/styles";
import { StudentStandingBackdrop } from "./StudentStandingBackdrop";

type Student = Pick<NonNullable<StudentHeaderQuery["student"]>, "club" | "catalog" | "character" | "studentVariant" | "interactionFurnitures">;

export function StudentProfileFacts({ student, compact = false, standingUid }: { student: Student; compact?: boolean; standingUid?: string }) {
  const profile = student.catalog?.profile;
  const facts = [
    ["동아리", student.club?.name],
    ["나이", profile?.age],
    ["키", profile?.height],
    ["취미", profile?.hobby],
  ] as const;
  const outfits = student.character.studentVariants.filter((variant) => variant.uid !== student.studentVariant.uid);

  return (
    <section aria-label="프로필" className={cn("relative min-w-0 overflow-hidden rounded-lg bg-v2-surface p-v2-block-p", compact && "mt-0.5 -mb-1 px-v2-block-p py-3")}>
      {/* The compact panel is short, so the illustration spans its full height instead of only the facts. */}
      {standingUid && compact ? <StudentStandingBackdrop uid={standingUid} className="absolute inset-y-0 right-0 w-[38%]" /> : null}
      <div className="relative">
        {standingUid && !compact ? <StudentStandingBackdrop uid={standingUid} className="absolute -top-v2-block-p right-[calc(-1*var(--spacing-v2-block-p))] bottom-0 w-[45%]" /> : null}
        <dl className={cn("relative w-[62%]", compact ? "grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1 text-[13px] leading-5" : "flex flex-col gap-2.5 text-sm leading-[1.43]")}>
          {facts.map(([label, value]) => (
            <div key={label} className={compact ? "contents" : "min-w-0"}>
              <dt className={cn("shrink-0 text-v2-fg-tertiary", !compact && "text-xs leading-[1.43]")}>{label}</dt>
              <dd className="min-w-0 text-v2-fg [overflow-wrap:anywhere]">{value || "알 수 없음"}</dd>
            </div>
          ))}
        </dl>
      </div>

      {outfits.length > 0 || student.interactionFurnitures.length > 0 ? (
      <div className={cn("relative flex flex-wrap gap-x-6", compact ? "mt-[10px] gap-y-3" : "mt-4 gap-y-4")}>
      {outfits.length > 0 ? (
        <div>
          <h2 className={cn("text-xs leading-[1.43] font-semibold text-v2-fg-tertiary", compact ? "mb-1.5" : "mb-2")}>다른 의상</h2>
          <ul className="flex flex-wrap gap-2">
            {outfits.map((variant) => (
              <li key={variant.uid}>
                <Link
                  to={`/students/${variant.primaryStudent.uid}`}
                  aria-label={variant.primaryStudent.name}
                  title={variant.primaryStudent.name}
                  className={cn("block rounded-md", v2FocusRing)}
                  {...getV2LinkTransitionProps("crossfade")}
                >
                  {/* The student card's 5:6 portrait, as tall as the furniture tile beside it. */}
                  <RoundStudentImage
                    studentUid={variant.primaryStudent.uid}
                    className={cn("!block !w-auto !aspect-[5/6] !rounded-md", compact ? "!h-10" : "!h-11")}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {student.interactionFurnitures.length > 0 ? (
        <div>
          <h2 className={cn("text-xs leading-[1.43] font-semibold text-v2-fg-tertiary", compact ? "mb-1.5" : "mb-2")}>상호작용 가구</h2>
          <ul className="flex flex-wrap gap-2">
            {student.interactionFurnitures.map((furniture) => (
              <li key={furniture.uid}>
                {/* Furniture icons carry wide transparent margins, so the icon is drawn at 110% of the tile. */}
                <TooltipButton
                  label={`${furniture.name} 이름 표시`}
                  tooltip={furniture.name}
                  className={cn("block rounded-md [&_img]:size-[110%] [&_img]:max-w-none [&_img]:shrink-0", compact ? "[&>span]:!size-10" : "[&>span]:!size-11", v2FocusRing)}
                >
                  <ResourceThumb itemUid={furniture.uid} resourceType={ResourceTypeEnum.Furniture} name={furniture.name} size="sm" />
                </TooltipButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      </div>
      ) : null}
    </section>
  );
}
