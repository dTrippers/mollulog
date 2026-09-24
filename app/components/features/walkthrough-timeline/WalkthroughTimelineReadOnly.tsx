import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { StudentCard } from "~/components/features/students";
import type { WalkthroughParty } from "~/domain/walkthrough-timeline";
import WalkthroughStartingSkillSequence from "./WalkthroughStartingSkillSequence";
import { TimelineActionSequence, TimelineStudentImage, type TimelineViewerStudent } from "./WalkthroughTimelineViewer";
import { getWalkthroughEquipmentLabel } from "./walkthrough-equipment-label";

type GrowthSnapshot = WalkthroughParty["units"][number]["snapshot"];

function hasGrowthData(snapshot: GrowthSnapshot) {
  return Object.values(snapshot ?? {}).some((value) => value !== undefined);
}

function growthValue(value: number | undefined) {
  return value === undefined ? "미입력" : String(value);
}

function growthValues(snapshot: GrowthSnapshot, equipments: string[] | undefined) {
  return {
    tier: snapshot?.tier,
    level: growthValue(snapshot?.level),
    skills: [
      ["EX", growthValue(snapshot?.skillEx)],
      ["기본", growthValue(snapshot?.skillNormal)],
      ["강화", growthValue(snapshot?.skillEnhanced)],
      ["서브", growthValue(snapshot?.skillSub)],
    ] as const,
    equipment: [
      [getWalkthroughEquipmentLabel(equipments, 0), growthValue(snapshot?.equip1)],
      [getWalkthroughEquipmentLabel(equipments, 1), growthValue(snapshot?.equip2)],
      [getWalkthroughEquipmentLabel(equipments, 2), growthValue(snapshot?.equip3)],
    ] as const,
    abilities: [
      ["체력", growthValue(snapshot?.abilityHp)],
      ["공격", growthValue(snapshot?.abilityAtk)],
      ["치유", growthValue(snapshot?.abilityHeal)],
    ] as const,
    abilitiesNotApplicable: snapshot?.tier !== undefined && snapshot.tier <= 5,
  };
}

function GrowthTier({ tier }: { tier: number }) {
  if (tier <= 5) return <span>★{tier}</span>;

  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`전용무기 ${tier - 5}`}>
      <img className="size-3.5 shrink-0" src="/icons/exclusive_weapon.png" alt="" aria-hidden="true" />
      <span>{tier - 5}</span>
    </span>
  );
}

function GrowthGroup({
  values,
  notApplicable = false,
  compact = false,
  wrapValues = false,
  summarizeCommonState = false,
}: {
  values: readonly (readonly [string, string])[];
  notApplicable?: boolean;
  compact?: boolean;
  wrapValues?: boolean;
  summarizeCommonState?: boolean;
}) {
  const displayedValues = values.map(([label, value]) => [label, notApplicable ? "미적용" : value] as const);
  const commonState = displayedValues[0]?.[1];
  if (
    summarizeCommonState &&
    (commonState === "미입력" || commonState === "미적용") &&
    displayedValues.every(([, value]) => value === commonState)
  ) {
    return <span className="text-muted-foreground">{commonState}</span>;
  }

  return (
    <div
      className={
        compact
          ? "flex flex-wrap gap-x-3 gap-y-1"
          : wrapValues
            ? "flex flex-wrap gap-x-1 gap-y-1"
            : "grid grid-cols-2 gap-x-2 gap-y-1 sm:grid-cols-4"
      }
    >
      {displayedValues.map(([label, value]) => (
        <span
          key={label}
          className={`min-w-0 ${compact ? "whitespace-normal break-words" : wrapValues ? "shrink-0 whitespace-nowrap" : "truncate"}`}
        >
          <span className="text-muted-foreground">{label}</span> {value}
        </span>
      ))}
    </div>
  );
}

