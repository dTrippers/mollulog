import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { useState, useEffect } from "react";
import hangul from "hangul-js";
import { studentImageUrl } from "~/models/assets";
import { useFormGroup } from "~/components/organisms/form/FormGroup";
import { Field } from "~/components/primitives";

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
    <div className="sticky top-0 p-2 bg-white/90 dark:bg-black/80 backdrop-blur-sm border-b border-neutral-100 dark:border-neutral-800 z-10">
      <input
        type="text"
        className="w-full p-2"
        placeholder={searchPlaceholder ?? "검색해서 찾기..."}
        value={searchQuery}
        onChange={(e) => {
          e.stopPropagation();
          setSearchQuery(e.target.value);
        }}
        onClick={(e) => e.stopPropagation()}
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
  label, description, name, students, initialStudentUids = [], placeholder, searchPlaceholder, multiple = false, onSelect,
}: StudentSelectFormProps) {
  const { submitFormGroup } = useFormGroup();

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedUids, setSelectedUids] = useState<string[]>(initialStudentUids);

  const selectedStudents = selectedUids.map((uid) => students.find((student) => student.uid === uid)).filter((student) => student !== undefined);
  const filteredStudents = students.filter((student) =>
    hangul.search(student.name, debouncedSearchQuery) >= 0
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const updateSelection = (newSelectedValues: string[]) => {
    setSelectedUids(newSelectedValues);
    onSelect?.(multiple ? newSelectedValues : newSelectedValues[0] || "");
    submitFormGroup();
  };

  const handleSelect = (studentUid: string) => {
    let newSelectedValues: string[];
    if (multiple) {
      newSelectedValues = [...selectedUids, studentUid];
    } else {
      newSelectedValues = [studentUid];
      setIsOpen(false);
      setSearchQuery("");
    }

    updateSelection(newSelectedValues);
  };

  const handleRemove = (index: number) => {
    const newSelectedValues = selectedUids.filter((_, i) => i !== index);
    updateSelection(newSelectedValues);
  };

  const renderSelectedDisplay = () => {
    if (selectedStudents.length === 0) {
      return placeholder && <p className="mt-2 text-neutral-400 dark:text-neutral-500">{placeholder}</p>;
    }

    if (multiple) {
      return (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedStudents.map((student, index) => (
            <div
              key={`${student.uid}-${index}`}
              className="flex items-center gap-x-2 bg-blue-100 dark:bg-blue-950 hover:bg-blue-200 dark:hover:bg-blue-900 rounded-full transition-colors cursor-pointer"
            >
              <StudentImage student={student} size="size-8" />
              <span className="text-sm text-blue-900 dark:text-blue-100">{student.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove(index);
                }}
                className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
              >
                <XMarkIcon className="size-4 mr-2" />
              </button>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="mt-2 flex items-center gap-x-2">
        <StudentImage student={selectedStudents[0]} size="size-6 md:size-8" />
        <p className="text-neutral-700 dark:text-neutral-300">{selectedStudents[0].name}</p>
      </div>
    );
  };

  return (
    <>
      <div className="p-4 relative">
        <button type="button" className="w-full cursor-pointer text-left" onClick={() => setIsOpen(!isOpen)}>
          <Field label={label} description={description} containerClassName="pointer-events-none">
            {renderSelectedDisplay()}
          </Field>
          <ChevronDownIcon className="size-4 absolute right-4 top-1/2 -translate-y-1/2" />
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 w-full max-h-64 overflow-y-auto no-scrollbar bg-white/90 dark:bg-black/80 backdrop-blur-sm rounded-b-lg shadow-lg">
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
                  className="flex items-center gap-x-2 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors duration-100 cursor-pointer"
                  onClick={() => handleSelect(student.uid)}
                >
                  <div className="px-4 my-2 flex items-center gap-x-4">
                    <StudentImage student={student} size="size-10" />
                    <p className="grow">{student.name}</p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-4 text-neutral-500 dark:text-neutral-400 text-center">
                검색 결과가 없어요
              </div>
            )}
          </div>
        )}
      </div>
      <input type="hidden" name={name} value={selectedUids.join(",")} />
    </>
  );
}
