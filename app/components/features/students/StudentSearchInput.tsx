import { useState } from "react";
import { StudentCards } from "~/components/features/students";
import { Input } from "~/components/primitives";
import { filterStudentByName } from "~/filters/student";

type SearchableStudent = {
  uid: string;
  name: string;
};

type StudentSearchInputProps = {
  ariaLabel?: string;
  label?: string;
  placeholder?: string;
  description?: string;
  grid?: 4 | 6;
  mobileGrid?: 4 | 5 | 6 | 8;
  layout?: "grid" | "wrap" | "responsive-wrap";
  cardSize?: "xs" | "sm" | "md" | "lg";
  size?: "sm" | "md";
  showNoResults?: boolean;
  students: SearchableStudent[];
  onSelect: (studentUid: string) => void;
};

export default function StudentSearchInput({
  ariaLabel,
  label,
  placeholder,
  description,
  grid,
  mobileGrid,
  layout,
  cardSize,
  size,
  showNoResults = false,
  students,
  onSelect,
}: StudentSearchInputProps) {
  const [searched, setSearched] = useState<SearchableStudent[]>([]);
  const [searchValue, setSearchValue] = useState("");

  const onSearch = (search: string) => {
    setSearchValue(search);
    if (search.length === 0) {
      setSearched([]);
      return;
    }

    setSearched(filterStudentByName(search, students, grid ?? 6));
  };

  return (
    <>
      <Input
        label={label}
        aria-label={ariaLabel}
        placeholder={placeholder ?? "이름으로 찾기..."}
        description={description}
        size={size}
        onChange={onSearch}
        value={searchValue}
      />
      {searched.length > 0 && (
        <StudentCards
          mobileGrid={mobileGrid}
          pcGrid={grid}
          layout={layout}
          cardSize={cardSize}
          students={searched}
          onSelect={(studentUid) => {
            if (!studentUid) {
              return;
            }

            onSelect(studentUid);
            setSearchValue("");
            setSearched([]);
          }}
        />
      )}
      {showNoResults && searchValue.length > 0 && searched.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          검색 결과가 없어요.
        </p>
      ) : null}
    </>
  );
}
