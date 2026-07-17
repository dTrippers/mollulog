import {
  Button,
  PanelActionRow,
  PanelBody,
  PanelBodySection,
  PanelFilterButtonsSection,
  PanelSwitchRow,
} from "~/components/primitives";
import { useSignIn } from "~/contexts/SignInProvider";
import type { Difficulty } from "~/domain/raid-score";
import { difficultyLocale } from "~/locales/ko";
import RaidRankFilterStudentSearch from "./RaidRankFilterStudentSearch";

export type RaidRankFilterState = {
  filterNotOwned: boolean;
  exactParties: string[][];
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
  onClearExactParties: () => void;
};

export function mergeFilteredStudents(
  prev: { uid: string; tiers: number[] }[],
  toMerge: { uid: string; tiers: number[] },
): { uid: string; tiers: number[] }[] {
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

export default function RaidRankFilter({
  state,
  setState,
  signedIn,
  onClearExactParties,
  filterableStudents,
  filterableDifficulties,
}: RaidRankFilterProps) {
  const { showSignIn } = useSignIn();
  const updateStudents = (
    key: "includeStudents" | "excludeStudents",
    nextStudents: RaidRankFilterState["includeStudents"],
  ) => {
    setState((prev) => ({ ...prev, [key]: nextStudents }));
  };

  return (
    <PanelBody>
      {state.exactParties.length > 0 ? (
        <PanelActionRow
          title="정확한 편성"
          description={`${state.exactParties.length.toLocaleString()}개 편성이 모두 일치하는 순위`}
          actions={<Button text="해제" size="xs" onClick={onClearExactParties} />}
        />
      ) : null}

      <PanelFilterButtonsSection
        title="난이도"
        size="sm"
        buttonProps={filterableDifficulties.map((difficulty) => ({
          text: difficultyLocale[difficulty],
          active: state.difficulty === difficulty,
          onToggle: (activated) => setState((prev) => ({ ...prev, difficulty: activated ? difficulty : null })),
        }))}
        exclusive
      />

      <PanelBodySection title="포함할 학생">
        <p className="text-xs text-muted-foreground">선택한 학생을 모두 포함</p>
        <RaidRankFilterStudentSearch
          searchableStudents={filterableStudents}
          selectedStudents={state.includeStudents}
          onSelect={({ uid, tiers }) => {
            updateStudents("includeStudents", mergeFilteredStudents(state.includeStudents, { uid, tiers }));
          }}
          onRemove={(uid) => {
            updateStudents(
              "includeStudents",
              state.includeStudents.filter((student) => student.uid !== uid),
            );
          }}
        />
      </PanelBodySection>

      <PanelBodySection title="제외할 학생">
        <p className="text-xs text-muted-foreground">선택한 학생이 한 명이라도 포함되면 제외</p>
        <div className="relative">
          <PanelSwitchRow
            title="내가 모집하지 않은 학생"
            checked={state.filterNotOwned}
            disabled={!signedIn}
            className="border-t-0 pt-0"
            onChange={(activated) => setState((prev) => ({ ...prev, filterNotOwned: activated }))}
          />
          {!signedIn ? (
            <button
              type="button"
              className="absolute inset-0 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
              aria-label="로그인 후 내가 모집하지 않은 학생 필터 사용"
              onClick={showSignIn}
            />
          ) : null}
        </div>
        <RaidRankFilterStudentSearch
          searchableStudents={filterableStudents}
          selectedStudents={state.excludeStudents}
          onSelect={({ uid, tiers }) => {
            updateStudents("excludeStudents", mergeFilteredStudents(state.excludeStudents, { uid, tiers }));
          }}
          onRemove={(uid) => {
            updateStudents(
              "excludeStudents",
              state.excludeStudents.filter((student) => student.uid !== uid),
            );
          }}
        />
      </PanelBodySection>
    </PanelBody>
  );
}
