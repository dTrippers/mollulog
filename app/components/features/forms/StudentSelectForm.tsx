import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/20/solid";
import hangul from "hangul-js";
import { useEffect, useState } from "react";
import { Field } from "~/components/primitives";
import { studentImageUrl } from "~/models/assets";
import { sanitizeClassName } from "~/prophandlers";
import { useFormGroup } from "./FormGroup";

type Student = {
  uid: string;
  name: string;
};

function StudentImage({ student, size }: { student: Student; size: string }) {
  return (
    <img
      src={studentImageUrl(student.uid)}
      alt={student.name}
      className={`${size} rounded-full object-cover`}
      loading="lazy"
    />
  );
}

type SearchInputProps = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchPlaceholder?: string;
};

function SearchInput({ searchQuery, setSearchQuery, searchPlaceholder }: SearchInputProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 p-2 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/95">
      <input
        type="text"
        className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 outline-none transition placeholder:text-neutral-400 focus:border-blue-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:focus:border-blue-700"
        placeholder={searchPlaceholder ?? "검색해서 찾기..."}
        value={searchQuery}
        onChange={(event) => {
          event.stopPropagation();
          setSearchQuery(event.target.value);
        }}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export type StudentSelectFormProps = {
  label: string;
  description?: string;
  name?: string;
  students: Student[];
  initialStudentUids?: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  multiple?: boolean;
  onSelect?: (value: string | string[]) => void;
  className?: string;
  containerClassName?: string;
};

export default function StudentSelectForm({
  label,
  description,
  name,
  students,
  initialStudentUids = [],
  placeholder,
  searchPlaceholder,
  multiple = false,
  onSelect,
  className,
  containerClassName,
}: StudentSelectFormProps) {
  const { submitFormGroup } = useFormGroup();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedUids, setSelectedUids] = useState<string[]>(initialStudentUids);

  const selectedStudents = selectedUids
    .map((uid) => students.find((student) => student.uid === uid))
    .filter((student): student is Student => student !== undefined);
  const filteredStudents = students.filter((student) => hangul.search(student.name, debouncedSearchQuery) >= 0);

  useEffect(() => {
    setSelectedUids(initialStudentUids);
  }, [initialStudentUids]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const updateSelection = (newSelectedValues: string[]) => {
    setSelectedUids(newSelectedValues);
    onSelect?.(multiple ? newSelectedValues : (newSelectedValues[0] ?? ""));
    submitFormGroup();
  };

  const handleSelect = (studentUid: string) => {
    const newSelectedValues = multiple ? [...selectedUids, studentUid] : [studentUid];

    if (!multiple) {
      setIsOpen(false);
      setSearchQuery("");
    }

    updateSelection(newSelectedValues);
  };

  const handleRemove = (studentUid: string) => {
    updateSelection(selectedUids.filter((uid) => uid !== studentUid));
  };

  const renderSelectedDisplay = () => {
    if (selectedStudents.length === 0) {
      return placeholder ? <p className="text-neutral-400 dark:text-neutral-500">{placeholder}</p> : null;
    }

    if (multiple) {
      return (
        <div className="flex flex-wrap gap-2">
          {selectedStudents.map((student) => (
            <div
              key={student.uid}
              className="flex cursor-pointer items-center gap-x-2 rounded-full bg-blue-100 transition-colors hover:bg-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900"
            >
              <StudentImage student={student} size="size-8" />
              <span className="text-sm text-blue-900 dark:text-blue-100">{student.name}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleRemove(student.uid);
                }}
                className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
              >
                <XMarkIcon className="mr-2 size-4" />
              </button>
            </div>
          ))}
        </div>
      );
    }

    const student = selectedStudents[0];

    return (
      <div className="flex items-center gap-3 text-neutral-700 dark:text-neutral-300">
        <StudentImage student={student} size="size-6" />
        <p>{student.name}</p>
      </div>
    );
  };

  return (
    <>
      <Field
        label={label}
        description={description}
        containerClassName={containerClassName ?? "mt-2 mb-8 last:mb-2"}
      >
        <div className="relative">
          <button
            type="button"
            className={sanitizeClassName(`
              flex w-full items-center justify-between gap-3 rounded-lg border border-neutral-200
              bg-white px-3 py-2 text-left transition hover:border-neutral-300 hover:bg-neutral-50
              dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600 dark:hover:bg-neutral-900/80
              ${className ?? ""}
            `)}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <div className="min-w-0 flex-1">{renderSelectedDisplay()}</div>
            <ChevronDownIcon
              className={sanitizeClassName(`
                size-5 shrink-0 text-neutral-400 transition-transform
                ${isOpen ? "rotate-180" : ""}
              `)}
            />
          </button>
          {isOpen && (
            <div className="absolute top-full left-0 z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg shadow-neutral-950/10 dark:border-neutral-700 dark:bg-neutral-950">
              <SearchInput
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchPlaceholder={searchPlaceholder}
              />
              {filteredStudents.length > 0 ? (
                filteredStudents.slice(0, 10).map((student) => (
                  <button
                    type="button"
                    key={student.uid}
                    className="flex w-full cursor-pointer items-center gap-x-2 text-left transition-colors duration-100 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    onClick={() => handleSelect(student.uid)}
                  >
                    <div className="flex w-full items-center gap-x-3 px-3 py-2.5">
                      <StudentImage student={student} size="size-8" />
                      <p className="grow text-sm text-neutral-700 dark:text-neutral-200">{student.name}</p>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-sm text-neutral-500 dark:text-neutral-400">검색 결과가 없어요</div>
              )}
            </div>
          )}
        </div>
      </Field>
      <input type="hidden" name={name} value={selectedUids.join(",")} />
    </>
  );
}
