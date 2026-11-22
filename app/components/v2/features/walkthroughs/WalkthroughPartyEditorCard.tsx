import { ClockIcon, PlusIcon, TrashIcon } from "@heroicons/react/16/solid";
import { useState } from "react";
import {
  toggleStartingSkillStudentUid,
  walkthroughStartingSkillLimit,
  walkthroughStrikerSlotCount,
  type WalkthroughParty,
  type WalkthroughTimelineDocument,
} from "~/domain/walkthrough-timeline";
import { walkthroughPartyLabel } from "~/domain/walkthrough-mentions";
import { Button } from "../../primitives/Button";
import { IconButton } from "../../primitives/IconButton";
import { PartyGrowthTable, PartySlots, type RaidPartyEditorContext } from "../raid-records/RaidPartyEditor";
import {
  type WalkthroughPartyBaselines,
  walkthroughPartySlots,
  walkthroughUnitsFromSlots,
} from "./walkthrough-editor-state";
import { StartingSkillBadge, TierBandLabel, tierMeaning, WalkthroughPartyThumbs } from "./walkthrough-parts";

const noop = () => {};

// One party on the write page. The slots pick students the way 기록 추가 does. "시작 스킬 설정" turns the portraits
// into toggles that number the starting skills in the order they are tapped, until "완료". "성장도 입력" opens the
// growth table under the slots, filled from 모집한 학생. The timeline opens in its own sheet.
export function WalkthroughPartyEditorCard({
  party,
  partyIndex,
  partySize,
  context,
  baselines,
  focusSearch,
  onSearchFocused,
  onChange,
  onRemove,
  onEditTimeline,
}: {
  party: WalkthroughParty;
  partyIndex: number;
  partySize: WalkthroughTimelineDocument["partySize"];
  context: RaidPartyEditorContext;
  baselines: WalkthroughPartyBaselines;
  focusSearch: boolean;
  onSearchFocused: () => void;
  // The baselines are the 모집한 학생 values of the students the slots were filled with in this visit.
  onChange: (party: WalkthroughParty, baselines?: WalkthroughPartyBaselines) => void;
  onRemove: () => void;
  onEditTimeline: () => void;
}) {
  const [startingSkillMode, setStartingSkillMode] = useState(false);
  const [growthOpen, setGrowthOpen] = useState(false);
  const title = walkthroughPartyLabel(partyIndex);
  const slots = walkthroughPartySlots(party, partySize, baselines);
  const hasStudent = slots.some((unit) => unit !== null);
  const startingSkillLimit = walkthroughStartingSkillLimit(partySize);

  const changeSlots = (next: typeof slots) => {
    const { units, baselines: nextBaselines } = walkthroughUnitsFromSlots(next);
    const studentUids = new Set(units.flatMap((unit) => (unit.studentUid ? [unit.studentUid] : [])));
    onChange(
      {
        ...party,
        units,
        // A student taken out of the party leaves the starting skill order too.
        startingSkillStudentUids: party.startingSkillStudentUids.filter((uid) => studentUids.has(uid)),
      },
      nextBaselines,
    );
  };

  const startingOrder = (studentUid: string) => {
    const index = party.startingSkillStudentUids.indexOf(studentUid);
    return index >= 0 ? index + 1 : null;
  };

  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-4 rounded-lg bg-v2-surface p-v2-block-p">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold text-v2-fg">{title}</h3>
        {startingSkillMode ? (
          <>
            <Button
              variant="text"
              size="sm"
              disabled={party.startingSkillStudentUids.length === 0}
              onClick={() => onChange({ ...party, startingSkillStudentUids: [] })}
            >
              초기화
            </Button>
            <Button variant="primary" size="sm" onClick={() => setStartingSkillMode(false)}>
              완료
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" disabled={!hasStudent} onClick={() => setStartingSkillMode(true)}>
              시작 스킬 설정
            </Button>
            <Button
              size="sm"
              disabled={!hasStudent}
              aria-pressed={growthOpen && hasStudent}
              onClick={() => setGrowthOpen((open) => !open)}
            >
              성장도 입력
            </Button>
            <IconButton icon={TrashIcon} label={`${title} 삭제`} danger onClick={onRemove} />
          </>
        )}
      </div>

      {startingSkillMode ? (
        <WalkthroughPartyThumbs
          party={party}
          partySize={partySize}
          studentsByUid={context.studentsByUid}
          label={`${title} 시작 스킬 순서`}
          onSelect={(studentUid) =>
            onChange({
              ...party,
              startingSkillStudentUids: toggleStartingSkillStudentUid(
                party.startingSkillStudentUids,
                studentUid,
                startingSkillLimit,
              ),
            })
          }
        />
      ) : (
        <PartySlots
          party={{ slots }}
          title={title}
          context={context}
          autoFocus={focusSearch}
          onAutoFocused={focusSearch ? onSearchFocused : noop}
          onChange={(next) => changeSlots(next.slots)}
          strikerSlots={walkthroughStrikerSlotCount(partySize)}
          allowAssist={false}
          search="selected"
          showGroupLabels={false}
          dense
          slotScrimLabel={(unit) =>
            unit.snapshot.tier !== undefined ? <TierBandLabel tier={unit.snapshot.tier} /> : undefined
          }
          slotScrimAriaLabel={(unit) =>
            unit.snapshot.tier !== undefined ? tierMeaning(unit.snapshot.tier) : undefined
          }
          slotBadge={(unit) => {
            const order = startingOrder(unit.studentUid);
            return order !== null ? <StartingSkillBadge order={order} /> : null;
          }}
        />
      )}

      {growthOpen && hasStudent && !startingSkillMode ? (
        <PartyGrowthTable
          party={{ slots }}
          title={title}
          studentsByUid={context.studentsByUid}
          onChange={(slot, unit) => changeSlots(slots.map((current, index) => (index === slot ? unit : current)))}
        />
      ) : null}

      {party.steps.length > 0 ? (
        <div className="flex min-w-0 items-center gap-2">
          <ClockIcon className="size-4 text-v2-fg-secondary" aria-hidden="true" />
          <span className="text-sm font-semibold text-v2-fg">타임라인</span>
          <span className="text-sm text-v2-fg-tertiary tabular-nums">{party.steps.length}단계</span>
          <Button size="sm" className="ml-auto" onClick={onEditTimeline}>
            타임라인 편집
          </Button>
        </div>
      ) : (
        <div>
          <Button size="sm" onClick={onEditTimeline}>
            <PlusIcon className="size-3.5" aria-hidden="true" />
            타임라인 추가
          </Button>
        </div>
      )}
    </section>
  );
}
