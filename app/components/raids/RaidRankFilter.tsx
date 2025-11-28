import type { DefenseType } from "~/models/content.d";
import { useSignIn } from "~/contexts/SignInProvider";
import { Toggle } from "~/components/atoms/form";
import RaidRankFilterStudentSearch from "./RaidRankFilterStudentSearch";

export type RaidRankFilterState = {
  defenseType: DefenseType | null;
  filterNotOwned: boolean;
  includeStudents: { uid: string; tiers: number[] }[];
  excludeStudents: { uid: string; tiers: number[] }[];
  rankAfter: number | null;
  rankBefore: number | null;
};

type RaidRankFilterProps = {
  state: RaidRankFilterState;
  setState: React.Dispatch<React.SetStateAction<RaidRankFilterState>>;

  filterableStudents: {
    uid: string;
    name: string;
    tiers: number[];
  }[];
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

export default function RaidRankFilter({ state, setState, signedIn, filterableStudents }: RaidRankFilterProps) {
  const { showSignIn } = useSignIn();

  return (
    <>
      <div className="mb-4">
        <p className="font-bold">포함할 학생</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">선택한 학생을 모두 포함</p>
        <RaidRankFilterStudentSearch
          searchableStudents={filterableStudents}
          selectedStudents={state.includeStudents}
          onSelect={({ uid, tiers }) => {
            const newIncludeStudents = mergeFilteredStudents(state.includeStudents, { uid, tiers });
            setState((prev) => ({ ...prev, includeStudents: newIncludeStudents }));
          }}
          onRemove={(uid) => {
            const newIncludeStudents = state.includeStudents.filter((student) => student.uid !== uid);
            setState((prev) => ({ ...prev, includeStudents: newIncludeStudents }));
          }}
        />
      </div>

      <div>
        <p className="font-bold">제외할 학생</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-3">선택한 학생이 한 명이라도 포함되면 제외</p>
        <div onClick={() => { !signedIn && showSignIn() }}>
          <Toggle
            label="내가 모집하지 않은 학생"
            disabled={!signedIn}
            onChange={(activated) => setState((prev) => ({ ...prev, filterNotOwned: activated }))}
          />
        </div>
        <RaidRankFilterStudentSearch
          searchableStudents={filterableStudents}
          selectedStudents={state.excludeStudents}
          onSelect={({ uid, tiers }) => {
            const newExcludeStudents = mergeFilteredStudents(state.excludeStudents, { uid, tiers });
            setState((prev) => ({ ...prev, excludeStudents: newExcludeStudents }));
          }}
          onRemove={(uid) => {
            const newExcludeStudents = state.excludeStudents.filter((student) => student.uid !== uid);
            setState((prev) => ({ ...prev, excludeStudents: newExcludeStudents }));
          }}
        />
      </div>
    </>
  );
}
