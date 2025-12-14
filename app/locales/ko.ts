import dayjs from "dayjs";
import type { AttackType, DefenseType, EventType, PickupType, RaidType, Role, Terrain } from "~/models/content.d";
import type { Boss } from "~/models/raid";

export const attackTypeLocale: Record<AttackType, string> = {
  explosive: "폭발",
  piercing: "관통",
  mystic: "신비",
  sonic: "진동",
};

export const attackTypeColor: Record<AttackType, "red" | "yellow" | "blue" | "purple"> = {
  explosive: "red",
  piercing: "yellow",
  mystic: "blue",
  sonic: "purple",
};

export const defenseTypeLocale: Record<DefenseType, string> = {
  light: "경장갑",
  heavy: "중장갑",
  special: "특수장갑",
  elastic: "탄력장갑",
};

export const defenseTypeColor: Record<DefenseType, "red" | "yellow" | "blue" | "purple"> = {
  light: "red",
  heavy: "yellow",
  special: "blue",
  elastic: "purple",
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
  veryhard: "베리하드",
  hardcore: "하드코어",
  extreme: "익스트림",
  insane: "인세인",
  torment: "토먼트",
  lunatic: "루나틱",
};

export const bossName: Record<Boss, string> = {
  "binah": "비나",
  "chesed": "헤세드",
  "hod": "호드",
  "shirokuro": "시로 & 쿠로",
  "perorozilla": "페로로지라",
  "goz": "고즈",
  "hieronymus": "예로니무스",
  "kaiten-fx-mk0": "KAITEN FX Mk.0",
  "gregorius": "그레고리오",
  "hovercraft": "호버크래프트",
  "myouki-kurokage": "묘귀 쿠로카게",
  "geburah": "게부라",
  "yesod": "예소드",
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
  exercise: "종합전술시험",
  main_story: "메인 스토리",
  archive_pickup: "픽업 모집",
};

export const raidTypeLocale: Record<RaidType, string> = {
  total_assault: "총력전",
  elimination: "대결전",
  unlimit: "제약해제결전",
};

export const contentTypeLocale: Record<EventType | RaidType, string> = {
  ...eventTypeLocale,
  ...raidTypeLocale,
};

export const pickupTypeLocale: Record<PickupType, string> = {
  usual: "일반",
  limited: "한정",
  given: "배포",
  fes: "페스",
  archive: "아카이브",
};

export function pickupLabelLocale({ type, rerun }: { type: PickupType, rerun: boolean }): string {
  if (type === "archive") {
    return "아카이브";
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
