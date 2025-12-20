import { useMemo, useState, memo } from "react";
import Decimal from "decimal.js";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { ResourceCard } from "~/components/atoms/item";
import { Button, Toggle } from "~/components/atoms/form";
import { StudentCards } from "~/components/students";
import EventItemBonus from "../EventItemBonus";
import { Tabs } from "./Tabs";
import type { EventRewardBonus } from "./types";
import type { ShopState, ShopActions } from "./hooks";
import { useBonusCalculation } from "./hooks";
import { Section } from "~/components/ui";

type StudentBonusSelectorProps = {
  eventRewardBonus: EventRewardBonus[];
  recruitedStudentUids: string[];
  state: ShopState;
  actions: ShopActions;
  signedIn: boolean;
};

export const StudentBonusSelector = memo(function StudentBonusSelector({
  eventRewardBonus,
  recruitedStudentUids,
  state,
  actions,
  signedIn,
}: StudentBonusSelectorProps) {
  const eventBonusStudentUids = useMemo(() => {
    return [...new Set(eventRewardBonus.flatMap(({ rewardBonuses }) => rewardBonuses.map(({ student }) => student.uid)))];
  }, [eventRewardBonus]);

  const { bonusSummary } = useBonusCalculation({
    eventRewardBonus,
    selectedStudentUids: state.selectedBonusStudentUids,
  });

  const studentCardsData = useMemo(() => {
    return eventBonusStudentUids.map((uid) => {
      const selected = state.selectedBonusStudentUids.includes(uid);
      return {
        uid,
        grayscale: !selected,
        checked: selected,
        label: recruitedStudentUids.includes(uid) ? <span className="text-white font-normal">모집</span> : undefined,
      };
    });
  }, [eventBonusStudentUids, state.selectedBonusStudentUids, recruitedStudentUids]);

  const handleToggleRecruitedStudents = (value: boolean) => {
    actions.setIncludeRecruitedStudents(value);
    if (value) {
      actions.setBonusStudents([...new Set([...state.selectedBonusStudentUids, ...recruitedStudentUids])]);
    } else {
      actions.setBonusStudents(state.selectedBonusStudentUids.filter((uid) => !recruitedStudentUids.includes(uid)));
    }
  };

  const handleSelectAll = () => {
    actions.setBonusStudents(eventBonusStudentUids);
  };

  const handleResetAll = () => {
    actions.setBonusStudents(state.includeRecruitedStudents ? recruitedStudentUids : []);
  };

  const [tab, setTab] = useState<"student" | "item">("student");
  return (
    <Section
      title="학생 보너스"
      description={recruitedStudentUids.length === 0 ? "로그인 후 모집한 학생 정보를 등록하면 편리하게 이용할 수 있어요" : "편성 보너스를 적용할 학생을 선택하세요"}
      foldable
      foldStateKey="event-shop-section::student-bonus-selector"
      defaultExpanded={true}
    >
      <Toggle
        label="모집한 학생 일괄 반영"
        disabled={!signedIn}
        initialState={signedIn ? state.includeRecruitedStudents : false}
        onChange={handleToggleRecruitedStudents}
      />

      <Tabs
        tabs={[{ tabId: "student", name: "학생별" }, { tabId: "item", name: "아이템별" }]}
        activeTabId={tab}
        setActiveTabId={(value) => setTab(value as "student" | "item")}
      />
      {tab === "student" && (
        <>
          <StudentCards mobileGrid={8} pcGrid={12} students={studentCardsData} onSelect={actions.toggleBonusStudent} />
          <div className="my-4 p-3 w-full border border-neutral-200 dark:border-neutral-700 rounded-lg grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {bonusSummary.map(({ uid, appliedStrikerRatio, appliedSpecialRatio, maxStrikerRatio, maxSpecialRatio }) => {
              return (
                <div key={uid} className="flex flex-row items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <ResourceCard itemUid={uid} resourceType={ResourceTypeEnum.Item} rarity={1} />
                  <div>
                    <p>적용 : {appliedStrikerRatio.plus(appliedSpecialRatio).mul(100).toFixed(0)}%</p>
                    <p>최대 : {maxStrikerRatio.plus(maxSpecialRatio).mul(100).toFixed(0)}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {tab === "item" && (
        <>
          {eventRewardBonus.filter(({ rewardBonuses }) => rewardBonuses.length > 0).map(({ uid, name, rewardBonuses }) => {
            const appliedItemBonus = bonusSummary.find(({ uid: appliedUid }) => appliedUid === uid);
            const appliedRatio = appliedItemBonus?.appliedStrikerRatio.plus(appliedItemBonus?.appliedSpecialRatio) ?? new Decimal(0);
            const maxRatio = appliedItemBonus?.maxStrikerRatio.plus(appliedItemBonus?.maxSpecialRatio) ?? new Decimal(0);
            return (
              <EventItemBonus
                key={uid}
                itemUid={uid}
                itemName={name}
                appliedRatio={appliedRatio}
                maxRatio={maxRatio}
                rewardBonuses={rewardBonuses}
                selectedBonusStudentUids={state.selectedBonusStudentUids}
                setSelectedBonusStudentUid={actions.toggleBonusStudent}
                signedIn={signedIn}
              />
            );
          })}
        </>
      )}

      <div className="my-4 flex justify-end gap-0.5">
        <Button text="모두 선택" color="primary" onClick={handleSelectAll} />
        <Button text="초기화" onClick={handleResetAll} />
      </div>
    </Section>
  );
});

