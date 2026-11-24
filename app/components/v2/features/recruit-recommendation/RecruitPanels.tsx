import type { ReactNode } from "react";
import { RECRUIT_GOALS, type RecruitGoal, recruitGoalLabels } from "~/domain/recruit-recommendation";
import { SegmentedChoice } from "../pyroxene/PickupBasis";

// The goal, chosen in the Aside panel and in the stacked plan sheet. Nothing is selected until the Sensei picks one.
export function RecruitGoalChoice({
  value,
  onChange,
}: {
  value: RecruitGoal | null;
  onChange: (goal: RecruitGoal) => void;
}) {
  return (
    <SegmentedChoice
      label="목표"
      options={RECRUIT_GOALS.map((goal) => ({ value: goal, label: recruitGoalLabels[goal] }))}
      value={value}
      onChange={onChange}
    />
  );
}

type CriteriaItem = { term?: string; text: string; details?: string[] };

const criteria: { title: string; items: CriteriaItem[] }[] = [
  {
    title: "판정",
    items: [
      {
        term: "범용",
        text: "여러 보스에서 채용률이 높은 학생. ‘최상위권’ 목표에서는 최우선, ‘플래티넘’ 목표에서는 우선, 한 단계 아래는 여유 시",
      },
      { term: "특정 보스 특화", text: "한 보스에서만 채용률이 높은 학생" },
      { term: "특정 보스 기용", text: "채용률이 높은 보스는 없지만 일부 보스에서 중간 수준으로 쓰이는 학생" },
      {
        term: "커뮤니티 평가로 범용",
        text: "채용률이 높은 보스가 없거나, 한 보스뿐이면서 한국 출시 뒤 예정된 총력전·대결전이 적은 학생은 여러 출처에서 높게 평가하면 범용",
      },
    ],
  },
  {
    title: "AI 추천",
    items: [
      { text: "최우선·우선 학생" },
      { text: "특정 보스 특화 중 픽업 시작 후 해당 보스의 총력전·대결전이 예정된 학생" },
    ],
  },
  {
    title: "채용률",
    items: [
      { text: "선택한 목표 구간 선생님 중 그 보스에서 이 학생을 편성한 비율" },
      { term: "‘최상위권’ 목표", text: "1~1,000위" },
      {
        term: "‘플래티넘’·‘뉴비’ 목표",
        text: "시즌·방어 타입별 상위 20,000명 중 토먼트 클리어 구간",
        details: [
          "루나틱이 3,000위를 넘으면 3,000위 이하 루나틱도 포함",
          "토먼트 아래 인세인은 제외",
          "토먼트 클리어가 없으면 상위 20,000명 중 최고 난이도 클리어 전체",
        ],
      },
      { term: "이번 일정", text: "다가오는 한국 일정과 같은 보스의 일본 시즌" },
      { term: "과거 시즌", text: "그 밖의 보스별 표본이 충분한 최근 시즌" },
    ],
  },
  {
    title: "육성 수준",
    items: [
      { text: "이번 일정에 해당하는 시즌 전체에서 이 학생을 직접 편성한(조력 제외) 기록을 성급별로 합산한 값" },
      { term: "집계 대상", text: "채용률과 같은 목표 구간" },
      { text: "같은 선생님이 여러 시즌에 들어갈 수 있어 사람 수가 아니라 편성 기록 수" },
      { text: "타일은 가장 많은 성급과 그 비율. 편성 기록이 적으면 표본 부족" },
    ],
  },
];

// How a recommendation is made: the rules, what the values count, the sources, and how often they refresh.
export function RecruitCriteria() {
  return (
    <div className="flex flex-col gap-3.5 break-keep">
      {criteria.map((section) => (
        <CriteriaSection key={section.title} title={section.title}>
          {section.items.map((item) => (
            <li key={item.term ?? item.text} className="my-0.5">
              {item.term ? (
                <>
                  <b className="font-semibold text-v2-fg">{item.term}</b>
                  {": "}
                </>
              ) : null}
              {item.text}
              {item.details ? (
                <ul className="mt-0.5 list-[circle] pl-4">
                  {item.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </CriteriaSection>
      ))}
    </div>
  );
}

function CriteriaSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="text-xs font-semibold text-v2-fg-tertiary">{title}</h3>
      <ul className="mt-1 list-disc pl-4 text-[0.8125rem] leading-normal text-v2-fg-secondary">{children}</ul>
    </section>
  );
}
