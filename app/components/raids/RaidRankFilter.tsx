import { useSignIn } from "~/contexts/SignInProvider";
import { Toggle } from "~/components/atoms/form";
import RaidRankFilterStudentSearch from "./RaidRankFilterStudentSearch";
import { FilterButtons } from "~/components/navigation";
import type { Difficulty } from "~/models/raid";
import { difficultyLocale } from "~/locales/ko";
import ClickableSurface from "../primitives/ClickableSurface";

export type RaidRankFilterState = {
  filterNotOwned: boolean;
  includeStudents: { uid: string; tiers: number[] }[];
  excludeStudents: { uid: string; tiers: number[] }[];
  difficulty: Difficulty | null;
};

type RaidRankFilterProps = {
  state: RaidRankFilterState;
  setState: React.Dispatch<React.SetStateAction<RaidRankFilterState>>;

  filterableStudents: {
    uid: string;
    name: string;
    tiers: number[];
  }[];
  filterableDifficulties: Difficulty[];
  signedIn: boolean;
};

export function mergeFilteredStudents(prev: { uid: string; tiers: number[] }[], toMerge: { uid: string; tiers: number[] }): { uid: string; tiers: number[] }[] {
  let found = false;
  const results = prev.map((student) => {
    if (student.uid === toMerge.uid) {
      found = true;
      return { ...student, tiers: toMerge.tiers };
    }
    return student;
  });
  if (!found) {
    results.push(toMerge);
  }
  return results;
}

export default function RaidRankFilter({ state, setState, signedIn, filterableStudents, filterableDifficulties }: RaidRankFilterProps) {
  const { showSignIn } = useSignIn();
  const updateStudents = (
    key: "includeStudents" | "excludeStudents",
    nextStudents: RaidRankFilterState["includeStudents"],
  ) => {
    setState((prev) => ({ ...prev, [key]: nextStudents }));
  };

  return (
    <>
      <div className="mb-6">
        <p className="font-bold">난이도</p>
        <FilterButtons
          buttonProps={filterableDifficulties.map((difficulty) => ({
            text: difficultyLocale[difficulty],
            active: state.difficulty === difficulty,
            onToggle: (activated) => setState((prev) => ({ ...prev, difficulty: activated ? difficulty : null })),
          }))}
          exclusive
        />
      </div>

      <div className="mb-4">
        <p className="font-bold">포함할 학생</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">선택한 학생을 모두 포함</p>
        <RaidRankFilterStudentSearch
          searchableStudents={filterableStudents}
          selectedStudents={state.includeStudents}
          onSelect={({ uid, tiers }) => {
            updateStudents("includeStudents", mergeFilteredStudents(state.includeStudents, { uid, tiers }));
          }}
          onRemove={(uid) => {
            updateStudents("includeStudents", state.includeStudents.filter((student) => student.uid !== uid));
          }}
        />
      </div>

      <div>
        <p className="font-bold">제외할 학생</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">선택한 학생이 한 명이라도 포함되면 제외</p>
        <ClickableSurface onClick={!signedIn ? showSignIn : undefined}>
          <Toggle
            label="내가 모집하지 않은 학생"
            disabled={!signedIn}
            onChange={(activated) => setState((prev) => ({ ...prev, filterNotOwned: activated }))}
          />
        </ClickableSurface>
        <RaidRankFilterStudentSearch
          searchableStudents={filterableStudents}
          selectedStudents={state.excludeStudents}
          onSelect={({ uid, tiers }) => {
            updateStudents("excludeStudents", mergeFilteredStudents(state.excludeStudents, { uid, tiers }));
          }}
          onRemove={(uid) => {
            updateStudents("excludeStudents", state.excludeStudents.filter((student) => student.uid !== uid));
          }}
        />
      </div>
    </>
  );
}
