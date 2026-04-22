# BAQL API 가이드

이 문서는 BAQL GraphQL 조회를 몰루로그 코드베이스 안에서 어떻게 다루는지 정리합니다.
쿼리 목록을 유지하기보다, 조회 위치와 codegen 규칙을 설명하는 데 집중합니다.

## 기본 정보

- 기본 엔드포인트: `https://baql.mollulog.net/graphql`
- 개발 환경 override: `VITE_BAQL_URL`
- 공통 실행 함수: `app/lib/baql/index.ts` 의 `runQuery`

## 쿼리 작성 규칙

- GraphQL 쿼리는 `app/**/*.{ts,tsx}` 안에서 `graphql(...)` 로 정의합니다.
- 쿼리를 추가하거나 수정한 뒤에는 반드시 `pnpm codegen` 을 실행합니다.
- `app/graphql/` 아래 생성 파일은 직접 수정하지 않습니다.

현재 codegen 산출물은 아래 디렉터리에 모입니다.

- `app/graphql/gql.ts`
- `app/graphql/graphql.ts`
- `app/graphql/fragment-masking.ts`

## 타입 규칙

- codegen이 만들어준 타입 추론을 우선 사용합니다.
- 결과 shape를 route나 component에서 다시 손으로 타입 선언하지 않습니다.
- 현재 scalar 매핑에서 `ISO8601DateTime` 은 `Date` 로 취급합니다.

## 조회 위치 규칙

- route 안에서 한 번만 쓰는 단순 조회는 해당 route에서 직접 사용할 수 있습니다.
- 여러 화면이 공유하는 조회이거나 캐시 정책이 붙는다면 `models` 또는 `repositories` 로 올립니다.
- 새 cross-cutting BAQL orchestration은 `app/repositories` 를 우선 검토합니다.

## loader 패턴

```ts
export async function loader({ params }: LoaderFunctionArgs) {
  const { data, error } = await runQuery(query, { uid: params.uid! });

  if (error) {
    throw new Response("Failed to fetch", { status: 503 });
  }

  if (!data?.event) {
    throw new Response("Not Found", { status: 404 });
  }

  return { event: data.event };
}
```

- BAQL 오류와 데이터 부재를 구분해서 처리합니다.
- UI가 반복적으로 쓰는 조회는 route 안에 그대로 두지 않습니다.

## 캐싱 규칙

- BAQL 조회 결과를 재사용해야 하면 `fetchCached` 패턴을 사용합니다.
- 캐시 전략은 route보다 조회 책임이 있는 모델/리포지토리 쪽에 둡니다.
- 강제 갱신이 필요한 크론/백그라운드 작업은 `forceRefresh` 패턴을 사용합니다.

## 백그라운드 작업

- Worker 크론은 `workers/app.ts` 에서 분기합니다.
- BAQL 기반의 동기화 작업은 `app/jobs/` 와 `models`/`repositories` 조합으로 처리합니다.
- 대표 예시는 `app/jobs/sync-timeline-contents.ts` 입니다.

## 체크리스트

1. 쿼리를 `graphql(...)` 로 정의했는가
2. `pnpm codegen` 을 실행했는가
3. 생성 타입을 그대로 활용하고 있는가
4. 재사용되는 조회를 route 안에 고정하지 않았는가
5. 캐시 책임이 route가 아니라 조회 계층에 있는가
