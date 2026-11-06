import { Link } from "react-router";
import type { StudentHeaderQuery } from "~/graphql/graphql";
import { cn } from "~/lib/utils";
import { getV2LinkTransitionProps } from "../../layout/screen-transition";

type Student = Pick<NonNullable<StudentHeaderQuery["student"]>, "uid" | "name" | "studentVariant">;

export function StudentFormSwitch({ student }: { student: Student }) {
  if (!student.studentVariant.isMulticlass) return null;

  return (
    <nav aria-label="폼 체인지" className="inline-flex h-7 shrink-0 gap-0.5 rounded-md bg-v2-inset p-0.5">
      {student.studentVariant.students.map((form, index) => (
        <Link
          key={form.uid}
          to={`/students/${form.uid}`}
          aria-current={form.uid === student.uid ? "page" : undefined}
          aria-label={`${student.name} 폼 ${index + 1}`}
          title={`${student.name} 폼 ${index + 1}`}
          {...getV2LinkTransitionProps("crossfade")}
          className={cn(
            "inline-flex h-6 min-w-7 items-center justify-center rounded-sm px-2 text-xs font-medium tabular-nums active:opacity-80",
            form.uid === student.uid ? "bg-v2-surface font-semibold text-v2-fg" : "text-v2-fg-secondary hover:text-v2-fg",
          )}
        >
          {index + 1}
        </Link>
      ))}
    </nav>
  );
}
