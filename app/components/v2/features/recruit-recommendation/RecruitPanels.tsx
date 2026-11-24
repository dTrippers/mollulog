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

type CriteriaItem = { term?: string; text: string };

const criteria: { title: string; items: CriteriaItem[] }[] = [
  {
    title: "판정",
    items: [
      {
        term: "범용",
        text: "채용률 70% 이상인 보스가 2곳 이상. 최상위권은 최우선, 플래티넘은 우선, 한 단계 아래는 여유 시",
      },
      {
        term: "특정 보스 특화",
        text: "한 보스에서만 채용률 70% 이상. 70% 이상 없이 30~70%만 있으면 특정 보스 기용",
      },
      {
        term: "커뮤니티 평가로 범용",
        text: "채용률 70% 이상인 보스가 없는 학생, 또는 1곳뿐이고 다가오는 한국 총력전·대결전 중 한국 출시 뒤에 열리는 것이 2번 이하인 학생은 커뮤니티 출처 2곳 이상이 높게 평가하면 범용",
      },
    ],
  },
  {
    title: "AI 추천",
    items: [{ text: "최우선·우선 학생과, 픽업 시작 후 그 보스의 총력전·대결전이 있는 특정 보스 특화 학생" }],
  },
  {
    title: "일본 서버 채용률",
    items: [
      { text: "목표 구간 선생님 중 그 보스에서 이 학생을 편성한 비율" },
      { term: "최상위권", text: "1~1,000위" },
      {
        term: "플래티넘·뉴비",
        text: "총력전은 토먼트 점수 구간, 대결전은 토먼트와 인세인 점수 구간 중 채용률이 높은 쪽. 과거 시즌의 대결전은 상위 20,000명 전체",
      },
      { term: "이번 일정", text: "다가오는 한국 일정과 같은 보스의 일본 시즌" },
      { term: "과거 시즌", text: "그 밖의 보스별 최근 시즌 (표본 1,000명 이상)" },
    ],
  },
  {
    title: "육성 수준",
    items: [
      {
        text: "이번 일정의 일본 시즌마다, 최상위권은 1~1,000위, 플래티넘·뉴비는 3,001위 이하 선생님이 이 학생을 직접 편성한(조력 제외) 기록을 성급별로 세어 더한 값",
      },
      { text: "같은 선생님이 여러 시즌에 들어갈 수 있어 사람 수가 아니라 편성 기록 수" },
      { text: "타일은 가장 많은 성급과 그 비율. 편성 기록이 100건 미만이면 표본 부족" },
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
