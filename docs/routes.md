# 라우트 구조

React Router v7 파일시스템 라우팅. `app/routes/` 의 파일명 규칙:

- `_index.tsx` — 부모 경로의 인덱스
- `$param` — URL 파라미터
- `_layout` — 레이아웃 래퍼 (URL에 포함 안 됨)
- `.` → `/` (파일명의 점이 URL 슬래시로 변환)

## 공개 페이지

| 파일 | URL | 설명 |
|------|-----|------|
| `_index.tsx` | `/` | 홈 (현재 이벤트, 레이드, 픽업) |
| `community.tsx` | `/community` | 커뮤니티 타임라인 (현재 학생 평가, 이벤트 의견 노출) |
| `futures.tsx` | `/futures` | 미래시 타임라인 |
| `students._index.tsx` | `/students` | 학생 목록 |
| `students.gradings.tsx` | `/students/gradings` | 학생 평가 목록 진입점. 현재 `/community?type=student_review`로 리다이렉트 |
| `students.$id._index.tsx` | `/students/:id` | 학생 상세 |
| `students.$id.grade.tsx` | `/students/:id/grade` | 학생 평가 |
| `raids._index.tsx` | `/raids` | 레이드(총력전/대결전) 목록 (→ 최신 레이드로 리다이렉트) |
| `raids.$id.tsx` | `/raids/:id` | 레이드 레이아웃 |
| `raids.$id._index.tsx` | `/raids/:id` | 레이드 개요 |
| `raids.$id.ranks.tsx` | `/raids/:id/ranks` | 레이드 랭킹 |
| `raids.$id.statistics.tsx` | `/raids/:id/statistics` | 레이드 통계 |
| `raids.$id.videos.tsx` | `/raids/:id/videos` | 레이드 공략 영상 |
| `raids.$id.compare.tsx` | `/raids/:id/compare` | 동일 보스에 대한 레이드 비교 |
| `events.$uid.tsx` | `/events/:uid` | 이벤트 레이아웃 |
| `events.$uid._index.tsx` | `/events/:uid` | 이벤트 개요 |
| `events.$uid.shop.tsx` | `/events/:uid/shop` | 이벤트 상점 플래너 |
| `mainstory.tsx` | `/mainstory` | 메인 스토리 |
| `news.tsx` | `/news` | 뉴스/공지 |
| `contact.tsx` | `/contact` | 문의/피드백 |
| `coupons.tsx` | `/coupons` | 쿠폰 목록 |
| `[sitemap.xml].tsx` | `/sitemap.xml` | SEO 사이트맵 |

## 유저 프로필

| 파일 | URL | 설명 |
|------|-----|------|
| `$username.tsx` | `/@/:username` | 유저 레이아웃 |
| `$username._index.tsx` | `/@/:username` | 유저 메인 프로필 |
| `$username.students.tsx` | `/@/:username/students` | 보유 학생 |
| `$username.parties._index.tsx` | `/@/:username/parties` | 파티 목록 |
| `$username.parties.edit.$id.tsx` | `/@/:username/parties/edit/:id` | 파티 편집 |
| `$username.pickups._index.tsx` | `/@/:username/pickups` | 픽업 이력 |
| `$username.pickups.edit.$id.tsx` | `/@/:username/pickups/edit/:id` | 픽업 편집 |
| `$username.futures.tsx` | `/@/:username/futures` | 미래 콘텐츠 뷰 |
| `$username.friends.tsx` | `/@/:username/friends` | 팔로우/팔로워 |

## 설정 (인증 필요)

| 파일 | URL | 설명 |
|------|-----|------|
| `my.tsx` | `/my` | 내 대시보드 |
| `edit._index.tsx` | `/edit` | 편집 허브 |
| `edit.profile.tsx` | `/edit/profile` | 프로필 설정 |
| `edit.security.tsx` | `/edit/security` | 보안 설정 |
| `edit.passkey.tsx` | `/edit/passkey` | Passkey 레이아웃 |
| `edit.passkey._index.tsx` | `/edit/passkey` | Passkey 목록 |
| `edit.passkey.$uid.tsx` | `/edit/passkey/:uid` | Passkey 상세 |

## 인증

| 파일 | URL | 설명 |
|------|-----|------|
| `auth.google.signin.tsx` | `/auth/google/signin` | Google 로그인 시작 |
| `auth.google.callback.tsx` | `/auth/google/callback` | Google OAuth 콜백 |
| `auth.passkey.signin.tsx` | `/auth/passkey/signin` | Passkey 로그인 |
| `auth.passkey.register.tsx` | `/auth/passkey/register` | Passkey 등록 |
| `register.tsx` | `/register` | 회원가입 |
| `signout.tsx` | `/signout` | 로그아웃 |
| `unauthorized.tsx` | `/unauthorized` | 미인증 오류 |

