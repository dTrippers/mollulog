# 데이터베이스 가이드

이 문서는 테이블 전체 목록을 나열하지 않습니다.
대신 D1/Drizzle 기반의 모델링 규칙, canonical 저장소 원칙, 마이그레이션 절차만 정리합니다.

## 기본 스택

- DB: Cloudflare D1
- ORM: Drizzle ORM
- 마이그레이션: `db/migrations/*.sql`
- 운영성 쿼리: `db/operations/*.sql`

## 모델 정의 위치

몰루로그는 중앙 `schema.ts` 파일 하나를 두기보다, 테이블 정의와 도메인 로직을 `app/models/*.ts` 에 분산해 둡니다.

예:

- `sqliteTable(...)` 정의
- D1 조회/삽입/수정 함수
- 캐시와 결합된 읽기 로직

새 DB 작업은 보통 아래 흐름으로 진행합니다.

1. `db/migrations` 에 SQL 추가
2. 관련 `app/models/*.ts` 에 테이블/함수 추가
3. route, feature, repository에서 해당 모델 사용

단, 스키마 변경이 아니라 특정 운영 데이터 보정, 검증, 재집계처럼 사람이 명시적으로 실행해야 하는 SQL은
`db/migrations` 가 아니라 `db/operations` 에 둡니다.

## 네이밍과 책임 분리

- 테이블 변수는 보통 `*Table` suffix를 사용합니다.
- DB 접근 함수는 도메인 의도가 드러나는 이름을 사용합니다.
- route에서 직접 SQL 성격의 분기를 늘리기보다 `models` 또는 `repositories` 로 내립니다.
- 새 canonical 저장소가 이미 정해진 영역에는 레거시 테이블을 다시 확장하지 않습니다.

## Drizzle 사용 패턴

```ts
import { drizzle } from "drizzle-orm/d1";

export async function getSomething(env: Env) {
  const db = drizzle(env.DB);
  return db.select();
}
```

- `loader`/`action` 에서 바로 긴 DB 로직을 작성하기보다 모델 함수로 분리합니다.
- 정렬과 필터는 가능하면 DB 레벨에서 처리합니다.
- D1 특성을 고려해 한 번에 너무 큰 쿼리나 과도한 `IN` 절을 만들지 않도록 주의합니다.

## 운영성 쿼리

`db/operations` 는 schema migration 체인에 포함하지 않는 운영성 SQL을 둡니다.

예:

- 특정 배포 순서 이후 1회 실행하는 copy-only 데이터 보정
- 운영 데이터 검증 또는 집계 쿼리
- 자동 migration으로 묶기 어려운 수동 복구 쿼리

운영성 쿼리는 `pnpm dev:db:migrate` 나 `pnpm prod:db:migrate` 로 실행하지 않습니다.
실행이 필요한 경우 `wrangler d1 execute` 처럼 목적과 대상 환경이 드러나는 명령으로 직접 실행합니다.
파일 상단에는 실행 조건, 재실행 가능 여부, migration이 아니라는 점을 주석으로 남깁니다.

## 마이그레이션 절차

### 마이그레이션 파일명

새 마이그레이션 파일은 `yyyymmddhhmmss_{name}.sql` 형식을 사용합니다.

- 예: `20260429003526_rename_unused_tables_with_zzz_prefix.sql`
- 연도는 4자리로 씁니다.
- 여러 사람이 동시에 contribution할 때도 초 단위 timestamp로 정렬 충돌 가능성을 줄입니다.
- 기존의 `0001_...` 형식 파일은 유지하되, 새 파일부터 날짜 기반 규칙을 따릅니다.

### 로컬 적용

```bash
pnpm dev:db:migrate
```

### 프로덕션 적용

```bash
pnpm prod:db:migrate
```

### 프로덕션 D1을 로컬로 가져오기

```bash
pnpm prod:db:pull
```

이 명령은 원격 D1을 export한 뒤 로컬 상태를 덮어씁니다.
로컬 데이터를 유지해야 한다면 실행 전 별도 백업이 필요합니다.

## 주의사항

- D1은 SQLite 기반이므로 데이터 타입과 SQL 기능 차이를 고려합니다.
- 마이그레이션은 기본적으로 단방향으로 관리합니다.
- 큰 구조 변경은 먼저 staging 또는 로컬 복제본에서 검증합니다.
- 문서에는 전체 테이블 목록을 유지하지 않습니다. 정확한 현재 상태는 `db/migrations/` 와 `app/models/` 를 기준으로 확인합니다.
