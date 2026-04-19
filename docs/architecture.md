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

## 컴포넌트 아키텍처

현재 UI 구조의 단일 소스 오브 트루스는 [component-development-guide.md](./component-development-guide.md) 이다.

아키텍처 관점에서만 요약하면 현재 활성 구조는 세 계층이다.

1. `app/components/primitives`
2. `app/components/features/<domain>`
3. `app/routes/*._components` 또는 `app/routes/*/_components`

현재 실제 컴포넌트 디렉터리도 이 구조만 남아 있다.

```text
app/components/
  primitives/
  features/
    auth/
    community/
    contents/
    coupons/
    editor/
    events/
    forms/
    futures/
    layout/
    profile/
    raids/
    relationship/
    students/
```

상세 규칙은 중복을 피하기 위해 이 문서에 다시 쓰지 않는다.
- 계층 정의, import 규칙, naming/API/styling 규칙:
  - [component-development-guide.md](./component-development-guide.md)
- UI/UX 규칙:
  - [ui-ux-guidelines.md](./ui-ux-guidelines.md)
- route-local 구성 규칙:
  - [routes.md](./routes.md)

## 전역 상태 (Context API)

### SignInProvider (`app/contexts/SignInProvider.tsx`)
로그인 모달 가시성 관리.

```typescript
const { showSignIn, hideSignIn } = useSignIn();
// 인증 필요 시: showSignIn() 호출
```

### StudentCardPopupProvider (`app/contexts/StudentCardPopupProvider.tsx`)
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

## 커뮤니티 도메인

사용자 작성 콘텐츠는 `community_*` 계층을 canonical 저장소로 사용한다.

- `community_posts`
  - `postType`: `student_review | event_opinion | guide`
  - `visibility`: `public | unlisted | private`
  - `subjectStudentUid`, `subjectContentUid`, `subjectRaidType`, `subjectSeasonIndex`
  - `blocks` JSON 배열 (`plaintext`, `markdown`, `youtube`, `party_info`)
- `community_comments`
  - 게시물 댓글과 1단계 대댓글
- `community_post_likes`
  - 게시물 좋아요
- `community_post_tags`
  - 학생 평가 태그

기존 도메인 모델은 호환 레이어로 남아 있다.

- `student-grading.ts` -> `community_posts(postType='student_review')`
- `content-comment.ts` -> `community_posts(postType='event_opinion')` / `community_comments`
- `party.ts` -> `community_posts(postType='guide')`

현재 `/community` 화면에서는 학생 평가와 이벤트 의견만 노출하고, 공략글은 같은 저장소를 사용하지만 피드에서는 숨긴다.

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
