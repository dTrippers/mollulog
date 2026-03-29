# 데이터베이스 가이드

## 스택

- **DB**: Cloudflare D1 (SQLite 호환)
- **ORM**: Drizzle ORM
- **마이그레이션**: `db/migrations/` 디렉토리의 SQL 파일

## 주요 테이블

### 사용자

| 테이블 | 설명 |
|--------|------|
| `senseis` | 사용자 계정 (id, uid, username, friendCode, googleId, profileStudentId, active) |
| `sensei_privacies` | 사용자 비공개 정보 (userId, memberCode) |
| `followerships` | 팔로우 관계 (followerId, followeeId) |
| `user_activities` | 활동 로그 (uid, userId, activityType, payload) |
| `passkeys` | WebAuthn 인증 정보 |

### 게임 기록

| 테이블 | 설명 |
|--------|------|
| `recruited_students` | 보유 학생 목록 |
| `parties` | 파티 구성 |
| `pickup_histories` | 픽업 이력 |
| `student_grading_systems` | 학생 평가/별점 |
| `user_relationship_levels` | 학생 관계 레벨 |

### 이벤트/콘텐츠

| 테이블 | 설명 |
|--------|------|
| `timeline_contents` | 사이트에서 보여줄 컨텐츠 및 메타 데이터 목록. BAQL의 Event, MainStory, RecruitmentGroup의 레퍼런스 키를 가짐 |
| `event_shop_states` | 사용자의 이벤트 상점 상태 (구매할 아이템, 목표 재화 수집량 등) |
| `content_favorite_students` | 관심 학생 |
| `content_favorite_counts` | 관심 학생 통계 |
| `content_comments` | 콘텐츠 의견 |

### 플래너

| 테이블 | 설명 |
|--------|------|
| `pyroxene_planner_options` | 청휘석 플래너 메타 설정값 |
| `pyroxene_event_data` | 청휘석 플래너 이벤트별 설정값 (모집 목표, 완료 여부 등) |

### 기타

| 테이블 | 설명 |
|--------|------|
| `posts` | 공지사항 게시물 |
| `feedback_submissions` | 버그 제보/기능 제안 제출 |
| `coupons` | 게임 쿠폰 |
| `coupon_registrations` | 사용자별 게임 쿠폰 등록 기록 |

## 마이그레이션 추가

1. `db/migrations/` 에 새 SQL 파일 추가 (순서 번호 사용)
   ```
   db/migrations/0024_your_migration_name.sql
   ```

2. 로컬 적용:
   ```bash
   pnpm dev:db:migrate
   ```

3. 프로덕션 적용:
   ```bash
   pnpm prod:db:migrate
   ```

## Drizzle ORM 사용 패턴

스키마 정의는 `app/models/` 또는 관련 모델 파일 참고.

```typescript
import { drizzle } from "drizzle-orm/d1";

// loader 또는 action에서
const db = drizzle(context.cloudflare.env.DB);

// 조회
const users = await db.select().from(senseis).where(eq(senseis.uid, uid));

// 삽입
await db.insert(parties).values({ userId: sensei.id, name: "My Party" });

// 업데이트
await db.update(senseis).set({ username }).where(eq(senseis.id, id));

// 삭제
await db.delete(followerships).where(eq(followerships.followerId, id));
```

## 로컬 개발 DB

```bash
# 로컬 DB 초기화 (마이그레이션 적용)
pnpm dev:db:migrate
```

## 원격 D1 데이터를 로컬로 덮어쓰기

```bash
# 프로덕션 D1 export 후 로컬 DB 덮어쓰기
pnpm prod:db:pull

# 스테이징 D1 export 후 로컬 DB 덮어쓰기
pnpm staging:db:pull
```

- 원격 D1을 SQL로 export한 뒤 로컬 D1 상태 디렉터리를 비우고 다시 import합니다.
- export 파일은 `tmp/` 아래에 생성되고, 실행 후 `.wrangler/state/v3/d1/miniflare-D1DatabaseObject` 아래 로컬 DB가 원격 기준으로 재생성됩니다.
- 로컬 DB 데이터는 완전히 덮어써지므로 필요하면 실행 전에 별도 백업이 필요합니다.

## 중요 주의사항

- D1은 SQLite 기반이므로 JSON 컬럼은 TEXT로 저장 후 파싱 필요
- 트랜잭션 지원이 제한적 (D1 특성)
- 마이그레이션은 단방향 (롤백 스크립트 별도 작성 필요)
- 프로덕션 마이그레이션 전에 반드시 스테이징에서 테스트
