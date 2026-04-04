import { useState } from "react";
import { StudentCards } from "~/components/features/students";
import { Input } from "~/components/primitives";
import { filterStudentByName } from "~/filters/student";

type SearchableStudent = {
  uid: string;
  name: string;
};

type StudentSearchInputProps = {
  label?: string;
  placeholder?: string;
  description?: string;
  grid?: 4 | 6;
  students: SearchableStudent[];
  onSelect: (studentUid: string) => void;
};

export default function StudentSearchInput({
  label,
  placeholder,
  description,
  grid,
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
        placeholder={placeholder ?? "이름으로 찾기..."}
        description={description}
        onChange={onSearch}
        value={searchValue}
      />
      {searched.length > 0 && (
        <StudentCards
          pcGrid={grid}
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
    </>
  );
}
