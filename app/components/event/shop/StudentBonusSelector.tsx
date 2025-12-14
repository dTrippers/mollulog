import { useMemo, useState, useEffect, memo } from "react";
import type { Dispatch, SetStateAction } from "react";
import Decimal from "decimal.js";
import { ResourceTypeEnum } from "~/graphql/graphql";
import { ResourceCard } from "~/components/atoms/item";
import { Button, Toggle } from "~/components/atoms/form";
import { StudentCards } from "~/components/students";
import EventItemBonus from "../EventItemBonus";
import { Tabs } from "./Tabs";
import type { EventRewardBonus } from "./types";
import { Section } from "~/components/ui";

type StudentBonusSelectorProps = {
  eventRewardBonus: EventRewardBonus[];
  recruitedStudentUids: string[];
  selectedBonusStudentUids: string[];
  setSelectedBonusStudentUids: Dispatch<SetStateAction<string[]>>;
  setAppliedBonusRatio: (updater: (prev: Record<string, Decimal>) => Record<string, Decimal>) => void;
  includeRecruitedStudents: boolean;
  setIncludeRecruitedStudents: (value: boolean) => void;
  signedIn: boolean;
};

export const StudentBonusSelector = memo(function StudentBonusSelector({
  eventRewardBonus, recruitedStudentUids, selectedBonusStudentUids, setSelectedBonusStudentUids, setAppliedBonusRatio,
  includeRecruitedStudents, setIncludeRecruitedStudents, signedIn,
}: StudentBonusSelectorProps) {
  const eventBonusStudentUids = useMemo(() => {
    return [...new Set(eventRewardBonus.flatMap(({ rewardBonuses }) => rewardBonuses.map(({ student }) => student.uid)))];
  }, [eventRewardBonus]);

  const handleSelectBonusStudent = (studentUid: string) => {
    setSelectedBonusStudentUids((prev) => {
      if (prev.includes(studentUid)) {
        return prev.filter((uid) => uid !== studentUid);
      }
      return [...prev, studentUid];
    });
  };

  const appliedEventRewardBonus = useMemo(() => {
    return eventRewardBonus.map(({ uid, rewardBonuses }) => {
      let appliedStrikerRatio = new Decimal(0), appliedStrikerCount = 0, maxStrikerRatio = new Decimal(0), maxStrikerCount = 0;
      let appliedSpecialRatio = new Decimal(0), appliedSpecialCount = 0, maxSpecialRatio = new Decimal(0), maxSpecialCount = 0;
      const sortedRewardBonuses = [...rewardBonuses].sort((a, b) => Number(b.ratio) - Number(a.ratio));
      if (sortedRewardBonuses.length === 0 || Number(sortedRewardBonuses[0].ratio) === 0) {
        return null;
      }

      sortedRewardBonuses.forEach(({ student, ratio }) => {
        const selected = selectedBonusStudentUids.includes(student.uid);
        if (student.role === "striker") {
          if (maxStrikerCount < 4) {
            maxStrikerRatio = maxStrikerRatio.plus(ratio);
            maxStrikerCount += 1;
          }
          if (selected && appliedStrikerCount < 4) {
            appliedStrikerRatio = appliedStrikerRatio.plus(ratio);
            appliedStrikerCount += 1;
          }
        } else if (student.role === "special") {
          if (maxSpecialCount < 2) {
            maxSpecialRatio = maxSpecialRatio.plus(ratio);
            maxSpecialCount += 1;
          }
          if (selected && appliedSpecialCount < 2) {
            appliedSpecialRatio = appliedSpecialRatio.plus(ratio);
            appliedSpecialCount += 1;
          }
        }

        if (appliedStrikerCount === 4 && appliedSpecialCount === 2) {
          return;
        }
      });

      return { uid, appliedStrikerRatio, appliedSpecialRatio, maxStrikerRatio, maxSpecialRatio }
    }).filter((bonus) => bonus !== null);
  }, [eventRewardBonus, selectedBonusStudentUids]);

  // Update applied bonus ratio state when calculated values change
  useEffect(() => {
    const bonusRatios: Record<string, Decimal> = {};
    appliedEventRewardBonus.forEach(({ uid, appliedStrikerRatio, appliedSpecialRatio }) => {
      bonusRatios[uid] = appliedStrikerRatio.plus(appliedSpecialRatio);
    });
    
    setAppliedBonusRatio((prev) => {
      const hasChanges = Object.keys(bonusRatios).some(
        (uid) => !prev[uid] || !prev[uid].eq(bonusRatios[uid])
      );
      return hasChanges ? { ...prev, ...bonusRatios } : prev;
    });
  }, [appliedEventRewardBonus, setAppliedBonusRatio]);

  const studentCardsData = useMemo(() => {
    return eventBonusStudentUids.map((uid) => {
      const selected = selectedBonusStudentUids.includes(uid);
      return {
        uid,
        grayscale: !selected,
        checked: selected,
        label: recruitedStudentUids.includes(uid) ? <span className="text-white font-normal">모집</span> : undefined,
      };
    });
  }, [eventBonusStudentUids, selectedBonusStudentUids, recruitedStudentUids]);

  const handleToggleRecruitedStudents = (value: boolean) => {
    setIncludeRecruitedStudents(value);
    if (value) {
      setSelectedBonusStudentUids((prev) => [...new Set([...prev, ...recruitedStudentUids])]);
    } else {
      setSelectedBonusStudentUids((prev) => prev.filter((uid) => !recruitedStudentUids.includes(uid)));
    }
  };

  const handleSelectAll = () => {
    setSelectedBonusStudentUids(eventBonusStudentUids);
  };

  const handleResetAll = () => {
    setSelectedBonusStudentUids(includeRecruitedStudents ? recruitedStudentUids : []);
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
        initialState={signedIn ? includeRecruitedStudents : false}
        onChange={handleToggleRecruitedStudents}
      />

      <Tabs
        tabs={[{ tabId: "student", name: "학생별" }, { tabId: "item", name: "아이템별" }]}
        activeTabId={tab}
        setActiveTabId={(value) => setTab(value as "student" | "item")}
      />
      {tab === "student" && (
        <>
          <StudentCards mobileGrid={8} pcGrid={12} students={studentCardsData} onSelect={handleSelectBonusStudent} />
          <div className="my-4 p-3 w-full border border-neutral-200 dark:border-neutral-700 rounded-lg grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            {appliedEventRewardBonus.map(({ uid, appliedStrikerRatio, appliedSpecialRatio, maxStrikerRatio, maxSpecialRatio }) => {
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
            const appliedItemBonus = appliedEventRewardBonus.find(({ uid: appliedUid }) => appliedUid === uid);
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
                selectedBonusStudentUids={selectedBonusStudentUids}
                setSelectedBonusStudentUid={handleSelectBonusStudent}
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

