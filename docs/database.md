# 데이터베이스 가이드

이 문서는 테이블 전체 목록을 나열하지 않습니다.
대신 D1/Drizzle 기반의 모델링 규칙, canonical 저장소 원칙, 마이그레이션 절차만 정리합니다.

## 기본 스택

- DB: Cloudflare D1
- ORM: Drizzle ORM
- 마이그레이션: `db/migrations/*.sql`

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

## 네이밍과 책임 분리

- 테이블 변수는 보통 `*Table` suffix를 사용합니다.
- DB 접근 함수는 도메인 의도가 드러나는 이름을 사용합니다.
- route에서 직접 SQL 성격의 분기를 늘리기보다 `models` 또는 `repositories` 로 내립니다.
- 새 canonical 저장소가 이미 정해진 영역에는 레거시 테이블을 다시 확장하지 않습니다.

## canonical 저장소 원칙

### 커뮤니티

- 사용자 작성 콘텐츠의 canonical 저장소는 `community_*` 계층입니다.
- 학생 평가, 이벤트 의견, 공략글은 저장 테이블을 새로 나누기보다 canonical 모델 안에서 타입으로 구분합니다.
- 예전 테이블이 남아 있어도 새 기능의 기준은 canonical 저장소입니다.

### 기타 도메인

- 같은 책임의 데이터를 중복 테이블에 동시에 저장하지 않습니다.
- 새 기능을 만들 때는 "현재 런타임이 실제로 참조하는 저장소"를 먼저 확인합니다.

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

## 마이그레이션 절차

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
