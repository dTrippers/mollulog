import { StarIcon } from "@heroicons/react/16/solid";
import { AttributeStripes } from "./AttributeStripes";
import { StudentThumb } from "./StudentThumb";
import { splitVisibleStudentName } from "./split-student-name";
import { useDisplayTimeZone } from "~/contexts/TimeZoneProvider";
import { terrainAdaptationIconUrl } from "~/models/assets";
import { getStudentDirectoryLabel, type StudentDirectoryFilterState, type StudentDirectoryPersonalState } from "~/domain/student-directory";
import type { StudentDirectoryStudent } from "~/models/student-directory";

export function DirectoryCard({
  student,
  state,
  personal,
}: {
  student: StudentDirectoryStudent;
  state: StudentDirectoryFilterState;
  personal: StudentDirectoryPersonalState;
}) {
  const timeZone = useDisplayTimeZone();
  const label = getStudentDirectoryLabel(student, state.displayBy, state.sort, personal, timeZone);
  const { name, variant } = splitVisibleStudentName(student.name);
  return (
    <StudentThumb
      studentUid={student.uid}
      name={name}
      variant={variant}
      linkTo={`/students/${student.uid}`}
      scrimLabel={label ? <ScrimContent student={student} label={label} /> : null}
      scrimAriaLabel={label?.ariaLabel}
    />
  );
}

function ScrimContent({
  student,
  label,
}: {
  student: StudentDirectoryStudent;
  label: NonNullable<ReturnType<typeof getStudentDirectoryLabel>>;
}) {
  if (label.narrowValue !== undefined) {
    return (
      <>
        <span className="md:hidden">{label.narrowValue}</span>
        <span className="hidden md:inline">{label.value}</span>
      </>
    );
  }
  if (label.kind === "initialTier") {
    return <span className="inline-flex items-center gap-0.5"><StarIcon className="size-3 shrink-0" aria-hidden="true" /><span className="tabular-nums">{label.value}</span></span>;
  }
  if (label.kind === "personalTier") {
    return label.ariaLabel.startsWith("고유무기") ? (
      <span className="inline-flex items-center gap-0.5"><img src="/icons/exclusive_weapon.png" alt="" className="size-3 shrink-0" /><span className="tabular-nums">{label.value}</span></span>
    ) : (
      <span className="inline-flex items-center gap-0.5"><StarIcon className="size-3 shrink-0" aria-hidden="true" /><span className="tabular-nums">{label.value}</span></span>
    );
  }
  if (label.kind === "terrain") {
    return (
      <span className="inline-flex items-center gap-0.5">
        <img src={terrainAdaptationIconUrl(label.value as "SS" | "S" | "A" | "B" | "C" | "D")} alt="" aria-hidden="true" className="size-3 shrink-0 object-contain" />
      </span>
    );
  }
  if (label.kind === "attackType" || label.kind === "defenseType" || label.kind === "class") {
    return (
      <span className="[&>p]:text-v2-on-media [&>p]:text-[0.625rem] [&>p]:leading-4">
        <AttributeStripes
          attackType={label.kind === "attackType" ? student.attackType : null}
          defenseType={label.kind === "defenseType" ? student.defenseType : null}
          role={label.kind === "class" ? student.role : null}
        />
      </span>
    );
  }
  return <span className="tabular-nums">{label.value}</span>;
}
