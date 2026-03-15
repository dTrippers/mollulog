# BAQL API 가이드

BAQL은 Blue Archive 게임 데이터를 제공하는 GraphQL API.

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
| `Raid` | 레이드 (총력전/대결전/제약해제결전/연합작전) |
| `EventContent` | 이벤트 모델 |
| `Student` | 학생(캐릭터) |
| `RecruitmentGroup` | 학생 모집(가챠) 그룹 |
| `Recruitment` | 개별 학생 모집(가챠) 항목 |
| `Campaign` | 재화 드랍률 캠페인 |
| `JointFiringDrill` | 종합전술시험 |
| `MiniEventContent` | 미니 이벤트 |
| `MainStoryVolume` | 메인 스토리 |
| `Item`, `Currency`, `Equipment`, `Furniture` | 게임 아이템 (ResourceInterface) |
