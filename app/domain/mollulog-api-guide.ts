import {
  API_KEY_LIFETIME_MONTHS,
  API_MAX_REQUEST_SIZE_TEXT,
  API_PUBLIC_ERRORS,
  API_READ_LIMIT_PER_MINUTE,
  type API_ROUTES,
  API_STUDENT_PAGE_SIZE,
  API_STUDENT_PAGE_SIZE_MAX,
  API_STUDENT_STATE_FIELD_SPECS,
  API_WRITE_LIMIT,
  API_WRITE_WINDOW_MINUTES,
} from "~/domain/mollulog-api-spec";
import { getWeaponLevelMaxByTier } from "~/domain/student-growth-state";

export const API_GUIDE_COPY = {
  pageTitle: "API 문서",
  sections: {
    agent: "코딩 에이전트로 연동하기",
    connection: "연결",
    oauth: "몰루로그 계정으로 로그인",
    endpoints: "모델과 엔드포인트",
    fields: "학생 상태 필드",
    errors: "오류",
    limits: "제한과 규칙",
  },
  agentPromptLabel: "프롬프트 예시",
  agentPromptTemplate:
    "{llmsUrl} 를 읽고, 블루 아카이브 데이터 관리 서비스인 몰루로그 API에 대해 파악해주세요. 개발중인 도구와 어떻게 연동할 수 있을지 검토 후 제안해주세요.",
  documentLinks: [
    { key: "llmsFull", label: "전체 안내", copyLabel: "llms-full.txt 주소 복사" },
    { key: "llms", label: "목차", copyLabel: "llms.txt 주소 복사" },
    { key: "openApi", label: "OpenAPI", copyLabel: "OpenAPI 주소 복사" },
  ],
  connection: {
    baseUrl: "Base URL",
    authorization: "인증",
    authorizationValue: "Authorization: Bearer <API 키 또는 액세스 토큰>",
    baseUrlCopyLabel: "Base URL 복사",
    authorizationCopyLabel: "인증 헤더 복사",
  },
  parameterTable: { name: "파라미터", description: "설명" },
  requestExampleLabel: "요청 예시",
  responseLabel: "응답",
  fieldTable: {
    columns: ["필드", "의미", "범위", "null로 비우기"],
    nullAllowed: "가능",
    nullForbidden: "불가",
  },
  fieldGroups: [
    { fields: ["tier"], meaning: "학생 성급", detail: "등록할 때 필요" },
    {
      fields: ["weaponTier"],
      meaning: "고유무기 성급",
      detail: `${API_STUDENT_STATE_FIELD_SPECS.weaponTier.min}은 고유무기 없음 · ${API_STUDENT_STATE_FIELD_SPECS.weaponTier.min + 1} 이상은 학생 성급 ${API_STUDENT_STATE_FIELD_SPECS.tier.max}에서만 · 등록할 때 필요`,
    },
    { fields: ["level"], meaning: "학생 Lv" },
    { fields: ["skillEx"], meaning: "EX 스킬" },
    { fields: ["skillNormal", "skillEnhanced", "skillSub"], meaning: "기본 · 강화 · 서브 스킬" },
    { fields: ["equip1", "equip2", "equip3"], meaning: "장비 1 · 2 · 3 티어" },
    { fields: ["equip1Level", "equip2Level", "equip3Level"], meaning: "장비 1 · 2 · 3 레벨" },
    { fields: ["equipSpecial"], meaning: "애용품" },
    { fields: ["weaponLevel"], meaning: "고유무기 Lv", detail: "고유무기 성급에 따라 최대값이 달라요" },
    {
      fields: ["abilityHp", "abilityAtk", "abilityHeal"],
      meaning: "능력 해방 (HP · 공격력 · 치유력)",
      detail: `${API_STUDENT_STATE_FIELD_SPECS.abilityHp.min + 1} 이상은 고유무기가 있을 때만`,
    },
    { fields: ["bond"], meaning: "인연 랭크" },
    { fields: ["bondExp"], meaning: "인연 누적 경험치", detail: "인연 랭크와 맞지 않으면 비워져요" },
  ] as const,
  pageFieldRules: ["결과 상태가 규칙에 맞지 않으면 요청 전체를 거부해요"],
  pageLimits: [
    { label: "읽기 한도", value: `분당 ${API_READ_LIMIT_PER_MINUTE}회 · 계정·지역별` },
    { label: "쓰기 한도", value: `${API_WRITE_WINDOW_MINUTES}분에 ${API_WRITE_LIMIT}회 · 모든 키 합산` },
    { label: "요청 크기", value: `본문 최대 ${API_MAX_REQUEST_SIZE_TEXT}` },
    { label: "학생 UID", value: "학생 찾기로 얻은 UID · 폼 체인지 학생은 다른 폼의 UID도 대표 UID로 처리돼요" },
    { label: "키 유효 기간", value: `발급 후 ${formatKeyLifetime(API_KEY_LIFETIME_MONTHS)}` },
    { label: "재시도", value: "같은 요청을 다시 보내면 다시 처리돼요" },
  ],
  routeGuides: {
    getMe: {
      response: "내 프로필과 개인 키 또는 애플리케이션 연결 전용 식별자를 반환해요.",
    },
    findStudents: {
      response: "students(UID·이름)와 nextCursor",
    },
    listRecruitedStudents: {
      response: "모집 학생의 현재 상태 목록",
    },
    getRecruitedStudent: {
      note: "등록하지 않은 학생이면",
      error: "student_not_recruited",
    },
    registerRecruitedStudent: {
      required: "studentUid, tier, weaponTier는 꼭 보내야 해요.",
      readPermission: "응답에 현재 상태 필드가 함께 와요",
      error: "student_already_recruited",
    },
    patchRecruitedStudent: {
      note: "보낸 필드만 바뀌어요 · 등록하지 않은 학생이면",
      error: "student_not_recruited",
    },
    deleteRecruitedStudent: {
      note: "모집 등록, 현재 성장도, 인연·경험치를 지워요 · 육성 목표, 선물 계획, 플래너는 남아요",
    },
  } as const,
  errorExampleLabel: "오류 응답 예시",
  errorExample: {
    code: "invalid_request",
    message: "요청 내용을 확인해주세요.",
    fields: [
      {
        field: "level",
        message: `${API_STUDENT_STATE_FIELD_SPECS.level.min}부터 ${API_STUDENT_STATE_FIELD_SPECS.level.max} 사이여야 해요.`,
      },
    ],
  },
} as const;

