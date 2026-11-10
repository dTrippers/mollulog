import { useState } from "react";
import { StudentThumb } from "~/components/v2/features/students/StudentThumb";
import { StudentThumbList } from "~/components/v2/features/students/StudentThumbList";
import { splitVisibleStudentName } from "~/components/v2/features/students/split-student-name";
import { cn } from "~/lib/utils";
import type { PickupStudent } from "./pickup-record";

// Students shown before the "+N" tile: one row on a phone, where five tiles fit, and eight from sm.
const VISIBLE_LIMIT = { mobile: 4, wide: 8 } as const;

type PickupStudentListProps = {
  title: string;
  students: PickupStudent[];
  // The chip on a portrait that marks why the student is here: "픽업" for a pickup student, "교환" for an exchange.
  labelFor: (student: PickupStudent) => string | undefined;
  // Text shown when the record has no student list, such as 학생 목록 미입력.
  emptyText?: string;
};

// Names sit on the portraits. A long list shows the first students and a "+N" tile that opens the rest.
export default function PickupStudentList({ title, students, labelFor, emptyText }: PickupStudentListProps) {
  const [expanded, setExpanded] = useState(false);
  // A list that fits in the row with no tile shows every student.
  const mobileHidden =
    expanded || students.length <= VISIBLE_LIMIT.mobile + 1 ? 0 : students.length - VISIBLE_LIMIT.mobile;
  const wideHidden = expanded ? 0 : Math.max(0, students.length - VISIBLE_LIMIT.wide);
  const visible = wideHidden > 0 ? students.slice(0, VISIBLE_LIMIT.wide) : students;

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-v2-fg">{title}</p>
      {students.length === 0 ? (
        <p className="text-sm text-v2-fg-tertiary">{emptyText}</p>
      ) : (
        <StudentThumbList>
          {visible.map((student, index) => {
            const { name, variant } = splitVisibleStudentName(student.name);
            const label = labelFor(student);
            return (
              <li
                // A student can appear twice in one record, so the position joins the key.
                // biome-ignore lint/suspicious/noArrayIndexKey: duplicates are valid and the list never reorders
                key={`${student.uid}-${index}`}
                className={cn(mobileHidden > 0 && index >= VISIBLE_LIMIT.mobile && "max-sm:hidden")}
              >
                <StudentThumb
                  studentUid={student.uid}
                  name={name}
                  variant={variant}
                  recruitmentLabel={label}
                  captionPlacement="overlay"
                  overlayOnMobile
                />
              </li>
            );
          })}
          {mobileHidden > 0 ? (
            <MoreTile count={mobileHidden} className="sm:hidden" onClick={() => setExpanded(true)} />
          ) : null}
          {wideHidden > 0 ? (
            <MoreTile count={wideHidden} className="max-sm:hidden" onClick={() => setExpanded(true)} />
          ) : null}
        </StudentThumbList>
      )}
    </div>
  );
}

function MoreTile({ count, className, onClick }: { count: number; className: string; onClick: () => void }) {
  return (
    <li className={className}>
      <button
        type="button"
        aria-label={`외 ${count}명 보기`}
        onClick={onClick}
        className={cn(
          "flex aspect-[5/6] w-14 cursor-pointer items-center justify-center rounded-md bg-v2-inset text-sm font-medium text-v2-fg-secondary tabular-nums hover:bg-v2-filled-hover sm:w-16",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-focus",
        )}
      >
        +{count}
      </button>
    </li>
  );
}
