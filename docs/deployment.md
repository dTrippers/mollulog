# 배포 가이드

## 환경

| 환경 | URL | Cloudflare env |
|------|-----|----------------|
| 로컬 개발 | http://localhost:8787 | (local) |
| 스테이징 | https://staging.mollulog.net | `staging` |
| 프로덕션 | https://mollulog.net | `production` |

## 빠른 배포

```bash
# 스테이징 배포
pnpm staging:deploy

# 프로덕션 배포
pnpm prod:deploy
```

## 상세 과정

### 1. 타입 체크 및 린트

```bash
pnpm typecheck   # TypeScript 타입 체크
pnpm lint        # Biome 린트 및 포매팅
```

### 2. GraphQL 타입 갱신 (필요 시)

쿼리를 추가/수정했다면:
```bash
pnpm codegen
```

### 3. 빌드

```bash
# 스테이징
CLOUDFLARE_ENV=staging react-router build --mode staging

# 프로덕션
CLOUDFLARE_ENV=production react-router build --mode production
```

### 4. Cloudflare 배포

```bash
wrangler deploy
```

## 환경 변수 (Secrets)

Wrangler secrets로 관리. 직접 `.env` 파일 사용 안 함 (로컬은 `.dev.vars` 사용).

### Observability

- `SERVER_BETTER_STACK_SOURCE_TOKEN` — Better Stack Logs source token
- `SERVER_BETTER_STACK_SENTRY_DSN` — 서버/워커에서 사용하는 Better Stack Errors Sentry 호환 DSN (`https://$APPLICATION_TOKEN@$INGESTING_HOST/1`)
- `FRONT_BETTER_STACK_SENTRY_DSN` — 브라우저에서 사용하는 공개 DSN.

## 데이터베이스 마이그레이션

```bash
# 로컬
pnpm dev:db:migrate

# 프로덕션 (주의: 되돌릴 수 없음)
pnpm prod:db:migrate
```

## Cloudflare 리소스

| 리소스 | 바인딩 | 용도 |
|--------|--------|------|
| D1 Database | `DB` | 앱 데이터 |
| KV Namespace | `KV_SESSION` | 세션 저장 |
| KV Namespace | `KV_USERDATA` | 유저 캐시 데이터 |

## Cron 작업

`wrangler.jsonc`에 정의된 스케줄:
- `* * * * *` — 매분
- `*/10 * * * *` — 10분마다 (타임라인 동기화 실행)
- `0 * * * *` — 매시간

## 에셋 인프라 (별도 관리)

게임 이미지는 S3 → Cloudflare CDN 파이프라인으로 별도 관리:

```bash
# Go Lambda 빌드 (에셋 메타데이터 처리)
pnpm assets:build

# 인프라 계획 확인 (OpenTofu)
pnpm assets:plan

# 인프라 배포
pnpm assets:deploy
```

## Cloudflare Worker 타입 갱신

Cloudflare 바인딩 타입 재생성:
```bash
pnpm cf-typegen
```

## 로컬 개발

```bash
# HMR 지원 개발 서버 (권장)
pnpm dev

# Wrangler 기반 dev (Workers 환경 에뮬레이션)
pnpm start
```

## 주의사항

- 프로덕션 DB 마이그레이션은 스테이징에서 먼저 테스트
- 배포 전 `pnpm typecheck` 통과 확인
- Cron 작업이 실패해도 재시도 없음 — 10분 후 다시 실행됨
- D1은 SQLite 기반이므로 PostgreSQL 특유의 기능 사용 불가