export const API_GUIDE_FULL = {
  overview: "몰루로그 계정으로 로그인하거나 학생 상태를 읽고 쓰는 API예요.",
  authentication: [
    "요청마다 `Authorization: Bearer <API 키 또는 액세스 토큰>` 헤더를 보내세요.",
    "API 키는 `MOLLULOG_API_KEY` 환경 변수에 저장하고 코드, 커밋, 로그에 남기지 마세요.",
    "연동에 필요한 권한만 부여하세요. 쓰기 권한을 고르면 읽기 권한도 함께 부여돼요.",
  ],
  workflow: [
    "OAuth 앱이 `/oauth/authorize`에서 authorization code를 받고, `/oauth/token`에서 액세스 토큰으로 교환해요.",
    "앱이 요청한 권한을 사용자가 허용하면 code가 발급돼요. 이미 허용한 권한에 요청한 권한이 모두 포함되면 동의 화면을 건너뛰어요.",
    "액세스 토큰은 발급 후 1년 동안 사용할 수 있어요. 갱신 토큰을 발급하지 않으므로 만료되면 인증 절차를 다시 진행해야 해요.",
    "액세스 토큰으로 `GET /v1/me`를 호출해 사용자별 식별자와 프로필을 확인할 수 있어요.",
    "학생 찾기로 UID를 확인한 뒤 모집 학생 조회를 요청하세요.",
    "조회 결과가 `student_not_recruited`이면 POST로 등록하세요.",
    "POST가 `student_already_recruited`로 끝나면 PATCH로 필요한 필드만 보내세요.",
  ],
  fieldRules: [
    `고유무기 성급은 ${API_STUDENT_STATE_FIELD_SPECS.weaponTier.min}–${API_STUDENT_STATE_FIELD_SPECS.weaponTier.max}이고, ${API_STUDENT_STATE_FIELD_SPECS.weaponTier.min + 1} 이상이면 학생 성급은 ${API_STUDENT_STATE_FIELD_SPECS.tier.max}여야 해요. 등록할 때 학생 성급과 고유무기 성급을 모두 보내세요.`,
    `고유무기 Lv 범위는 ${API_STUDENT_STATE_FIELD_SPECS.weaponLevel.min}–${API_STUDENT_STATE_FIELD_SPECS.weaponLevel.max}이며 고유무기 성급에 따라 상한이 달라요. ${weaponLevelTierRule()}`,
    `능력 해방 필드는 각각 ${API_STUDENT_STATE_FIELD_SPECS.abilityHp.min}–${API_STUDENT_STATE_FIELD_SPECS.abilityHp.max}이고, ${API_STUDENT_STATE_FIELD_SPECS.abilityHp.min + 1} 이상은 고유무기가 있을 때만 입력할 수 있어요.`,
    "인연 경험치는 현재 인연 랭크의 구간에 맞아야 해요. 인연 랭크와 맞지 않으면 요청 성공 후 경험치가 null로 비워져요.",
    "등록할 때 보내지 않은 상태 필드는 null로 저장돼요. 다만 이미 기록된 인연 랭크와 누적 경험치가 있으면 그대로 유지돼요. PATCH에서 보내지 않은 필드는 그대로 유지돼요.",
    "모든 변경을 합친 결과가 규칙에 맞지 않으면 요청 전체를 거부해요. 다른 필드를 대신 수정하지 않아요.",
    "쓰기 본문은 학생 한 명의 객체여야 해요. 배열은 보낼 수 없어요.",
  ],
  cursorAndLimit: [
    `목록의 limit은 기본 ${API_STUDENT_PAGE_SIZE}명이고, 한 번에 최대 ${API_STUDENT_PAGE_SIZE_MAX}명이에요.`,
    "cursor는 이전 응답의 nextCursor를 그대로 보내는 불투명한 페이지 토큰이에요.",
    "학생 찾기와 모집 학생 목록 응답의 nextCursor가 null이면 다음 페이지가 없어요.",
  ],
  representativeUid:
    "학생 찾기와 학생 상태 요청에서 폼 체인지 학생의 다른 폼 UID를 보내도 대표 UID로 처리돼요. 응답의 studentUid를 다음 요청에 사용하세요. 수영복처럼 따로 모집하는 버전은 서로 다른 학생으로 처리돼요.",
  responseScopes: "모집 학생 조회, POST, PATCH 응답에는 대표 studentUid와 현재 상태 필드가 포함돼요.",
  deletion: "DELETE는 모집 등록, 현재 성장도, 인연·경험치를 지워요. 육성 목표, 선물 계획, 플래너는 남아요.",
  errorFields: [
    "`code`는 오류 종류를 나타내는 안정된 식별자예요.",
    "`message`는 해당 요청에서 확인할 내용을 한국어로 설명해요.",
    "`fields`는 입력 검증 오류가 난 경우에만 포함되며 문제 필드와 이유를 담아요.",
    "`docs`는 같은 오류 code의 설명으로 이동하는 URL이에요.",
  ],
  limits: [
    `읽기는 계정과 Cloudflare 지역별로 분당 ${API_READ_LIMIT_PER_MINUTE}회까지 허용돼요.`,
    `쓰기는 모든 API 키를 합산해 계정당 ${API_WRITE_WINDOW_MINUTES}분 창에 ${API_WRITE_LIMIT}회까지 허용돼요. 첫 쓰기 요청이 창을 시작해요.`,
    "쓰기 권한으로 인증된 요청은 처리 결과와 관계없이 한 번으로 세요. 인증·권한 실패와 이미 한도를 넘은 429 요청은 세지 않아요.",
    `요청 본문은 ${API_MAX_REQUEST_SIZE_TEXT}까지 보낼 수 있어요.`,
    `API 키는 발급 후 ${formatKeyLifetime(API_KEY_LIFETIME_MONTHS)} 동안 유효하며 만료되거나 삭제된 키는 인증에 사용할 수 없어요.`,
  ],
  retry: [
    "쓰기 요청은 멱등하지 않아요. 같은 요청을 다시 보내면 다시 처리돼요.",
    "결과를 알 수 없으면 먼저 GET으로 현재 상태를 확인하세요. 원하는 상태가 아니면 필요한 쓰기를 다시 보내세요.",
    "429 응답의 Retry-After 초만큼 기다린 뒤 다시 보내세요.",
    "500 응답은 처리 여부를 알 수 없으므로 GET으로 확인한 뒤 필요하면 다시 보내세요. 503은 요청을 처리하지 않았으므로 잠시 후 다시 보내세요.",
  ],
  errorHandling: Object.fromEntries(
    Object.entries(API_PUBLIC_ERRORS).map(([code, error]) => [code, `${error.title} · ${error.description}`]),
  ),
} as const;

