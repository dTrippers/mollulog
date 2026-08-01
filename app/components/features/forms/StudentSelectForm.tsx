import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/20/solid";
import hangul from "hangul-js";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Field } from "~/components/primitives";
import { cn } from "~/lib/utils";
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
      className={cn(size, "rounded-full bg-muted object-cover")}
      loading="lazy"
    />
  );
}

type SearchInputProps = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchPlaceholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

function SearchInput({ searchQuery, setSearchQuery, searchPlaceholder, inputRef }: SearchInputProps) {
  return (
    <div className="border-b border-border bg-popover p-1.5">
      <input
        ref={inputRef}
        type="text"
        className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-ring focus:ring-2 focus:ring-ring/30"
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
  label?: string;
  description?: string;
  descriptionAction?: ReactNode;
  name?: string;
  students: Student[];
  initialStudentUids?: string[];
  placeholder?: string;
  searchPlaceholder?: string;
  multiple?: boolean;
  allowDuplicateSelection?: boolean;
  maxSelectedCount?: number;
  hideInput?: boolean;
  onSelect?: (value: string | string[]) => void;
  className?: string;
  containerClassName?: string;
  popoverClassName?: string;
};

export default function StudentSelectForm({
  label,
  description,
  descriptionAction,
  name,
  students,
  initialStudentUids,
  placeholder,
  searchPlaceholder,
  multiple = false,
  allowDuplicateSelection = false,
  maxSelectedCount,
  hideInput = false,
  onSelect,
  className,
  containerClassName,
  popoverClassName,
}: StudentSelectFormProps) {
  const { submitFormGroup } = useFormGroup();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedUids, setSelectedUids] = useState<string[]>(() => [...(initialStudentUids ?? [])]);
  const buttonId = useId();
  const listboxId = useId();

  const selectedStudents = selectedUids
    .map((uid) => students.find((student) => student.uid === uid))
    .filter((student): student is Student => student !== undefined);
  const filteredStudents = students.filter((student) => hangul.search(student.name, debouncedSearchQuery) >= 0);

  useEffect(() => {
    const nextSelectedUids = initialStudentUids ?? [];
    setSelectedUids((previousSelectedUids) => {
      if (
        previousSelectedUids.length === nextSelectedUids.length &&
        previousSelectedUids.every((uid, index) => uid === nextSelectedUids[index])
      ) {
        return previousSelectedUids;
      }

      return [...nextSelectedUids];
    });
  }, [initialStudentUids]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (hideInput) {
      setIsOpen(false);
      setSearchQuery("");
      return;
    }

    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setSearchQuery("");
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hideInput, isOpen]);

  const updateSelection = (newSelectedValues: string[]) => {
    setSelectedUids(newSelectedValues);
    onSelect?.(multiple ? newSelectedValues : (newSelectedValues[0] ?? ""));
    submitFormGroup();
  };

  const closeOptions = () => {
    setIsOpen(false);
    setSearchQuery("");
  };

  const handleSelect = (studentUid: string) => {
    if (
      multiple &&
      maxSelectedCount !== undefined &&
      (allowDuplicateSelection || !selectedUids.includes(studentUid)) &&
      selectedUids.length >= maxSelectedCount
    ) {
      closeOptions();
      return;
    }

    const newSelectedValues = multiple
      ? selectedUids.includes(studentUid) && !allowDuplicateSelection
        ? selectedUids
        : [...selectedUids, studentUid]
      : [studentUid];

    if (!multiple || (maxSelectedCount !== undefined && newSelectedValues.length >= maxSelectedCount)) {
      closeOptions();
    }

    updateSelection(newSelectedValues);
  };

  const handleRemove = (studentUid: string) => {
    updateSelection(selectedUids.filter((uid) => uid !== studentUid));
  };

  const handleRemoveAt = (indexToRemove: number) => {
    updateSelection(selectedUids.filter((_, index) => index !== indexToRemove));
  };

  const renderSelectedDisplay = () => {
    if (selectedStudents.length === 0) {
      return placeholder ? <p className="text-muted-foreground">{placeholder}</p> : null;
    }

    if (multiple) {
      return (
        <div className="flex flex-wrap gap-2">
          {selectedStudents.map((student, index) => (
            <div
              key={`${student.uid}-${index}`}
              className="flex cursor-pointer items-center gap-x-2 rounded-full bg-primary/10 transition-colors hover:bg-primary/15"
            >
              <StudentImage student={student} size="size-8" />
              <span className="text-sm text-primary">{student.name}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (allowDuplicateSelection) {
                    handleRemoveAt(index);
                  } else {
                    handleRemove(student.uid);
                  }
                }}
                className="text-primary/70 hover:text-primary"
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
      <div className="flex items-center gap-3 text-foreground">
        <StudentImage student={student} size="size-6" />
        <p>{student.name}</p>
      </div>
    );
  };

  return (
    <>
      <Field label={label} description={description} containerClassName={containerClassName ?? "mt-2 mb-8 last:mb-2"}>
        <>
          {descriptionAction}
          {!hideInput && (
            <div className="relative" ref={rootRef}>
              <button
                id={buttonId}
                type="button"
                className={cn(
                  "flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-left text-foreground transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
                  className,
                )}
                onClick={() => setIsOpen((prev) => !prev)}
                aria-controls={listboxId}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
              >
                <div className="min-w-0 flex-1">{renderSelectedDisplay()}</div>
                <ChevronDownIcon
                  className={cn("size-5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                />
              </button>
              {isOpen && (
                <div
                  id={listboxId}
                  aria-labelledby={buttonId}
                  className={cn(
                    "absolute top-full left-0 z-20 mt-2 w-full overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg shadow-foreground/10",
                    popoverClassName,
                  )}
                >
                  <SearchInput
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    searchPlaceholder={searchPlaceholder}
                    inputRef={searchInputRef}
                  />
                  {filteredStudents.length > 0 ? (
                    <ul className="no-scrollbar max-h-60 overflow-y-auto py-0.5">
                      {filteredStudents.slice(0, 10).map((student) => (
                        <li key={student.uid}>
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-x-2 text-left transition-colors duration-100 hover:bg-muted/60"
                            onClick={() => handleSelect(student.uid)}
                          >
                            <div className="flex w-full items-center gap-x-3 px-3 py-2">
                              <StudentImage student={student} size="size-8" />
                              <p className="grow text-sm text-foreground">{student.name}</p>
                              {selectedUids.includes(student.uid) && (
                                <span className="text-xs font-medium text-primary">선택됨</span>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">검색 결과가 없어요</div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      </Field>
      <input type="hidden" name={name} value={selectedUids.join(",")} />
    </>
  );
}
