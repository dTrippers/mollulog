# 라우트 가이드

이 문서는 라우트 파일을 전부 나열하지 않습니다.
라우트는 자주 변하므로, 오래 유지되는 파일명 규칙과 책임 분리에만 집중합니다.

## 파일명 규칙

몰루로그는 React Router flat routes를 사용합니다.

- `.` 은 URL의 `/` 로 변환됩니다.
  - 예: `students.$id.grade.tsx` → `/students/:id/grade`
- `_index.tsx` 는 부모 경로의 인덱스 라우트입니다.
  - 예: `students._index.tsx` → `/students`
- `$param` 은 URL 파라미터입니다.
  - 예: `events.$uid.tsx` → `/events/:uid`
- 부모 레이아웃 라우트는 같은 prefix의 파일이 담당합니다.
  - 예: `raids.$raidType.$seasonIndex.tsx` 가 레이아웃, 그 아래 `...statistics.tsx`, `...videos.tsx` 가 자식 라우트입니다.

정확한 현재 라우트 목록이 필요하면 `app/routes/` 디렉터리를 직접 확인합니다.
문서에는 전체 목록을 유지하지 않습니다.

## 라우트 파일의 책임

라우트 파일은 아래 역할까지만 맡는 것을 기본으로 합니다.

- `loader`
- `action`
- 파라미터 해석
- 접근 제어
- `meta`
- 상위 화면 조립

반대로 아래는 라우트 파일 안에 오래 쌓아두지 않는 편이 좋습니다.

- 큰 화면 조각
- 한 화면에서만 쓰는 클라이언트 훅
- 반복 렌더링 블록
- 도메인 재사용 UI
- 여러 데이터 소스 합성과 캐시 정책 (→ `app/views`)

데이터 합성은 라우트가 아니라 `app/views` 함수에 맡깁니다. loader는 뷰 함수 하나를 호출하는 정도로 얇게 유지합니다.

## route-local 구성 규칙

한 라우트 또는 라우트 패밀리에서만 쓰는 코드는 라우트 옆에 둡니다.

- `app/routes/<route>._components/*`
- `app/routes/<route>/_components/*`

사용 기준은 아래와 같습니다.

- 한 화면에서만 쓰는 UI 조각이면 route-local
- 해당 라우트 전용 훅이면 route-local
- 여러 라우트에서 재사용되면 `app/components/features/<domain>` 으로 승격

## 인증 패턴

인증이 필요한 라우트는 `loader` 와 `action` 양쪽에서 직접 검사합니다.

```ts
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const sensei = await getAuthenticator(env).isAuthenticated(request);
  if (!sensei) {
    return redirect("/unauthorized");
  }
}
```

- 읽기 제한이 있는 페이지는 `loader` 에서 막습니다.
- 쓰기 액션은 `action` 에서 다시 검사합니다.
- 클라이언트 조건부 렌더링만으로 권한을 대신하지 않습니다.

## 부모/자식 라우트 데이터 공유

- 부모에서 이미 읽은 데이터를 자식이 다시 불러오지 않도록 우선 설계합니다.
- 부모 레이아웃이 공통 데이터를 가진다면 `Outlet context` 또는 route 구조 재조정으로 해결합니다.
- `shouldRevalidate` 는 성능 최적화가 필요한 화면에서만 명시적으로 둡니다.

## 메타 태그 규칙

- 이동 가능한 화면은 기본적으로 `meta` 를 둡니다.
- 제목과 설명은 route 데이터 기준으로 계산합니다.
- 제목 문자열은 한국어 사용자 경험을 우선합니다.

```ts
export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.title ? `${data.title} | 몰루로그` : "몰루로그" },
];
```

## API 라우트 규칙

- 내부 API 라우트는 `api.` prefix를 사용합니다.
- 가능하면 route 수준의 얇은 입력 검증과 응답 조립만 두고, 실제 로직은 `views` 또는 `models` 로 내립니다.
- 캐시 flush, 좋아요, 댓글, 설정 저장처럼 브라우저 상호작용에 직접 연결되는 엔드포인트를 여기에 둡니다.

## 네이밍 기준

- URL 구조가 먼저 보이도록 파일명을 짓습니다.
- 축약보다 의미가 드러나는 파라미터 이름을 선호합니다.
  - 예: `$raidType`, `$seasonIndex`, `$uid`
- route-local 디렉터리 이름은 해당 라우트 prefix를 그대로 따릅니다.

## 체크리스트

새 라우트를 만들기 전에 아래를 확인합니다.

1. 이 기능이 새 라우트가 필요한가, 기존 route-local 분리로 충분한가
2. 인증 검사가 `loader`/`action` 에 모두 필요한가
3. 메타 태그가 필요한 화면인가
4. 큰 화면 조각을 route-local 로 분리해야 하는가
5. 자식 라우트가 부모 데이터를 중복 조회하지 않는가
