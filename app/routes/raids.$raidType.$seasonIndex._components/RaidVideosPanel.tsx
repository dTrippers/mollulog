import { ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { PanelBody, PanelFilterButtonsSection, PanelSwitchRow } from "~/components/primitives";
import type { Difficulty } from "~/domain/raid-score";
import { difficultyLocale } from "~/locales/ko";
import type { VideoSort } from "~/models/raid-videos";

type RaidVideosPanelProps = {
  difficulty: Difficulty | null;
  filterableDifficulties: Difficulty[];
  onDifficultyChange: (difficulty: Difficulty | null) => void;
  sort: VideoSort;
  onSortChange: (sort: VideoSort) => void;
  onlyWithParty: boolean;
  onOnlyWithPartyChange: (value: boolean) => void;
  showUnrecruitedStudents: boolean;
  onShowUnrecruitedStudentsChange: (value: boolean) => void;
  canShowUnrecruitedStudents: boolean;
};

export default function RaidVideosPanel({
  difficulty,
  filterableDifficulties,
  onDifficultyChange,
  sort,
  onSortChange,
  onlyWithParty,
  onOnlyWithPartyChange,
  showUnrecruitedStudents,
  onShowUnrecruitedStudentsChange,
  canShowUnrecruitedStudents,
}: RaidVideosPanelProps) {
  return (
    <PanelBody>
      {filterableDifficulties.length > 0 ? (
        <PanelFilterButtonsSection
          title="난이도"
          buttonProps={filterableDifficulties.map((filterableDifficulty) => ({
            text: difficultyLocale[filterableDifficulty],
            active: difficulty === filterableDifficulty,
            onToggle: (activated) => onDifficultyChange(activated ? filterableDifficulty : null),
          }))}
          exclusive
          size="sm"
        />
      ) : null}
      <PanelFilterButtonsSection
        title="정렬"
        Icon={ArrowsUpDownIcon}
        buttonProps={[
          {
            text: "점수순",
            active: sort === "score_desc",
            onToggle: (activated) => activated && onSortChange("score_desc"),
          },
          {
            text: "최신순",
            active: sort === "published_at_desc",
            onToggle: (activated) => activated && onSortChange("published_at_desc"),
          },
        ]}
        exclusive
        atLeastOne
        size="sm"
      />
      <PanelSwitchRow
        title="편성 정보가 있는 영상만 보기"
        checked={onlyWithParty}
        className="border-t-0 pt-0"
        onChange={onOnlyWithPartyChange}
      />
      {canShowUnrecruitedStudents ? (
        <PanelSwitchRow
          title="미모집 학생 표시"
          checked={showUnrecruitedStudents}
          className="border-t-0 pt-0"
          onChange={onShowUnrecruitedStudentsChange}
        />
      ) : null}
    </PanelBody>
  );
}
