import dayjs from "dayjs";
import type { Attack, Defense, RecruitmentTypeEnum } from "~/graphql/graphql";
import type { EventType, RaidType, Role, Terrain } from "~/models/content.d";
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
  battle_pass: "배틀 패스",
  update: "점검/업데이트",
};

export const timelineContentTypeLocale: Record<TimelineContentType, string> = {
  event: "이벤트",
  mini_event: "미니 이벤트",
  pickup: "픽업 모집",
  main_story: "메인 스토리",
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

export function recruitmentLabelLocale({ recruitmentType: type, rerun }: { recruitmentType: RecruitmentTypeEnum, rerun: boolean }): string {
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
  others: "기타 학원",
};

export function relativeTime(at: dayjs.Dayjs): string {
  let timeLabel = null;

  const now = dayjs();
  const remainingDays = at.startOf("day").diff(now.startOf("day"), "day");
  if (remainingDays >= 2) {
    timeLabel = `${remainingDays}일 후`;
  } else {
    const remainingHours = at.startOf("hour").diff(now.startOf("hour"), "hour");
    if (remainingHours > 24) {
      timeLabel = "내일";
    } else {
      timeLabel = `${remainingHours}시간 후`;
    }
  }
  return timeLabel;
}

export function formatResourceAmount(amount: number): string {
  if (amount >= 10000) {
    return `${(amount / 1000).toLocaleString()}k`;
  }
  return amount.toLocaleString();
}

export function minigameDescription(minigameType: string): string | null {
  if (minigameType === "card_flip") {
    return "예상 보상은 전체 카드를 뒤집었을 때의 평균 결과를 기준으로 계산해요";
  } else if (minigameType === "fortune_gacha") {
    return "예상 보상은 평균값으로 계산하며 각종 보정치는 적용되지 않아요";
  } else if (minigameType === "box_gacha") {
    return "회차별 모든 보상을 획득했을 때를 기준으로 계산해요";
  }
  return null;
}
