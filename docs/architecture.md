# 아키텍처 가이드

몰루로그의 문서는 파일 목록보다 오래 유지되는 구조와 규칙을 설명하는 것을 목표로 합니다.
이 문서도 현재 코드의 세부 나열보다 "어디에 무엇을 두는가"와 "데이터가 어떻게 흐르는가"에 집중합니다.

## 전체 구조

```text
브라우저
  ↕ SSR 요청/응답
Cloudflare Workers
  ↕
BAQL GraphQL API
  ↕
Cloudflare D1 / KV
```

- 웹 앱은 React Router v7 기반 SSR 앱으로 Cloudflare Workers에서 실행됩니다.
- 게임 원천 데이터는 주로 BAQL GraphQL API에서 읽고, 사용자 데이터와 앱 상태는 D1에 저장합니다.
- 응답 속도와 크론성 선계산 작업에는 KV 캐시를 사용합니다.

## 핵심 디렉터리

- `app/routes`
  라우트 파일, `loader`/`action`, 메타, 상위 화면 조립을 담당합니다.
- `app/components/primitives`
  semantic token을 사용하는 저수준 공통 UI와 얇은 앱 공통 표현 레이어입니다.
- `app/components/features/<domain>`
  여러 화면에서 재사용되는 도메인 UI입니다.
- `app/routes/*._components`, `app/routes/*/_components`
  한 라우트 패밀리 안에서만 쓰는 route-local UI와 훅입니다.
- `app/models`
  D1 테이블 정의와 앱 도메인 단위의 읽기/쓰기 로직이 위치합니다.
- `app/repositories`
  새로 추가되는 BAQL 읽기 조합, 캐싱, 복합 조회 orchestration은 우선 이 계층을 고려합니다.
- `workers/app.ts`
  Worker 엔트리와 크론 작업 진입점입니다.

세부 UI 구조 규칙은 아래 문서를 기준으로 합니다.

- [컴포넌트 개발 가이드](./component-development-guide.md)
- [라우트 가이드](./routes.md)
- [UI/UX 가이드](./ui-ux-guidelines.md)

## 런타임과 배포

- Worker 엔트리: `workers/app.ts`
- 라우팅 설정: `app/routes.ts` + React Router flat routes
- 배포 설정: `wrangler.jsonc`
- 정적 에셋: `build/client`
- 주요 바인딩:
  - `DB`: Cloudflare D1
  - `KV_CACHE`: 캐시 저장소
  - `KV_SESSION`: 세션 및 인증 관련 임시 데이터

프로덕션 크론은 현재 아래처럼 운영됩니다.

- `* * * * *`
  UI용 단기 캐시 워밍
- `*/10 * * * *`
  타임라인 동기화, 학생/레이드/모집 데이터 갱신
- `0 * * * *`
  장기 캐시 재생성

## 데이터 흐름

### 읽기

1. 브라우저가 라우트를 요청합니다.
2. route `loader`가 실행됩니다.
3. 필요하면 KV 캐시를 먼저 확인합니다.
4. 캐시 미스 시 BAQL 또는 D1을 조회합니다.
5. `useLoaderData()`로 화면을 렌더링합니다.

### 쓰기

1. 사용자가 `Form` 또는 fetcher를 통해 요청합니다.
2. route `action`이 실행됩니다.
3. D1 또는 인증/세션 상태를 갱신합니다.
4. 필요하면 캐시를 비웁니다.
5. 응답 또는 리다이렉트를 반환합니다.

## 캐싱 원칙

- 공통 캐시 유틸리티는 `app/models/base.ts`의 `fetchCached`를 사용합니다.
- 캐시 키는 `cache::` 접두사 아래에 저장됩니다.
- 화면 단위에서 임의로 캐시 정책을 만들기보다, 재사용되는 조회 로직 안에서 캐시를 결정합니다.
- 강제 새로고침이 필요한 경우 `forceRefresh` 패턴을 사용합니다.

## 인증 원칙

- 인증 진입점은 `app/auth/authenticator.server.ts`입니다.
- 현재 로그인 수단은 Google OAuth와 Passkey입니다.
- 인증이 필요한 라우트는 route `loader`/`action`에서 직접 검사합니다.
- 세션 저장은 쿠키 세션을 사용하며, 임시 Passkey challenge 등은 `KV_SESSION`을 사용합니다.

## 도메인 규칙

### 커뮤니티

- 사용자 작성 콘텐츠의 canonical 저장소는 `community_*` 계층입니다.
- 학생 평가, 이벤트 의견, 공략글은 저장소를 따로 늘리기보다 이 계층 안에서 타입으로 구분합니다.
- 레거시 테이블이 남아 있어도 새 기능은 canonical 저장소 기준으로 판단합니다.

### UI 구조

- 새 저수준 UI는 `primitives`와 `features/forms` 조합을 우선 사용합니다.
- semantic token은 `app/tailwind.css`에 두고, surface/foreground/border 역할은 그 기준을 따릅니다.
- 공용화가 검증되기 전에는 route-local 구성을 먼저 선택합니다.
- 화면 설명보다 구조 규칙을 우선 문서화합니다.

## 문서 역할 분리

- 이 문서: 전체 구조와 데이터 흐름
- [라우트 가이드](./routes.md): 파일명 규칙, route 책임, route-local 규칙
- [컴포넌트 개발 가이드](./component-development-guide.md): UI 계층과 승격 기준
- [데이터베이스 가이드](./database.md): D1/Drizzle 모델링과 마이그레이션 규칙
- [BAQL API 가이드](./baql-api.md): GraphQL 조회와 codegen 규칙