## API 라우트

| 파일 | URL | 메서드 | 설명 |
|------|-----|--------|------|
| `api.contents.tsx` | `/api/contents` | POST | 콘텐츠 즐겨찾기 |
| `api.contents.$uid.comments.tsx` | `/api/contents/:uid/comments` | POST/DELETE | 댓글 |
| `api.community.posts.$uid.comments.tsx` | `/api/community/posts/:uid/comments` | GET/POST | 커뮤니티 댓글 |
| `api.community.posts.$uid.likes.tsx` | `/api/community/posts/:uid/likes` | GET/POST | 커뮤니티 좋아요 |
| `api.preference.tsx` | `/api/preference` | POST | 사용자 설정 |
| `api.followerships.tsx` | `/api/followerships` | POST/DELETE | 팔로우 |
| `api.students.$uid.items.tsx` | `/api/students/:uid/items` | POST | 학생 아이템 추적 |
| `api.events.$eventUid.shop-state.tsx` | `/api/events/:eventUid/shop-state` | POST | 이벤트 상점 상태 |
| `api.caches.$command.tsx` | `/api/caches/:command` | GET | 캐시 관리 |

## 커뮤니티 관련 메모

- `/community`는 `community_posts` 기반의 SNS형 피드다.
- 현재 커뮤니티 페이지 노출 대상은 `student_review`, `event_opinion` 두 타입이다.
- `guide` 타입 공략글은 같은 `community_posts` 계층에 저장되지만 현재 `/community`에서는 숨김 처리되어 있다.
- `/students/gradings`는 별도 목록 화면이 아니라 커뮤니티 학생 평가 필터 화면으로 연결된다.
- 이벤트 상세/미래시의 의견 UI는 레거시 `content_comments` 인터페이스를 유지하지만, 내부 저장소는 `community_posts` / `community_comments`를 사용한다.
- 프로필의 `/@/:username/parties` 화면은 여전히 유지되지만, 내부 저장소는 `community_posts(postType='guide')`이다.

## 유틸리티

| 파일 | URL | 설명 |
|------|-----|------|
| `utils.growth.tsx` | `/utils/growth` | 성장 플래너 레이아웃 |
| `utils.growth._index.tsx` | `/utils/growth` | `/utils/growth/students`로 리다이렉트 |
| `utils.growth.students.tsx` | `/utils/growth/students` | 학생 성장/재화 플래너 |
| `utils.pyroxene.tsx` | `/utils/pyroxene` | 파이록신 계획 도구 |
| `utils.raidscore.tsx` | `/utils/raidscore` | 레이드 점수 계산 |
| `utils.relationship.tsx` | `/utils/relationship` | 관계 추적 도구 |
| `raids.data.$id.videos.tsx` | `/raids/data/:id/videos` | 레이드 영상 데이터 API |

## 라우트 작성 컨벤션

### 화면 조립 위치

- 라우트 파일은 `loader`, `action`, `meta`, 파라미터 처리, 상위 화면 조립까지만 담당한다.
- 한 화면에서만 쓰는 UI 조각은 같은 라우트 패밀리의 `._components` 또는 `/_components` 디렉터리로 분리한다.
- 라우트 전용 훅도 재사용되지 않으면 같은 route-local 디렉터리에 둔다.
- 여러 라우트에서 재사용되는 도메인 UI는 `app/components/features/<domain>`로 올리고, 범용 UI는 `app/components/primitives`를 사용한다.

예시:

- `app/routes/students.$id._components/*`
- `app/routes/events.$uid._components/*`
- `app/routes/raids.$id._components/*`
- `app/routes/$username.parties._components/*`

### 인증이 필요한 라우트

```typescript
export async function loader({ request, context }: LoaderFunctionArgs) {
  const sensei = await authenticator.isAuthenticated(request);
  if (!sensei) return redirect("/");
  // ...
}
```

### 메타 태그

```typescript
export function meta({ data }: MetaArgs<typeof loader>) {
  return [
    { title: `${data?.name} | MolluLog` },
    { name: "description", content: data?.description },
  ];
}
```

### 중첩 라우트 레이아웃

레이아웃 파일 (예: `raids.$id.tsx`)은 `<Outlet />`을 포함해야 함:

```typescript
export default function RaidLayout() {
  const { raid } = useLoaderData<typeof loader>();
  return (
    <div>
      <RaidHeader raid={raid} />
      <Outlet />
    </div>
  );
}
```
