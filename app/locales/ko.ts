import dayjs from "dayjs";
import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import { normalizeTimeZone } from "~/lib/date-time";
import type { EventType, RaidType, Role, TacticRole, Terrain } from "~/models/content.d";
import type { TimelineContentType } from "~/models/timeline-content";

export const attackTypeLocale: Record<Attack, string> = {
  explosive: "폭발",
  piercing: "관통",
  mystic: "신비",
  sonic: "진동",
  chemical: "분해",
  normal: "일반",
};

export const attackTypeColor: Record<Attack, "red" | "yellow" | "green" | "blue" | "purple" | "grey"> = {
  explosive: "red",
  piercing: "yellow",
  mystic: "blue",
  sonic: "purple",
  chemical: "green",
  normal: "grey",
};

export const defenseTypeLocale: Record<Defense, string> = {
  light: "경장갑",
  heavy: "중장갑",
  special: "특수장갑",
  elastic: "탄력장갑",
  composite: "복합장갑",
  normal: "일반",
};

export const defenseTypeShortLocale: Record<Defense, string> = {
  light: "경장",
  heavy: "중장",
  special: "특수",
  elastic: "탄력",
  composite: "복합",
  normal: "일반",
};

export const defenseTypeColor: Record<Defense, "red" | "yellow" | "green" | "blue" | "purple" | "grey"> = {
  light: "red",
  heavy: "yellow",
  special: "blue",
  elastic: "purple",
  composite: "green",
  normal: "grey",
};

export const roleLocale: Record<Role, string> = {
  striker: "스트라이커",
  special: "스페셜",
};

export const roleColor: Record<Role, "red" | "yellow" | "blue" | "purple"> = {
  striker: "red",
  special: "blue",
};

export const terrainLocale: Record<Terrain, string> = {
  indoor: "실내",
  outdoor: "야외",
  street: "시가지",
};

export const difficultyLocale: Record<string, string> = {
  normal: "노말",
  hard: "하드",
  very_hard: "베리하드",
  hardcore: "하드코어",
  extreme: "익스트림",
  insane: "인세인",
  torment: "토먼트",
  lunatic: "루나틱",
};

export const eventTypeLocale: Record<EventType, string> = {
  live: "공식 방송",
  event: "이벤트",
  immortal_event: "이벤트 상설화",
  mini_event: "미니 이벤트",
  guide_mission: "가이드 미션",
  collab: "콜라보 이벤트",
  fes: "페스 이벤트",
  pickup: "픽업 모집",
  campaign: "캠페인",
  joint_firing_drill: "종합전술시험",
  main_story: "메인 스토리",
  mini_story: "미니 스토리",
  battle_pass: "배틀 패스",
  update: "점검/업데이트",
};

export const timelineContentTypeLocale: Record<TimelineContentType, string> = {
  live: "공식 방송",
  event: "이벤트",
  mini_event: "미니 이벤트",
  pickup: "픽업 모집",
  main_story: "메인 스토리",
  mini_story: "미니 스토리",
  campaign: "캠페인",
  joint_firing_drill: "종합전술시험",
  raid: "레이드",
  total_assault: "총력전",
  elimination: "대결전",
  unlimit: "제약해제결전",
  allied: "연합작전",
};

export const drillTypeLocale: Record<string, string> = {
  shooting: "사격",
  defense: "방어",
  assault: "돌파",
  escort: "호위",
};

export const campaignCategoryLocale: Record<string, string> = {
  bounty_hunt: "현상수배",
  commision: "특별의뢰",
  exp: "계정 경험치",
  mission_hard: "임무(Hard)",
  mission_normal: "임무(Normal)",
  schedule: "스케줄",
  scrimmage: "학원교류회",
};

export const pickupGroupTypeLocale: Record<string, string> = {
  limited: "한정 모집",
  usual: "픽업 모집",
  fes: "페스 모집",
  encore: "앙코르 모집",
  archive: "아카이브 모집",
  recollect: "리콜렉트 모집",
  given: "배포",
};

export const raidTypeLocale: Record<RaidType, string> = {
  raid: "레이드",
  total_assault: "총력전",
  elimination: "대결전",
  unlimit: "제약해제결전",
  allied: "연합작전",
};

export const contentTypeLocale: Record<EventType | RaidType, string> = {
  ...eventTypeLocale,
  ...raidTypeLocale,
};

