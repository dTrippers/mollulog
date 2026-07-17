import { StarIcon, XMarkIcon } from "@heroicons/react/16/solid";
import hangul from "hangul-js";
import { useMemo, useState } from "react";
import { StudentCards } from "~/components/features/students";
import { Input, ProfileImage } from "~/components/primitives";
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
    <div className="space-y-2">
      <Input size="sm" placeholder="이름으로 찾기..." value={searchValue} onChange={setSearchValue} />
      {searchedStudents.length > 0 ? (
        <div>
          <StudentCards
            students={searchedStudents}
            mobileGrid={5}
            namePlacement="overlay"
            onSelect={(uid) => {
              onSelect({ uid, tiers: [] });
              setSearchValue("");
            }}
            pcGrid={5}
          />
        </div>
      ) : null}

      {selectedStudents.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedStudents.map(({ uid, tiers }) => {
            const student = searchableStudents.find((candidate) => candidate.uid === uid);
            const availableTiers = student?.tiers ?? [];
            return (
              <div key={`future-student-${uid}`} className="w-full rounded-lg bg-card p-1">
                <div className="flex items-center gap-1.5">
                  <ProfileImage studentUid={uid} imageSize={6} />
                  <p className="min-w-0 grow truncate text-sm font-semibold">{student?.name ?? "학생 정보 없음"}</p>
                  <button
                    type="button"
                    className="-mr-1 shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    onClick={() => onRemove(uid)}
                    aria-label={`${student?.name ?? "선택한 학생"} 제거`}
                  >
                    <XMarkIcon className="size-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="mt-1 flex flex-nowrap items-center gap-1 overflow-x-auto">
                  <button
                    type="button"
                    className={cn(
                      "h-7 shrink-0 cursor-pointer rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                      tiers.length === 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
                    )}
                    onClick={() => onSelect({ uid, tiers: [] })}
                  >
                    전체
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
                        className={cn(
                          "flex h-7 min-w-7 shrink-0 cursor-pointer items-center justify-center gap-0.5 rounded-md px-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
                        )}
                      >
                        {tier <= 5 ? (
                          <StarIcon
                            className={cn("size-3", isSelected ? "text-primary-foreground" : "text-amber-500")}
                          />
                        ) : (
                          <img className="size-3" src="/icons/exclusive_weapon.png" alt="고유 장비" />
                        )}
                        <span>{tier > 5 ? tier - 5 : tier}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
