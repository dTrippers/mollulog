import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import type { WalkthroughParty } from "~/domain/walkthrough-timeline";
import { TimelineActionSequence, TimelineStudentImage, type TimelineViewerStudent } from "./WalkthroughTimelineViewer";

function formatGrowth(snapshot: WalkthroughParty["units"][number]["snapshot"]) {
  if (!snapshot) return ["성장도 미입력"];
  const basic = snapshot.level ? `Lv.${snapshot.level}` : null;
  const skills = [
    snapshot.skillEx ? `EX ${snapshot.skillEx}` : null,
    snapshot.skillNormal ? `기본 ${snapshot.skillNormal}` : null,
    snapshot.skillEnhanced ? `강화 ${snapshot.skillEnhanced}` : null,
    snapshot.skillSub ? `서브 ${snapshot.skillSub}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const equipment = [snapshot.equip1, snapshot.equip2, snapshot.equip3].some(Boolean)
    ? `장비 ${snapshot.equip1 ?? "-"}/${snapshot.equip2 ?? "-"}/${snapshot.equip3 ?? "-"}`
    : null;
  const abilities = [
    snapshot.abilityHp ? `체력 ${snapshot.abilityHp}` : null,
    snapshot.abilityAtk ? `공격 ${snapshot.abilityAtk}` : null,
    snapshot.abilityHeal ? `치유 ${snapshot.abilityHeal}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [basic, skills, equipment, abilities ? `능력 해방 ${abilities}` : null].filter(Boolean);
}

function GrowthTier({ tier }: { tier: number }) {
  if (tier <= 5) return <span>★{tier}</span>;

  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`전용무기 ${tier - 5}`}>
      <img className="size-3.5 shrink-0" src="/icons/exclusive_weapon.png" alt="" aria-hidden="true" />
      <span>{tier - 5}</span>
    </span>
  );
}

function GrowthSummary({ snapshot }: { snapshot: WalkthroughParty["units"][number]["snapshot"] }) {
  const details = formatGrowth(snapshot);

  return (
    <>
      {snapshot?.tier ? (
        <>
          <GrowthTier tier={snapshot.tier} />
          {details.length > 0 ? " · " : null}
        </>
      ) : null}
      {details.join(" · ")}
    </>
  );
}

export function WalkthroughTimelineReadOnly({
  parties,
  studentsByUid,
}: {
  parties: WalkthroughParty[];
  studentsByUid: Record<string, TimelineViewerStudent>;
}) {
  const [expandedParties, setExpandedParties] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-6">
      {[...parties]
        .sort((left, right) => left.order - right.order)
        .map((party, partyIndex) => (
          <section key={party.uid} className="space-y-3" aria-labelledby={`walkthrough-party-${party.uid}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`walkthrough-party-${party.uid}`} className="text-sm font-semibold">
                파티 {partyIndex + 1}
              </h3>
              {party.units.some((unit) => unit.studentUid) ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <div className="flex -space-x-1.5" role="img" aria-label={`파티 ${partyIndex + 1} 편성 학생`}>
                    {[...party.units]
                      .sort((left, right) => left.slot - right.slot)
                      .filter((unit): unit is typeof unit & { studentUid: string } => Boolean(unit.studentUid))
                      .map((unit) => (
                        <TimelineStudentImage
                          key={`${party.uid}-${unit.slot}`}
                          uid={unit.studentUid}
                          name={studentsByUid[unit.studentUid]?.name ?? "학생"}
                          className="size-8 border-2 border-card"
                        />
                      ))}
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-expanded={Boolean(expandedParties[party.uid])}
                    onClick={() => setExpandedParties((current) => ({ ...current, [party.uid]: !current[party.uid] }))}
                  >
                    {expandedParties[party.uid] ? "상세 성장도 접기" : "상세 성장도 보기"}
                    <ChevronDownIcon
                      className={`size-3.5 transition-transform ${expandedParties[party.uid] ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              ) : null}
            </div>

            {expandedParties[party.uid] ? (
              <div className="overflow-hidden rounded-md border border-border bg-background">
                {[...party.units]
                  .sort((left, right) => left.slot - right.slot)
                  .filter((unit): unit is typeof unit & { studentUid: string } => Boolean(unit.studentUid))
                  .map((unit) => (
                    <div
                      key={`${party.uid}-${unit.slot}-growth`}
                      className="flex min-w-0 items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                    >
                      <TimelineStudentImage
                        uid={unit.studentUid}
                        name={studentsByUid[unit.studentUid]?.name ?? "학생"}
                        className="size-10 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <p className="font-medium">{studentsByUid[unit.studentUid]?.name ?? "학생 정보 없음"}</p>
                          {party.startingSkillStudentUids.includes(unit.studentUid) ? (
                            <span className="text-xs font-medium text-primary">시작 스킬</span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          <GrowthSummary snapshot={unit.snapshot} />
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            ) : null}

            {party.steps.length > 0 ? (
              <ol className="mt-3 list-none space-y-1.5" aria-label={`파티 ${partyIndex + 1} 타임라인`}>
                {[...party.steps]
                  .sort((left, right) => left.order - right.order)
                  .map((step) => (
                    <li key={step.uid} className="overflow-hidden rounded-md border border-border bg-background">
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
              <p className="mt-3 text-sm text-muted-foreground">등록된 단계가 없어요.</p>
            )}
          </section>
        ))}
    </div>
  );
}
