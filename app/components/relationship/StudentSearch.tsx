import { ChevronLeftIcon, ChevronRightIcon, HeartIcon } from "@heroicons/react/16/solid";
import { useState, useRef, useEffect } from "react";
import { Input } from "~/components/atoms/form";
import { ProfileImage } from "~/components/atoms/student";
import { SubTitle } from "~/components/atoms/typography";
import { filterStudentByName } from "~/filters/student";
import { parseVisibleNames } from "~/models/student";
import { sanitizeClassName } from "~/prophandlers";

type StudentSearchProps = {
  students: { uid: string; name: string; currentLevel: number | null }[];

  selectedStudentUid: string | null;
  onSelectStudentUid: React.Dispatch<React.SetStateAction<string | null>>;
};

export default function StudentSearch({ students, selectedStudentUid, onSelectStudentUid }: StudentSearchProps) {
  const [filteredStudents, setFilteredStudents] = useState<{ uid: string; name: string; currentLevel: number | null }[]>(students.slice(0, 20));

  useEffect(() => {
    const sorted = students.slice(0, 20).sort((a, b) => {
      const aLevel = a.currentLevel ?? 0;
      const bLevel = b.currentLevel ?? 0;
      return bLevel - aLevel;
    });
    setFilteredStudents(sorted);
  }, [students]);

  return (
    <div>
      <SubTitle text="학생 선택" />
      <Input
        placeholder="이름으로 찾기..."
        onChange={(value) => {
          const filtered = filterStudentByName(value, students, 20);
          const sorted = filtered.sort((a, b) => {
            const aLevel = students.find(s => s.uid === a.uid)?.currentLevel ?? 0;
            const bLevel = students.find(s => s.uid === b.uid)?.currentLevel ?? 0;
            return bLevel - aLevel;
          });
          setFilteredStudents(sorted);
        }}
      />

      <div className="-mt-8">
        <StudentSearchResult
          students={filteredStudents}
          selectedStudentUid={selectedStudentUid}
          onSelectStudentUid={onSelectStudentUid}
        />
      </div>
    </div>
  );
}

type StudentSearchResultProps = {
  students: { uid: string; name: string; currentLevel: number | null }[];
  selectedStudentUid: string | null;
  onSelectStudentUid: React.Dispatch<React.SetStateAction<string | null>>;
};

function StudentSearchResult({ students, selectedStudentUid, onSelectStudentUid }: StudentSearchResultProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollButtons = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth);
    }
  };

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollButtons);
      return () => container.removeEventListener('scroll', checkScrollButtons);
    }
  }, [students]);

  const scrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -200,
        behavior: 'smooth'
      });
    }
  };

  const scrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 200,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="w-full relative">
      {/* Left scroll button */}
      {canScrollLeft && (
        <button
          onClick={scrollLeft}
          className="absolute left-1 top-2/5 -translate-y-1/2 z-10 bg-white dark:bg-neutral-800 shadow-lg rounded-full p-1 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
          aria-label="Scroll left"
        >
          <ChevronLeftIcon className="size-6 text-neutral-600 dark:text-neutral-400" />
        </button>
      )}

      {/* Right scroll button */}
      {canScrollRight && (
        <button
          onClick={scrollRight}
          className="absolute right-1 top-2/5 -translate-y-1/2 z-10 bg-white dark:bg-neutral-800 shadow-lg rounded-full p-1 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
          aria-label="Scroll right"
        >
          <ChevronRightIcon className="size-6 text-neutral-600 dark:text-neutral-400" />
        </button>
      )}

      <div
        ref={scrollContainerRef}
        className="flex overflow-x-auto no-scrollbar py-2"
      >
        {students.map((student) => {
          const visibleNames = parseVisibleNames(student.name);
          return (
            <button
              key={student.uid}
              className={sanitizeClassName(`
                relative shrink-0 flex flex-col border-2 items-center transition-all p-1 rounded-lg
                ${selectedStudentUid === student.uid ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700" : "hover:bg-neutral-100 dark:hover:bg-neutral-700 border-transparent"}
              `)}
              onClick={() => onSelectStudentUid(student.uid)}
            >
              <div className="relative">
                <ProfileImage studentUid={student.uid} imageSize={16} />

                {/* Heart badge at bottom-right */}
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
        })}
      </div>
    </div>
  );
}
