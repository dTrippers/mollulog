# BAQL API 가이드

BAQL은 Blue Archive 게임 데이터를 제공하는 GraphQL API. 소스: `~/Workspace/ruby/baql`

- 엔드포인트: `https://baql.mollulog.net/graphql`
- 개발 환경 오버라이드: `VITE_BAQL_URL` 환경 변수

## 클라이언트 설정

`app/lib/baql/index.ts` — urql 기반 클라이언트. 서버사이드 렌더링에서만 사용.

```typescript
import { runQuery } from "~/lib/baql";
```

## 코드젠 워크플로우

1. `app/**/*.{ts,tsx}` 파일에 `graphql(...)` 태그로 쿼리 정의
2. `pnpm codegen` 실행
3. `app/graphql/graphql.ts` 자동 갱신 (수동 수정 금지)

타입 매핑: `ISO8601DateTime` → `Date`, `ISO8601Date` → `any`

## 주요 쿼리 목록

### 콘텐츠 (이벤트/레이드 통합)

```graphql
# 이벤트 + 레이드 통합 목록
query Contents($untilAfter: ISO8601DateTime, $sinceBefore: ISO8601DateTime) {
  contents(untilAfter: $untilAfter, sinceBefore: $sinceBefore) {
    nodes {
      ... on Event { uid name startAt endAt type confirmed }
      ... on Raid { uid name startAt endAt type boss }
    }
  }
}
```

### 이벤트

```graphql
# 단일 이벤트
query EventDetail($uid: String!) {
  event(uid: $uid) {
    uid name type confirmed rerun endless imageUrl
    startAt endAt
    pickups { type studentName rerun student { uid name } }
    stages(difficulty: hard) { uid cost }
  }
}

# 이벤트 목록
query Events($untilAfter: ISO8601DateTime, $types: [String!]) {
  events(untilAfter: $untilAfter, types: $types) {
    nodes { uid name type startAt endAt confirmed }
  }
}
```

이벤트 `type` 값: `event`, `mini_event`, `guide_mission`, `immortal_event`, `pickup`, `fes`, `campaign`, `exercise`, `main_story`, `collab`, `update`, `battle_pass`

### 이벤트 콘텐츠 v2 (EventContent)

v2 모델은 normalized 구조. `runType`과 `region`으로 필터링.

```graphql
query EventContentDetail($uid: String!) {
  eventContent(uid: $uid) {
    uid name
    schedules { region startAt endAt runType confirmed }
    stages(runType: first) { uid name cost }
    bonuses(runType: first) { student { uid name } }
    shopResources(runType: first) { item { uid name } quantity cost }
    minigameConfigs(runType: first) { uid }
  }
}
```

`runType`: `first`, `rerun`, `permanent`
`region`: `jp`, `gl`, `cn`

### 학생

```graphql
query AllStudents {
  students {
    uid name school attackType defenseType role tacticRole position
    initialTier released order
    equipments
  }
}

query StudentDetail($uid: String!) {
  student(uid: $uid) {
    uid name altNames
    skillItems(skillType: normal, skillLevel: 10) {
      item { uid name } amount skillType skillLevel
    }
    favoriteItems(favorited: true) {
      item { uid name } exp favoriteLevel
    }
    pickups { type rerun since until }
    recruitments { uid startAt endAt recruitmentType }
  }
}
```

Enum 값:
- `attackType`: `normal`, `explosive`, `piercing`, `mystic`, `sonic`, `chemical`
- `defenseType`: 같은 값
- `role`: (학생별 상이)
- `tacticRole`: 전술 역할

### 레이드

```graphql
query RaidList($endAfter: ISO8601DateTime) {
  raids(endAfter: $endAfter) {
    nodes { uid name type boss terrain attackType defenseTypes confirmed }
  }
}

query RaidDetail($uid: String!) {
  raid(uid: $uid) {
    uid name boss type terrain attackType defenseTypes confirmed
    rankVisible raidIndexJp
    videos(first: 10, sortBy: SCORE_DESC) {
      nodes { uid title url publishedAt }
    }
  }
}
```

레이드 `type`: `total_assault`, `elimination`, `unlimit`

