import { useEffect, useMemo, useState } from "react";
import { StarIcon, XMarkIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { StudentCard, StudentCards } from "~/components/features/students";
import { Input } from "~/components/primitives";
import { cn } from "~/lib/utils";

type RaidRankFilterStudentSearchProps = {
  searchableStudents: {
    uid: string;
    name: string;
    tiers: number[];
  }[];
  selectedStudents: {
    uid: string;
    tiers: number[];
  }[];
  onSelect: ({ uid, tiers }: { uid: string; tiers: number[] }) => void;
  onRemove: (uid: string) => void;
};

export default function RaidRankFilterStudentSearch({
  selectedStudents,
  searchableStudents,
  onSelect,
  onRemove,
}: RaidRankFilterStudentSearchProps) {
  const [searchValue, setSearchValue] = useState("");
  const searchedStudents = useMemo(() => {
    if (searchValue.length === 0) {
      return [];
    }

    const results = [];
    for (const student of searchableStudents) {
      if (hangul.search(student.name, searchValue) >= 0) {
        results.push(student);
      }
      if (results.length >= 6) {
        break;
      }
    }
    return results;
  }, [searchValue, searchableStudents]);

  return (
    <>
      <Input size="sm" placeholder="이름으로 찾기..." value={searchValue} onChange={setSearchValue} />
      <div>
        {searchedStudents.length > 0 && (
          <StudentCards
            students={searchedStudents}
            onSelect={(uid) => {
              onSelect({ uid, tiers: [] });
              setSearchValue("");
            }}
            pcGrid={6}
          />
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {selectedStudents.map(({ uid, tiers }) => {
          const availableTiers = searchableStudents.find((student) => student.uid === uid)?.tiers ?? [];
          return (
            <div key={`future-student-${uid}`} className="flex w-full items-center gap-3 rounded-lg bg-card px-3 py-2">
              <div className="w-16 shrink-0">
                <StudentCard uid={uid} />
              </div>
              <div className="grow flex flex-wrap gap-x-1 gap-y-2">
                <button
                  type="button"
                  className={cn(`
                    cursor-pointer justify-center rounded-full px-3 py-0.5 shadow-sm transition-colors duration-200
                    ${
                      tiers.length === 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }
                  `)}
                  onClick={() => onSelect({ uid, tiers: [] })}
                >
                  <span className="text-sm font-semibold">전체</span>
                </button>
                {availableTiers.map((tier) => {
                  const isSelected = tiers.includes(tier);
                  return (
                    <button
                      type="button"
                      key={`tier-${tier}`}
                      onClick={() =>
                        onSelect({ uid, tiers: isSelected ? tiers.filter((t) => t !== tier) : [...tiers, tier] })
                      }
                      className={cn(`
                        flex cursor-pointer items-center justify-center gap-0.5 rounded-full px-2.5 py-0.5 shadow-sm transition-colors duration-200
                        ${
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                        }
                      `)}
                    >
                      {tier <= 5 ? (
                        <StarIcon className={`size-4 ${isSelected ? "text-white" : "text-amber-500"}`} />
                      ) : (
                        <img className="size-4 my-1 mr-0.5" src="/icons/exclusive_weapon.png" alt="고유 장비" />
                      )}
                      <span className="text-sm font-semibold">{tier > 5 ? tier - 5 : tier}</span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="-mr-2 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => onRemove(uid)}
                aria-label="선택한 학생 제거"
              >
                <XMarkIcon className="size-4" strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