function GrowthTable({
  party,
  studentsByUid,
}: {
  party: WalkthroughParty;
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
  const units = [...party.units]
    .filter((unit): unit is typeof unit & { studentUid: string } => Boolean(unit.studentUid))
    .sort((left, right) => left.slot - right.slot);

  if (units.length === 0) {
    return <p className="text-sm text-muted-foreground">성장도를 입력한 학생이 없어요.</p>;
  }

  const scrollHintId = `${party.uid}-growth-table-scroll-hint`;

  return (
    <div className="@container min-w-0 md:-mx-3">
      <div className="hidden space-y-2 md:block">
        <p id={scrollHintId} className="sr-only">
          표가 화면 너비보다 넓으면 좌우로 스크롤해 모든 성장도 항목을 확인하세요.
        </p>
        <section
          className="overflow-x-auto rounded-md bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="학생별 성장도 표"
          aria-describedby={scrollHintId}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to focus and scroll this overflow region.
          tabIndex={0}
        >
          <table className="w-full min-w-[44rem] table-fixed border-collapse text-sm">
            <caption className="sr-only">학생별 성장도</caption>
            <colgroup>
              <col className="w-28" />
              <col className="w-12" />
              <col className="w-12" />
              <col className="w-45" />
              <col className="w-43" />
              <col className="w-36" />
            </colgroup>
            <thead className="bg-muted/70 text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-20 bg-muted pl-3 pr-1 py-1.5 text-left font-semibold text-foreground after:absolute after:inset-y-0 after:-right-1 after:w-1 after:border-r after:border-border after:bg-muted after:content-['']"
                >
                  학생
                </th>
                <th scope="col" className="px-1 py-1.5 text-center font-semibold">
                  성급
                </th>
                <th scope="col" className="px-1 py-1.5 text-center font-semibold">
                  Lv
                </th>
                <th scope="col" className="border-l border-border px-1 py-1.5 text-left font-semibold">
                  스킬
                </th>
                <th scope="col" className="border-l border-border px-1 py-1.5 text-left font-semibold">
                  장비
                </th>
                <th scope="col" className="border-l border-border py-1.5 pl-1 pr-3 text-left font-semibold">
                  능력 해방
                </th>
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => {
                const student = studentsByUid[unit.studentUid];
                const growth = growthValues(unit.snapshot, student?.equipments);
                return (
                  <tr key={`${party.uid}-${unit.slot}-growth`} className="border-b border-border last:border-b-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-card pl-3 pr-1 py-1.5 text-left font-medium after:absolute after:inset-y-0 after:-right-1 after:w-1 after:border-r after:border-border after:bg-card after:content-['']"
                    >
                      <span className="break-words">{student?.name ?? "학생 정보 없음"}</span>
                      {!hasGrowthData(unit.snapshot) ? (
                        <span className="mt-1 block break-words text-xs font-normal text-muted-foreground">
                          성장도 미입력
                        </span>
                      ) : null}
                    </th>
                    <td className="px-1 py-1.5 text-center text-xs">
                      {growth.tier === undefined ? "미입력" : <GrowthTier tier={growth.tier} />}
                    </td>
                    <td className="px-1 py-1.5 text-center text-xs tabular-nums">{growth.level}</td>
                    <td className="border-l border-border px-1 py-1.5 text-xs">
                      <GrowthGroup values={growth.skills} wrapValues />
                    </td>
                    <td className="border-l border-border px-1 py-1.5 text-xs">
                      <GrowthGroup values={growth.equipment} wrapValues />
                    </td>
                    <td className="border-l border-border py-1.5 pl-1 pr-3 text-xs">
                      <GrowthGroup
                        values={growth.abilities}
                        notApplicable={growth.abilitiesNotApplicable}
                        wrapValues
                        summarizeCommonState
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <p className="hidden px-5 text-xs text-muted-foreground md:block md:px-3 @min-[704px]:hidden">
          표의 나머지 정보를 보려면 좌우로 스크롤하세요.
        </p>
      </div>

      <ul className="space-y-3 md:hidden" aria-label="학생별 성장도">
        {units.map((unit) => {
          const student = studentsByUid[unit.studentUid];
          const growth = growthValues(unit.snapshot, student?.equipments);
          return (
            <li key={`${party.uid}-${unit.slot}-growth-mobile`} className="rounded-md bg-muted/40 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                {student ? (
                  <TimelineStudentImage uid={unit.studentUid} name={student.name} className="size-9 shrink-0" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{student?.name ?? "학생 정보 없음"}</p>
                  {!hasGrowthData(unit.snapshot) ? (
                    <p className="text-xs text-muted-foreground">성장도 미입력</p>
                  ) : null}
                </div>
                <dl className="flex shrink-0 items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <dt className="text-muted-foreground">성급</dt>
                    <dd>{growth.tier === undefined ? "미입력" : <GrowthTier tier={growth.tier} />}</dd>
                  </div>
                  <div className="flex items-center gap-1">
                    <dt className="text-muted-foreground">Lv</dt>
                    <dd className="tabular-nums">{growth.level}</dd>
                  </div>
                </dl>
              </div>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex min-w-0 items-baseline gap-2">
                  <dt className="w-14 shrink-0 text-muted-foreground">스킬</dt>
                  <dd className="min-w-0 flex-1">
                    <GrowthGroup values={growth.skills} compact />
                  </dd>
                </div>
                <div className="flex min-w-0 items-baseline gap-2">
                  <dt className="w-14 shrink-0 text-muted-foreground">장비</dt>
                  <dd className="min-w-0 flex-1">
                    <GrowthGroup values={growth.equipment} compact />
                  </dd>
                </div>
                <div className="flex min-w-0 items-baseline gap-2">
                  <dt className="w-14 shrink-0 text-muted-foreground">능력 해방</dt>
                  <dd className="min-w-0 flex-1">
                    <GrowthGroup
                      values={growth.abilities}
                      notApplicable={growth.abilitiesNotApplicable}
                      compact
                      summarizeCommonState
                    />
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FormationStudent({
  roleLabel,
  roleIndex,
  studentUid,
  tier,
  studentsByUid,
}: {
  roleLabel: string;
  roleIndex: number;
  studentUid: string | null;
  tier?: number;
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
  const student = studentUid ? studentsByUid[studentUid] : undefined;
  const studentName = student?.name ?? "학생 정보 없음";

  return (
    <li className="relative min-w-0">
      {studentUid && student ? (
        <StudentCard
          uid={studentUid}
          name={student.name}
          role={roleLabel === "스트라이커" ? "striker" : "special"}
          nameSize="small"
          namePlacement="below"
          tier={tier}
          label={tier === undefined ? "미입력" : undefined}
          flush
        />
      ) : (
        <div
          role="img"
          className="flex min-h-24 items-center justify-center rounded-md bg-muted px-1 text-center text-xs text-muted-foreground"
          aria-label={`${roleLabel} ${roleIndex}: ${studentUid ? studentName : "비어 있음"}`}
        >
          {studentUid ? studentName : "비어 있음"}
        </div>
      )}
    </li>
  );
}

function PartyFormation({
  party,
  partySize,
  studentsByUid,
}: {
  party: WalkthroughParty;
  partySize: 6 | 10;
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
  const strikerCount = partySize === 6 ? 4 : 6;
  const slots = Array.from({ length: partySize }, (_, slot) => slot);
  const unitBySlot = new Map(party.units.map((unit) => [unit.slot, unit]));
  const groups = [
    {
      label: "스트라이커",
      slots: slots.slice(0, strikerCount),
      groupClass: partySize === 6 ? "col-span-4" : "col-span-6",
      gridClass: partySize === 6 ? "grid-cols-4" : "grid-cols-6",
    },
    {
      label: "스페셜",
      slots: slots.slice(strikerCount),
      groupClass:
        partySize === 6 ? "col-start-6 col-span-2" : "col-span-4 @min-[544px]:col-start-8 @min-[544px]:col-span-4",
      gridClass: partySize === 6 ? "grid-cols-2" : "grid-cols-4",
    },
  ];
  // A narrow spacer keeps the two role groups visually distinct without changing slot widths.
  const formationGridClass =
    partySize === 6
      ? "grid-cols-[repeat(4,minmax(0,1fr))_0.25rem_repeat(2,minmax(0,1fr))]"
      : "grid-cols-6 @min-[544px]:grid-cols-[repeat(6,minmax(0,1fr))_0.25rem_repeat(4,minmax(0,1fr))]";
  const formationMaxWidthClass = partySize === 10 ? "sm:max-w-[34rem]" : "sm:max-w-80";

  return (
    <div className={`@container w-full min-w-0 ${formationMaxWidthClass}`}>
      <div className={`grid w-full min-w-0 gap-2 ${formationGridClass}`}>
        {groups.map((group) => (
          <section key={group.label} className={`min-w-0 ${group.groupClass}`} aria-label={`${group.label} 편성`}>
            <ul className={`grid gap-2 ${group.gridClass}`} aria-label={`${group.label} 슬롯`}>
              {group.slots.map((slot) => {
                const unit = unitBySlot.get(slot);
                return (
                  <FormationStudent
                    key={slot}
                    roleLabel={group.label}
                    roleIndex={group.slots.indexOf(slot) + 1}
                    studentUid={unit?.studentUid ?? null}
                    tier={unit?.snapshot?.tier}
                    studentsByUid={studentsByUid}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function StartingSkillOrder({
  party,
  studentsByUid,
}: {
  party: WalkthroughParty;
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
  return (
    <WalkthroughStartingSkillSequence
      partyUid={party.uid}
      studentUids={party.startingSkillStudentUids}
      studentsByUid={studentsByUid}
      label="시작 스킬 순서"
      emptyMessage="지정된 시작 스킬이 없어요."
    />
  );
}

export function WalkthroughTimelineReadOnly({
  parties,
  partySize,
  studentsByUid,
}: {
  parties: WalkthroughParty[];
  partySize: 6 | 10;
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
  const [expandedGrowthParties, setExpandedGrowthParties] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      {[...parties]
        .sort((left, right) => left.order - right.order)
        .map((party, partyIndex) => {
          const growthExpanded = Boolean(expandedGrowthParties[party.uid]);
          const growthDetailsId = `${party.uid}-growth-details`;
          const growthToggleId = `${party.uid}-growth-toggle`;
          const toggleGrowthDetails = () =>
            setExpandedGrowthParties((current) => ({ ...current, [party.uid]: !current[party.uid] }));

          return (
            <section
              key={party.uid}
              className="space-y-5 rounded-lg bg-card p-5 shadow-lg shadow-black/5 dark:shadow-md dark:shadow-black/20 md:p-6"
              aria-labelledby={`walkthrough-party-${party.uid}`}
            >
              <h2 id={`walkthrough-party-${party.uid}`} className="text-base font-semibold">
                파티 {partyIndex + 1}
              </h2>

              <section aria-label={`파티 ${partyIndex + 1} 편성`}>
                <PartyFormation party={party} partySize={partySize} studentsByUid={studentsByUid} />
              </section>

              <div className="space-y-2">
                <button
                  type="button"
                  id={growthToggleId}
                  className="-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  aria-expanded={growthExpanded}
                  aria-controls={growthDetailsId}
                  onClick={toggleGrowthDetails}
                >
                  {growthExpanded ? "상세 성장도 접기" : "성장도 자세히 보기"}
                  <ChevronDownIcon
                    className={`size-4 transition-transform ${growthExpanded ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                <section
                  id={growthDetailsId}
                  aria-label={`파티 ${partyIndex + 1} 상세 성장도`}
                  hidden={!growthExpanded}
                >
                  {growthExpanded ? <GrowthTable party={party} studentsByUid={studentsByUid} /> : null}
                </section>
              </div>

              <section className="space-y-2" aria-labelledby={`${party.uid}-starting-skills-heading`}>
                <h3 id={`${party.uid}-starting-skills-heading`} className="text-sm font-semibold text-muted-foreground">
                  시작 스킬 순서
                </h3>
                <StartingSkillOrder party={party} studentsByUid={studentsByUid} />
              </section>

              <section className="space-y-2" aria-labelledby={`${party.uid}-steps-heading`}>
                <h3 id={`${party.uid}-steps-heading`} className="text-sm font-semibold text-muted-foreground">
                  타임라인
                </h3>
                {party.steps.length > 0 ? (
                  <ol className="list-none space-y-1.5" aria-label={`파티 ${partyIndex + 1} 타임라인`}>
                    {[...party.steps]
                      .sort((left, right) => left.order - right.order)
                      .map((step) => (
                        <li
                          key={step.uid}
                          className={step.kind === "divider" ? "py-1" : "overflow-hidden rounded-md bg-background"}
                        >
                          {step.kind === "divider" ? (
                            <div className="flex items-center gap-2 px-3 py-3 text-xs font-semibold text-muted-foreground">
                              <span className="h-px flex-1 bg-border" />
                              <span className="max-w-64 truncate">{step.note || "설명글"}</span>
                              <span className="h-px flex-1 bg-border" />
                            </div>
                          ) : (
                            <div className="grid gap-2 px-3 py-3 md:grid-cols-[7rem_minmax(0,1fr)_minmax(11rem,0.35fr)] md:items-center md:gap-3">
                              <span className="truncate text-sm font-semibold text-primary tabular-nums">
                                {step.marker?.value || "시점 없음"}
                              </span>
                              <div className="min-w-0">
                                <TimelineActionSequence actions={step.actions} studentsByUid={studentsByUid} />
                              </div>
                              {step.note?.trim() ? (
                                <span className="truncate text-xs text-muted-foreground">{step.note}</span>
                              ) : null}
                            </div>
                          )}
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">등록된 단계가 없어요.</p>
                )}
              </section>
            </section>
          );
        })}
    </div>
  );
}
