import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/20/solid";
import hangul from "hangul-js";
import { useEffect, useState } from "react";
import { Field } from "~/components/primitives";
import { studentImageUrl } from "~/models/assets";
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
    <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white/90 p-2 backdrop-blur-sm dark:border-neutral-800 dark:bg-black/80">
      <input
        type="text"
        className="w-full p-2"
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
      return placeholder ? <p className="mt-2 text-neutral-400 dark:text-neutral-500">{placeholder}</p> : null;
    }

    if (multiple) {
      return (
        <div className="mt-2 flex flex-wrap gap-2">
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
      <div className="mt-2 flex items-center gap-x-2">
        <StudentImage student={student} size="size-6 md:size-8" />
        <p className="text-neutral-700 dark:text-neutral-300">{student.name}</p>
      </div>
    );
  };

  return (
    <>
      <div className="relative p-4">
        <button
          type="button"
          className="w-full cursor-pointer text-left"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <Field label={label} description={description} containerClassName="pointer-events-none">
            {renderSelectedDisplay()}
          </Field>
          <ChevronDownIcon className="absolute top-1/2 right-4 size-4 -translate-y-1/2" />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 max-h-64 w-full overflow-y-auto rounded-b-lg bg-white/90 shadow-lg backdrop-blur-sm dark:bg-black/80">
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
                  className="flex cursor-pointer items-center gap-x-2 transition-colors duration-100 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                  onClick={() => handleSelect(student.uid)}
                >
                  <div className="my-2 flex items-center gap-x-4 px-4">
                    <StudentImage student={student} size="size-10" />
                    <p className="grow">{student.name}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-neutral-500 dark:text-neutral-400">검색 결과가 없어요</div>
            )}
          </div>
        )}
      </div>
      <input type="hidden" name={name} value={selectedUids.join(",")} />
    </>
  );
}