export function recruitmentLabelLocale({
  recruitmentType: type,
  rerun,
}: {
  recruitmentType: RecruitmentTypeEnum;
  rerun: boolean;
}): string {
  if (type === "archive") {
    return "아카이브";
  } else if (type === "recollect") {
    return "리콜렉트";
  } else if (type === "encore") {
    return "앙코르";
  } else if (type === "usual") {
    return rerun ? "복각" : "신규";
  } else if (type === "limited") {
    return rerun ? "한정 복각" : "한정 신규";
  } else if (type === "fes") {
    return rerun ? "페스 복각" : "페스 신규";
  } else if (type === "given") {
    return "배포";
  }
  return "-";
}

export const schoolNameLocale: Record<string, string> = {
  abydos: "아비도스 고등학교",
  shanhaijing: "산해경 고급중학교",
  hyakkiyako: "백귀야행 연합학원",
  millennium: "밀레니엄 사이언스 스쿨",
  srt: "SRT 특수학원",
  arius: "아리우스 분교",
  trinity: "트리니티 종합학원",
  gehenna: "게헨나 학원",
  valkyrie: "발키리 경찰학교",
  redwinter: "붉은겨울 연방학원",
  sakugawa: "사쿠가와 중학교",
  tokiwadai: "토키와다이 중학교",
  highlander: "하이랜더 철도학원",
  wildhunt: "와일드헌트 예술학원",
  odyssey: "오디세이아 해양학교",
  others: "기타 학원",
};

/** Compact labels for the student directory card and group headings. */
export const schoolShortLocale: Record<string, string> = {
  abydos: "아비도스",
  shanhaijing: "산해경",
  hyakkiyako: "백귀야행",
  millennium: "밀레니엄",
  srt: "SRT",
  arius: "아리우스",
  trinity: "트리니티",
  gehenna: "게헨나",
  valkyrie: "발키리",
  redwinter: "붉은겨울",
  sakugawa: "사쿠가와",
  tokiwadai: "토키와다이",
  highlander: "하이랜더",
  wildhunt: "와일드헌트",
  odyssey: "오디세이아",
  others: "기타",
};

export const tacticRoleLocale: Record<TacticRole, string> = {
  attacker: "딜러",
  tank: "탱커",
  healer: "힐러",
  support: "서포터",
  tactical_support: "T.S.",
};

export const positionLocale: Record<"front" | "middle" | "back", string> = {
  front: "FRONT",
  middle: "MIDDLE",
  back: "BACK",
};

export const equipmentTypeLocale: Record<string, string> = {
  hat: "모자",
  gloves: "장갑",
  shoes: "신발",
  bag: "가방",
  badge: "배지",
  hairpin: "헤어핀",
  charm: "부적",
  watch: "시계",
  necklace: "목걸이",
};

export const equipmentTypeOrder = [
  "hat",
  "gloves",
  "shoes",
  "bag",
  "badge",
  "hairpin",
  "charm",
  "watch",
  "necklace",
] as const;

type RelativeTimeOptions = {
  now?: dayjs.Dayjs;
  timeZone?: string | null;
};

function getRelativeTimeParts(at: dayjs.Dayjs, { now = dayjs(), timeZone }: RelativeTimeOptions = {}) {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const target = at.tz(normalizedTimeZone);
  const current = now.tz(normalizedTimeZone);

  const remainingDays = target.startOf("day").diff(current.startOf("day"), "day");
  const remainingHours = target.startOf("hour").diff(current.startOf("hour"), "hour");

  return { remainingDays, remainingHours };
}

export function relativeTime(at: dayjs.Dayjs, options: RelativeTimeOptions = {}): string {
  const { remainingDays, remainingHours } = getRelativeTimeParts(at, options);
  if (remainingDays >= 2) {
    return `${remainingDays}일 후`;
  }
  if (remainingDays === 1) {
    return "내일";
  }
  return `${remainingHours}시간 후`;
}

export function remainingTime(
  at: dayjs.Dayjs,
  options: RelativeTimeOptions = {},
): { text: string; finishSoon: boolean } {
  const { remainingDays, remainingHours } = getRelativeTimeParts(at, options);
  if (remainingDays >= 2) {
    return { text: `${remainingDays}일`, finishSoon: false };
  }
  if (remainingDays === 1) {
    return { text: "내일 종료", finishSoon: false };
  }
  return { text: `${remainingHours}시간 남음`, finishSoon: true };
}

export function formatResourceAmount(amount: number): string {
  if (amount >= 10000) {
    return `${(amount / 1000).toLocaleString()}k`;
  }
  return amount.toLocaleString();
}