### 픽업/모집

```graphql
# v2 모집 그룹 (최신)
query RecruitmentGroups($endAfter: ISO8601DateTime) {
  recruitmentGroups(endAfter: $endAfter) {
    uid startAt endAt recruitmentType contentType contentUid
    recruitments {
      uid pickup studentName recruitmentType
      student { uid name school }
    }
  }
}
```

### 캠페인 (재화 드랍률)

```graphql
query Campaigns($region: String!, $endAfter: ISO8601DateTime) {
  campaigns(region: $region, endAfter: $endAfter) {
    uid region category multiplier startAt endAt
  }
}
```

`category`: `exp`, `commision`, `mission_normal`, `mission_hard`, `bounty_hunt`, `scrimmage`, `schedule`

### 메인 스토리

```graphql
query MainStories {
  mainStories {
    uid label name sortOrder
    chapters {
      uid name chapterNumber
      parts {
        uid name sortOrder episodeStart episodeEnd
        schedules { region releasedAt confirmed }
      }
    }
  }
}
```

### 종합전술시험

```graphql
query JointFiringDrills($endAfter: ISO8601DateTime) {
  jointFiringDrills(endAfter: $endAfter) {
    uid season drillType terrain defenseType confirmed
    schedules { region startAt endAt }
  }
}
```

### 미니 이벤트

```graphql
query MiniEventContents($region: String!, $endAfter: ISO8601DateTime) {
  miniEventContents(region: $region, endAfter: $endAfter) {
    uid name
    schedules { region occurrence startAt endAt }
  }
}
```

## 자주 쓰는 패턴

### Route Loader에서 에러 처리

```typescript
export async function loader({ params }: LoaderFunctionArgs) {
  const { data, error } = await runQuery(eventDetailQuery, { uid: params.uid });
  if (error) {
    console.error("BAQL error:", error);
    throw new Response("Failed to fetch", { status: 503 });
  }
  if (!data?.event) throw new Response("Not Found", { status: 404 });
  return { event: data.event };
}
```

### 캐싱과 함께 사용

```typescript
export async function loader({ context }: LoaderFunctionArgs) {
  const data = await fetchCached(context.cloudflare.env, "raids-list", async () => {
    const { data } = await runQuery(raidListQuery, {});
    return data?.raids.nodes ?? [];
  }, 60 * 60); // 1시간 캐시
  return { raids: data };
}
```

### 타임라인 동기화 (Background Job)

백그라운드 크론 작업에서 BAQL을 직접 쿼리하여 `timeline_contents` 테이블 갱신:

```typescript
// app/jobs/sync-timeline-contents.ts
await runQuery(contentsForSync, { endAfter: new Date() });
```

## 주요 타입 참고

| GraphQL 타입 | 설명 |
|---|---|
| `ContentInterface` | Event와 Raid의 공통 인터페이스 |
| `Event` | 이벤트 (ContentInterface 구현) |
| `Raid` | 레이드 (ContentInterface 구현) |
| `EventContent` | v2 이벤트 모델 |
| `Student` | 학생 캐릭터 |
| `Pickup` | v1 픽업 (deprecated, Recruitment 사용 권장) |
| `RecruitmentGroup` | v2 모집 그룹 |
| `Recruitment` | v2 개별 모집 항목 |
| `Campaign` | 재화 드랍률 캠페인 |
| `JointFiringDrill` | 종합전술시험 |
| `MiniEventContent` | 미니 이벤트 |
| `MainStoryVolume` | 메인 스토리 |
| `Item`, `Currency`, `Equipment` | 게임 아이템 (ResourceInterface) |

## BAQL v2 마이그레이션

현재 `feature/baql-2.0` 브랜치에서 진행 중. v2 변경사항:

- `since`/`until` 대신 `startAt`/`endAt` 사용 (deprecated 경고 있음)
- `EventContent` 타입으로 이벤트 데이터 접근 (stages, bonuses, shopResources, minigameConfigs)
- `RecruitmentGroup`/`Recruitment` 타입으로 픽업 데이터 접근
- `Pickup` 타입은 하위 호환성을 위해 유지되나 신규 코드에서는 사용 지양
