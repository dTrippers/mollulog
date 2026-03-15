import { useEffect, useMemo, useState } from "react";
import { StarIcon, XMarkIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { StudentCard, StudentCards } from "~/components/features/students";
import { Input } from "~/components/primitives";
import { sanitizeClassName } from "~/prophandlers";

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

export default function RaidRankFilterStudentSearch({ selectedStudents, searchableStudents, onSelect, onRemove }: RaidRankFilterStudentSearchProps) {
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
      <Input placeholder="이름으로 찾기..." value={searchValue} onChange={setSearchValue} />
      <div className="-mt-6">
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
            <div key={`future-student-${uid}`} className="flex items-center gap-3 px-3 py-2 w-full rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <div className="w-16 shrink-0">
                <StudentCard uid={uid} />
              </div>
              <div className="grow flex flex-wrap gap-x-1 gap-y-2">
                <button
                  type="button"
                  className={sanitizeClassName(`
                    px-3 py-0.5 rounded-full border transition-all duration-200 justify-center cursor-pointer shadow-sm
                    ${tiers.length === 0
                      ? "bg-blue-500 border-blue-500 text-white"
                      : "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-blue-300 dark:hover:border-blue-600"
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
                      onClick={() => onSelect({ uid, tiers: isSelected ? tiers.filter((t) => t !== tier) : [...tiers, tier] })}
                      className={sanitizeClassName(`
                        flex items-center gap-0.5 px-2.5 py-0.5 rounded-full border transition-all duration-200 justify-center cursor-pointer shadow-sm
                        ${isSelected
                          ? "bg-blue-500 border-blue-500 text-white"
                          : "bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-blue-300 dark:hover:border-blue-600"
                        }
                      `)}
                    >
                      {tier <= 5 ?
                        <StarIcon className={`size-4 ${isSelected ? "text-white" : "text-amber-500"}`} /> :
                        <img className="size-4 my-1 mr-0.5" src="/icons/exclusive_weapon.png" alt="고유 장비" />
                      }
                      <span className="text-sm font-semibold">
                        {tier > 5 ? tier - 5 : tier}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="-mr-2 shrink-0 rounded-lg p-1 text-neutral-700 transition hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
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