export const cardFlipLocale = {
  menuTitle: "카드 뒤집기",
  menuDescription: "전략별 소비 재화와 기대 획득 보상을 비교해보세요",
  minigameDescription: "선택한 전략의 기대값으로 계산해요",
  countLabel: "뒤집을 카드 수",
  strategyTitle: "전략별 비교",
  strategyDescription: "같은 카드 수를 뒤집을 때 전략마다 소비 재화와 획득 보상을 비교해요. 선택한 전략만 상점 계산에 반영돼요",
  strategyControlLabel: "카드 뒤집기 전략",
  strategies: {
    "one-open": {
      label: (_count: number) => "1장 후 셔플",
      shortLabel: "1장 후 셔플",
      rule: () => "1장을 뒤집은 뒤 바로 셔플해요",
    },
    "sr-reset": {
      label: (_count: number) => "SR 이상 획득 시 셔플",
      shortLabel: "SR 이상 셔플",
      rule: (count: number) => `SR 이상이 나오면 셔플하고, 아니면 ${count}장까지 뒤집어요`,
    },
    "all-open": {
      label: (count: number) => `${count}장 모두 뒤집기`,
      shortLabel: "모두 뒤집기",
      rule: (count: number) => `등급과 관계없이 ${count}장을 모두 뒤집은 뒤 셔플해요`,
    },
  },
  selectedBadge: "계획에 반영 중",
  costLabel: "소비 재화",
  rewardLabel: "획득 보상",
  rewardHeaders: { resource: "보상", quantity: "기대량", per100: "100장당" },
  noCardCountTitle: "뒤집을 카드 수를 입력해 주세요",
  noCardCountDescription: "카드 수를 입력하면 전략별 소비 재화와 획득 보상을 비교할 수 있어요",
  averageRewards: "기대 획득 보상",
  averageBadge: "기대값",
  averageDisclosure: "기대값이라 실제 획득량은 달라질 수 있어요",
  listLinkTitle: "전략 비교와 카드별 보상 보기",
  listLinkDescription: (count: number) => `세 전략의 소비 재화·획득 보상과 카드 ${count}종의 보상 구성을 확인해보세요`,
  listLinkDescriptionWithoutCount: "세 전략의 소비 재화·획득 보상과 카드별 보상 구성을 확인해보세요",
  cardListTitle: (count: number) => `카드별 보상 (${count}종)`,
  cardListDescription: "카드 1장을 뒤집었을 때 나올 수 있는 보상 구성이에요. 뒤집는 순서와는 관계없어요",
  currentPlan: "현재 계획",
  currentPlanDescription: "상점 계산기와 같은 입력값으로 계산해요",
  strategyLabel: "전략",
  minigameRequiredLabel: "카드 뒤집기",
  averageMinigameLabel: "카드 뒤집기 (기대값)",
  returnToCalculator: "상점 계산기로 돌아가기",
  returnToCalculatorDescription: "구매 수량·보유 수량은 상점 계산기에서 바꿀 수 있어요",
  noCardCountShortDescription: "뒤집을 카드 수를 입력하면 선택 전략의 결과를 확인할 수 있어요",
  unavailableTitle: "카드별 보상 정보가 아직 없어요",
  unavailableDescription: "상점 계산기의 카드 뒤집기 계산도 할 수 없어요",
  invalidTitle: "카드별 보상 정보를 불러오지 못했어요",
  invalidDescription: "일부 카드 정보가 올바르지 않아 상점 계산기의 카드 뒤집기 계산도 할 수 없어요",
  cardCostStatement: (resourceName: string, costs: { flip: number; quantity: number }[]) => {
    if (costs.every(({ quantity }) => quantity === costs[0]?.quantity)) {
      return `카드 1장당 ${resourceName} ${costs[0]?.quantity.toLocaleString() ?? 0}개가 필요해요`;
    }
    return `뒤집는 순서별 소비 재화: ${costs
      .map(({ flip, quantity }) => `${flip}장째 ${resourceName} ${quantity.toLocaleString()}개`)
      .join(" · ")}`;
  },
  rarity: {
    1: { text: "N", color: "grey" },
    2: { text: "R", color: "blue" },
    3: { text: "SR", color: "orange" },
    4: { text: "SSR", color: "purple" },
  },
} as const;

export function getCardFlipRarity(rarity: number | null): (typeof cardFlipLocale.rarity)[1 | 2 | 3 | 4] | null {
  if (rarity === 1 || rarity === 2 || rarity === 3 || rarity === 4) {
    return cardFlipLocale.rarity[rarity];
  }
  return null;
}

export function minigameDescription(minigameType: string): string | null {
  if (minigameType === "card_flip") {
    return cardFlipLocale.minigameDescription;
  } else if (minigameType === "fortune_gacha") {
    return "예상 보상은 평균값으로 계산하며 각종 보정치는 적용되지 않아요";
  } else if (minigameType === "box_gacha") {
    return "회차별 모든 보상을 획득했을 때를 기준으로 계산해요";
  } else if (minigameType === "clue_search") {
    return "선택한 회차의 단서와 획득 보상을 함께 계산해요";
  }
  return null;
}

