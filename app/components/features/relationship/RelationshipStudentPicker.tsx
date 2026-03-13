import { HeartIcon } from "@heroicons/react/16/solid";
import { useEffect, useMemo, useState } from "react";
import { Input } from "~/components/atoms/form";
import { ProfileImage } from "~/components/atoms/student";
import { SubTitle } from "~/components/atoms/typography";
import { HorizontalScroll } from "~/components/ui";
import { filterStudentByName } from "~/filters/student";
import { parseVisibleNames } from "~/models/student";
import { sanitizeClassName } from "~/prophandlers";

type RelationshipStudent = {
  uid: string;
  name: string;
  currentLevel: number | null;
};

type RelationshipStudentPickerProps = {
  students: RelationshipStudent[];
  selectedStudentUid: string | null;
  onSelectStudentUid: (studentUid: string | null) => void;
};

export default function RelationshipStudentPicker({
  students,
  selectedStudentUid,
  onSelectStudentUid,
}: RelationshipStudentPickerProps) {
  const [searchValue, setSearchValue] = useState("");
  const [filteredStudents, setFilteredStudents] = useState<RelationshipStudent[]>(() => sortStudentsByLevel(students.slice(0, 20), students));

  useEffect(() => {
    if (searchValue.length > 0) {
      return;
    }

    setFilteredStudents(sortStudentsByLevel(students.slice(0, 20), students));
  }, [searchValue, students]);

  const hasSearchResults = filteredStudents.length > 0;
  const pickerStudents = useMemo(
    () => filteredStudents.map((student) => (
      <StudentPickerCard
        key={student.uid}
        student={student}
        selected={selectedStudentUid === student.uid}
        onSelect={() => onSelectStudentUid(student.uid)}
      />
    )),
    [filteredStudents, onSelectStudentUid, selectedStudentUid],
  );

  return (
    <div>
      <SubTitle text="학생 선택" />
      <Input
        placeholder="이름으로 찾기..."
        value={searchValue}
        onChange={(value) => {
          setSearchValue(value);
          const filtered = filterStudentByName(value, students, 20);
          setFilteredStudents(sortStudentsByLevel(filtered, students));
        }}
      />

      <div className="-mt-8">
        {hasSearchResults && (
          <HorizontalScroll
            itemWidth={{ mobile: "w-auto", desktop: "md:w-auto" }}
            gap="gap-2"
            showArrowsOnMobile
            className="py-2"
          >
            {pickerStudents}
          </HorizontalScroll>
        )}
      </div>
    </div>
  );
}

function StudentPickerCard({
  student,
  selected,
  onSelect,
}: {
  student: RelationshipStudent;
  selected: boolean;
  onSelect: () => void;
}) {
  const visibleNames = parseVisibleNames(student.name);

  return (
    <button
      type="button"
      className={sanitizeClassName(`
        relative flex flex-col items-center border-2 transition-all p-1 rounded-lg min-w-24
        ${selected ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700" : "hover:bg-neutral-100 dark:hover:bg-neutral-700 border-transparent"}
      `)}
      onClick={onSelect}
    >
      <div className="relative">
        <ProfileImage studentUid={student.uid} imageSize={16} />
        {student.currentLevel && (
          <div className="absolute -bottom-1 -right-1">
            <div className="relative">
              <HeartIcon className="size-8 text-rose-500 blur-[1px]" />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white leading-none">
                {student.currentLevel}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 text-center text-neutral-700 dark:text-neutral-300">
        <p className="text-sm">{visibleNames[0]}</p>
        {visibleNames.length === 2 && <p className="text-xs">{visibleNames[1]}</p>}
      </div>
    </button>
  );
}

function sortStudentsByLevel(candidates: RelationshipStudent[], students: RelationshipStudent[]) {
  return [...candidates].sort((a, b) => {
    const aLevel = students.find((student) => student.uid === a.uid)?.currentLevel ?? 0;
    const bLevel = students.find((student) => student.uid === b.uid)?.currentLevel ?? 0;
    return bLevel - aLevel;
  });
}