export function getApiEndpointGuide(routeId: (typeof API_ROUTES)[number]["id"]) {
  return API_GUIDE_COPY.routeGuides[routeId as keyof typeof API_GUIDE_COPY.routeGuides];
}

function weaponLevelTierRule(): string {
  const firstWeaponTier = API_STUDENT_STATE_FIELD_SPECS.weaponTier.min;
  const lastWeaponTier = API_STUDENT_STATE_FIELD_SPECS.weaponTier.max;
  const studentTier = API_STUDENT_STATE_FIELD_SPECS.tier.max;
  const levelsByWeaponTier = Array.from({ length: lastWeaponTier - firstWeaponTier + 1 }, (_, index) => {
    const weaponTier = firstWeaponTier + index;
    return getWeaponLevelMaxByTier(studentTier + weaponTier);
  });
  const noWeaponLevelMax = levelsByWeaponTier[0];
  const noWeaponLevelRange = noWeaponLevelMax === 0 ? "0 또는 null" : `0부터 ${noWeaponLevelMax}까지 또는 null`;
  const noWeaponRule = `고유무기 성급 ${firstWeaponTier}이면 \`weaponLevel\`은 ${noWeaponLevelRange}이어야 해요.`;
  const weaponLevels = levelsByWeaponTier.slice(1);

  return `${noWeaponRule} 고유무기 성급 ${firstWeaponTier + 1}부터 ${lastWeaponTier}까지 각각 ${weaponLevels.join("·")}까지 입력할 수 있어요.`;
}

function formatKeyLifetime(months: number): string {
  return months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
}
