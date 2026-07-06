import { ArrowsUpDownIcon } from "@heroicons/react/24/outline";
import { PanelBody, PanelFilterButtonsSection, PanelSwitchRow } from "~/components/primitives";
import type { VideoSort } from "~/models/raid-videos";

type RaidVideosPanelProps = {
  sort: VideoSort;
  onSortChange: (sort: VideoSort) => void;
  onlyWithParty: boolean;
  onOnlyWithPartyChange: (value: boolean) => void;
  showUnrecruitedStudents: boolean;
  onShowUnrecruitedStudentsChange: (value: boolean) => void;
  canShowUnrecruitedStudents: boolean;
};

export default function RaidVideosPanel({
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
