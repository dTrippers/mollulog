import Decimal from "decimal.js";
import { memo, useMemo, useState } from "react";
import { StudentCards } from "~/components/features/students";
import { Button, FilterButtons, ResourceCard, Section } from "~/components/primitives";
import type { EventRewardBonus } from "~/domain/event-shop";
import { ResourceTypeEnum } from "~/graphql/graphql";
import EventItemBonus from "../EventItemBonus";
import type { ShopActions, ShopState } from "./hooks";
import { useBonusCalculation } from "./hooks";
import { Tabs } from "./Tabs";

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
  const eventBonusStudents = useMemo(() => {
    return eventRewardBonus
      .flatMap(({ rewardBonuses }) => rewardBonuses.map(({ student }) => ({ uid: student.uid, name: student.name })))
      .filter((student, index, self) => index === self.findIndex((t) => t.uid === student.uid));
  }, [eventRewardBonus]);

  const eventBonusItemUids = useMemo(
    () => eventRewardBonus.filter(({ rewardBonuses }) => rewardBonuses.length > 0).map(({ uid }) => uid),
    [eventRewardBonus],
  );

  const selectedStudentUidsByItem =
    state.bonusStudentSelectionMode === "perItem" ? state.selectedBonusStudentUidsByItem : undefined;

  const { bonusSummary } = useBonusCalculation({
    eventRewardBonus,
    selectedStudentUids: state.selectedBonusStudentUids,
    selectedStudentUidsByItem,
  });

  const studentCardsData = useMemo(() => {
    return eventBonusStudents.map(({ uid, name }) => {
      const selectedItemCount =
        state.bonusStudentSelectionMode === "perItem"
          ? eventBonusItemUids.filter((itemUid) =>
              (state.selectedBonusStudentUidsByItem[itemUid] ?? state.selectedBonusStudentUids).includes(uid),
            ).length
          : 0;
      const selected =
        state.bonusStudentSelectionMode === "shared"
          ? state.selectedBonusStudentUids.includes(uid)
          : selectedItemCount === eventBonusItemUids.length;
      const indeterminate =
        state.bonusStudentSelectionMode === "perItem" &&
        selectedItemCount > 0 &&
        selectedItemCount < eventBonusItemUids.length;
      return {
        uid,
        name,
        grayscale: !selected,
        checked: selected,
        indeterminate,
        selectionStyle: "ring" as const,
        label: recruitedStudentUids.includes(uid) ? <span className="text-white font-normal">모집</span> : undefined,
      };
    });
  }, [
    eventBonusStudents,
    eventBonusItemUids,
    recruitedStudentUids,
    state.bonusStudentSelectionMode,
    state.selectedBonusStudentUids,
    state.selectedBonusStudentUidsByItem,
  ]);

  const handleApplyRecruitedStudents = () => {
    const nextSharedStudentUids = [...new Set([...state.selectedBonusStudentUids, ...recruitedStudentUids])];
    actions.setBonusStudents(nextSharedStudentUids);

    if (state.bonusStudentSelectionMode === "perItem") {
      for (const studentUid of recruitedStudentUids) {
        actions.setBonusStudentForItems(eventBonusItemUids, studentUid, true);
      }
    }
  };

  const handleToggleBonusStudent = (studentUid: string) => {
    if (state.bonusStudentSelectionMode === "shared") {
      actions.toggleBonusStudent(studentUid);
      return;
    }

    const selectedForAllItems = eventBonusItemUids.every((itemUid) =>
      (state.selectedBonusStudentUidsByItem[itemUid] ?? state.selectedBonusStudentUids).includes(studentUid),
    );
    actions.setBonusStudentForItems(eventBonusItemUids, studentUid, !selectedForAllItems);

    const nextSharedStudentUids = selectedForAllItems
      ? state.selectedBonusStudentUids.filter((uid) => uid !== studentUid)
      : [...new Set([...state.selectedBonusStudentUids, studentUid])];
    actions.setBonusStudents(nextSharedStudentUids);
  };

  const handleSelectionModeChange = (mode: "shared" | "perItem") => {
    actions.setBonusStudentSelectionMode(mode, eventBonusItemUids);
  };

  const handleSelectAll = () => {
    const allStudentUids = eventBonusStudents.map(({ uid }) => uid);
    actions.setBonusStudents(allStudentUids);
    if (state.bonusStudentSelectionMode === "perItem") {
      actions.setBonusStudentsForItems(eventBonusItemUids, allStudentUids);
    }
  };

  const handleResetAll = () => {
    actions.setBonusStudents([]);
    if (state.bonusStudentSelectionMode === "perItem") {
      actions.setBonusStudentsForItems(eventBonusItemUids, []);
    }
  };

  const [tab, setTab] = useState<"student" | "item">("student");

  if (eventBonusStudents.length === 0) {
    return null;
  }

  return (
    <Section
      title="학생 보너스"
      description={
        recruitedStudentUids.length === 0
          ? "로그인 후 모집한 학생 정보를 등록하면 편리하게 이용할 수 있어요"
          : "보너스 계산에 사용할 학생을 선택하세요"
      }
      collapsible
      persistenceKey="event-shop-section::student-bonus-selector"
      defaultExpanded={true}
    >
      <Tabs
        tabs={[
          { tabId: "student", name: "학생별" },
          { tabId: "item", name: "아이템별" },
        ]}
        activeTabId={tab}
        setActiveTabId={(value) => setTab(value as "student" | "item")}
      />
      {tab === "student" && (
        <>
          {state.bonusStudentSelectionMode === "perItem" && (
            <p className="my-3 rounded-md bg-muted p-3 text-sm text-muted-foreground">
              아이템별 선택을 사용 중이에요. 여기서 학생을 선택하면 모든 아이템에 함께 반영돼요.
            </p>
          )}
          <StudentCards
            mobileGrid={8}
            pcGrid={12}
            namePlacement="overlay"
            hideNameOnMobile
            students={studentCardsData}
            onSelect={handleToggleBonusStudent}
          />
          <div className="my-4 grid w-full grid-cols-2 gap-3 rounded-md bg-card p-3 md:grid-cols-3 md:gap-4">
            {bonusSummary.map(({ uid, appliedStrikerRatio, appliedSpecialRatio, maxStrikerRatio, maxSpecialRatio }) => {
              return (
                <div key={uid} className="flex flex-row items-center gap-2 text-sm text-foreground">
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
          <div className="my-4 max-w-md space-y-2">
            <FilterButtons
              exclusive
              atLeastOne
              size="sm"
              className="my-0"
              buttonProps={[
                {
                  text: "아이템 공통 선택",
                  active: state.bonusStudentSelectionMode === "shared",
                  onToggle: (active) => active && handleSelectionModeChange("shared"),
                },
                {
                  text: "아이템마다 개별 선택",
                  active: state.bonusStudentSelectionMode === "perItem",
                  onToggle: (active) => active && handleSelectionModeChange("perItem"),
                },
              ]}
            />
          </div>
          <div className="mt-6 space-y-6">
            {eventRewardBonus
              .filter(({ rewardBonuses }) => rewardBonuses.length > 0)
              .map(({ uid, name, rewardBonuses }) => {
                const appliedItemBonus = bonusSummary.find(({ uid: appliedUid }) => appliedUid === uid);
                const appliedRatio =
                  appliedItemBonus?.appliedStrikerRatio.plus(appliedItemBonus?.appliedSpecialRatio) ?? new Decimal(0);
                const maxRatio =
                  appliedItemBonus?.maxStrikerRatio.plus(appliedItemBonus?.maxSpecialRatio) ?? new Decimal(0);
                return (
                  <EventItemBonus
                    key={uid}
                    itemUid={uid}
                    itemName={name}
                    appliedRatio={appliedRatio}
                    maxRatio={maxRatio}
                    rewardBonuses={rewardBonuses}
                    selectedBonusStudentUids={selectedStudentUidsByItem?.[uid] ?? state.selectedBonusStudentUids}
                    setSelectedBonusStudentUid={
                      state.bonusStudentSelectionMode === "perItem"
                        ? (studentUid) => actions.toggleBonusStudentForItem(uid, studentUid)
                        : actions.toggleBonusStudent
                    }
                    signedIn={signedIn}
                  />
                );
              })}
          </div>
        </>
      )}

      <div className="my-4 flex justify-end gap-2">
        <Button
          text="모집한 학생 반영"
          disabled={!signedIn || recruitedStudentUids.length === 0}
          onClick={handleApplyRecruitedStudents}
        />
        <Button text="모두 선택" variant="primary" onClick={handleSelectAll} />
        <Button text="초기화" onClick={handleResetAll} />
      </div>
    </Section>
  );
});
