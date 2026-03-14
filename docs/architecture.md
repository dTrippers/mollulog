# 아키텍처 가이드

## 전체 구조

```
Browser ←→ Cloudflare Workers (SSR) ←→ BAQL GraphQL API
                    ↓
            Cloudflare D1 (DB)
            Cloudflare KV (Cache/Session)
```

## React Router v7 (SSR)

파일시스템 라우팅. `app/routes/` 의 파일명이 URL 경로가 된다.

### 라우트 파일 구조 패턴

```typescript
// app/routes/example.$id.tsx

// 1. 서버 사이드 loader (데이터 fetch)
export async function loader({ params, context, request }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  // DB 또는 BAQL 쿼리
  return { data };
}

// 2. 서버 사이드 action (폼 제출 처리)
export async function action({ request, context }: ActionFunctionArgs) {
  // 폼 데이터 처리, DB 업데이트
  return { success: true };
}

// 3. 클라이언트 컴포넌트
export default function ExamplePage() {
  const { data } = useLoaderData<typeof loader>();
  return <div>{/* UI */}</div>;
}

// 4. SEO 메타 (선택적)
export function meta({ data }: MetaArgs) {
  return [{ title: data?.title }];
}
```

### context.cloudflare.env 접근

Cloudflare 바인딩은 `context.cloudflare.env`로 접근:

```typescript
const { DB, KV_SESSION, KV_USERDATA } = context.cloudflare.env;
```

타입은 `worker-configuration.d.ts`에 자동 생성됨 (`pnpm cf-typegen`).

## 컴포넌트 아키텍처 (원자 설계)

### Atoms (`app/components/atoms/`)
재사용 가능한 최소 단위. 외부 상태 의존 없음.

- `form/` — Button, Input, Label, NumberInput, SmallButton, Textarea, Toggle
- `item/` — ItemCard, ResourceCard
- `layout/` — BottomSheet, Page, Section 등
- `student/` — StudentImage, StudentBadge 등
- `typography/` — Title, SubTitle, Text
- `navigation/` — 네비게이션 프리미티브

### Molecules (`app/components/molecules/`)
Atoms 조합. 도메인 로직 일부 포함 가능.

- `auth/` — SignInBottomSheet
- `editor/` — 리치 텍스트 에디터
- `form/` — 복합 폼 컴포넌트
- `item/` — 아이템 선택/관리
- `pickup/` — 픽업 관련
- `student/` — StudentCard, StudentListItem
- `profile/` — 프로필 카드

### Organisms (`app/components/organisms/`)
복잡한 UI 블록. 도메인 모델과 직접 연결.

- `base/` — Navigation, Footer (전역 레이아웃)
- `raids/` — 레이드 카드, 레이드 목록
- `students/` — 학생 도감
- `contents/` — 콘텐츠 타임라인, 필터
- `event/` — 이벤트 헤더, 이벤트 표시
- `futures/` — 미래 콘텐츠 필터/뷰
- `relationship/` — 관계 추적 UI

### UI (`app/components/ui/`)
Headless UI 기반 재사용 프리미티브 (버튼, 카드, 모달 등).

## 전역 상태 (Context API)

### SignInProvider (`app/contexts/SignInContext.tsx`)
로그인 모달 가시성 관리.

```typescript
const { showSignIn, hideSignIn } = useSignIn();
// 인증 필요 시: showSignIn() 호출
```

### StudentCardPopupProvider
학생 카드 팝업 상태 관리. 호버/클릭 시 학생 정보 표시.

## Cloudflare Workers 엔트리

`workers/app.ts` — React Router 앱 핸들러 + Cron 작업 처리.

```typescript
export default {
  fetch: createRequestHandler({ build, getLoadContext }),
  async scheduled(event, env, ctx) {
    // Cron 기반 백그라운드 작업
    // "*/10 * * * *" — 타임라인 콘텐츠 동기화
  }
};
```

### Cron 스케줄 (`wrangler.jsonc`)
- `* * * * *` — 매분
- `*/10 * * * *` — 10분마다 (타임라인 동기화)
- `0 * * * *` — 매시간

## 캐싱 전략

### Cloudflare KV 캐시 (`app/lib/cache.ts`)

```typescript
fetchCached(env, key, fetchFn, ttl?, forceRefresh?)
```

- 키 접두사: `cache::`
- TTL 예시: 레이드 90분, 최신 레이드 10분
- 캐시 무효화: `deleteCache()`, `flushCacheAll()`
- 캐시 갱신 API: `GET /api/caches/flush-all`

### 세션 캐시 (KV_SESSION)
사용자 세션 저장. 쿠키 기반으로 30일 만료.

## 데이터 흐름

### 읽기 (데이터 표시)
1. 브라우저 → Worker (SSR 요청)
2. `loader()` 실행
3. KV 캐시 확인
4. 캐시 미스 → BAQL API 쿼리 또는 D1 쿼리
5. 결과 → `useLoaderData()` → 컴포넌트 렌더링

### 쓰기 (사용자 입력)
1. 폼 제출 또는 Fetcher API 호출
2. `action()` 실행
3. D1 데이터 업데이트
4. 필요 시 KV 캐시 무효화
5. 리다이렉트 또는 응답 반환

## 인증 흐름

```
Google OAuth:
  /auth/google/signin → Google → /auth/google/callback → 세션 생성

Passkey:
  /auth/passkey/register (등록) → KV에 credential 저장
  /auth/passkey/signin (로그인) → credential 검증 → 세션 생성
```

인증 상태 확인:
```typescript
const sensei = await authenticator.isAuthenticated(request);
if (!sensei) return redirect("/");
```

## 다국어/지역화

- `app/locales/` — 한국어 기준 텍스트
- BAQL API는 ko/ja/en 지원 (기본값: 한국어)
- 날짜: `dayjs` 라이브러리 사용

## 에셋 관리

- 게임 이미지: `assets.mollulog.net` CDN
- 빌드 에셋: Cloudflare Assets (`./build/client`)
- Go Lambda + OpenTofu로 S3 → Cloudflare 배포 자동화