export const treasureHuntLocale = {
  title: "보물찾기",
  simulatorTitle: "보물찾기 시뮬레이션",
  simulatorDescription: "보물 위치 예측과 회차별 보상을 확인해보세요",
  boardTitle: "보물 위치 예측",
  boardRound: "회차",
  boardCaption: "숫자는 보물이 있을 확률(%)이에요",
  boardCalculating: "계산 중",
  boardFailed: "보물 확률을 계산하지 못했어요",
  boardInconsistent: "기록과 맞는 보물 배치가 없어요. 마지막 기록을 되돌리거나 회차를 확인해주세요",
  recommendation: (count: number, probability: number) => `추천 칸 ${count}곳 · 보물 확률 ${probability}%`,
  noRemainingTreasure: "남은 보물이 없어요",
  allTreasuresFound: "모든 보물을 찾았어요",
  emptyBoardHelp: "빈 칸은 눌러서 기록하고, 보물은 아래 목록에서 모양을 골라주세요",
  emptyRecorded: "빈 칸을 기록했어요",
  emptyRecordRemoved: "빈 칸 기록을 취소했어요",
  placementInstruction: (width: number, height: number, orientation: string) =>
    `${width}×${height} ${orientation} 보물의 왼쪽 위 칸을 눌러주세요`,
  placementOverlap: "이미 기록한 칸과 겹쳐요. 다른 칸을 눌러주세요",
  placementOutOfBounds: "판 밖으로 벗어나요. 다른 칸을 눌러주세요",
  treasureRecorded: (width: number, height: number) => `${width}×${height} 보물을 기록했어요`,
  treasureSelected: (width: number, height: number) => `${width}×${height} 보물을 선택했어요`,
  clearTreasureRecord: "보물 기록 지우기",
  cancel: "취소",
  undo: "되돌리기",
  reset: "초기화",
  nextRound: "다음 회차",
  remainingTreasures: "남은 보물",
  horizontal: "가로",
  vertical: "세로",
  place: "놓기",
  remainingCount: (remaining: number, total: number) => `${remaining}/${total} 남음`,
  roundAfter: (round: number) => `${round}회차 이후`,
  nextRoundLabel: (roundLabel: string) => `다음 회차 (${roundLabel})`,
  targetRound: "목표 회차",
  targetRoundLimit: "보물찾기 목표 회차는 최대 100회차까지 설정할 수 있어요.",
  roundLimitResult:
    "목표 회차가 100회를 넘어 소탕 횟수와 필요 AP를 계산할 수 없어요. 목표 회차를 100회 이하로 낮춰주세요.",
  excludeCompleted: "완료한 회차 제외",
  completedRound: "완료 회차",
  completedRoundHelp: "완료한 다음 회차부터 계산해요",
  costMode: "보상 획득 기준",
  top10: "상위 10%",
  typical: "보통",
  bottom10: "하위 10%",
  calculating: "보물찾기 비용을 계산하고 있어요",
  calculationComplete: "보물찾기 비용 계산을 마쳤어요",
  progress: (percentage: number) => `계산 중 ${percentage}%`,
  simulationAssumption: "모든 보물을 여는 가정의 시뮬레이션 결과에요",
  requiredResources: "필요 재화",
  totalRewards: "총 획득 보상",
  treasureRewards: "보물 보상",
  openRewards: "오픈 보상",
  roundDetails: "회차별 보물 및 보상",
  boardSize: "판 크기",
  cellCost: "칸당 필요 재화",
  openCellReward: "칸당 오픈 보상",
  calculatingShort: "계산 중",
  calculationFailed: "계산 실패",
  noData: "보물찾기 보상 정보를 준비중이에요",
  incompatible: "회차마다 칸 비용이 달라 보물찾기 비용을 계산할 수 없어요",
  failed: "보물찾기 비용을 계산하지 못했어요. 목표 회차를 0으로 두면 보물찾기를 빼고 계산해요.",
  retry: "다시 시도",
  selectTarget: "목표 회차를 선택해주세요",
  provisionalResult: "보물찾기 비용을 계산 중이라 결과가 조금 바뀔 수 있어요",
  pendingResult: "보물찾기 비용을 계산하고 있어요. 계산이 끝나면 소탕 횟수와 필요한 AP를 보여드려요",
  failedResult: "보물찾기 비용을 계산하지 못해 소탕 횟수와 필요한 AP를 보여드릴 수 없어요",
} as const;
