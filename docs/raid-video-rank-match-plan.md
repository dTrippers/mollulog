# 구현서: 몰루로그 공략 영상 목록에 파티 편성 표시

## 배경

`baql-ranks`(`~/Workspace/baql-ranks/main`)에 `/v1/videos` 응답의 `rankMatch`에 매칭된 랭킹 파티 편성(`parties`)을 포함시키는 백엔드 작업이 완료됐다 (커밋 안 됨, 워킹 디렉터리에 diff로 존재). 이 문서는 몰루로그(`~/Workspace/mollulog/main`) 프론트엔드에서 이 데이터를 소비하는 부분의 구현 계획이다. **아직 프론트 코드는 전혀 수정하지 않았다** — 아래는 순수 계획서다.

## 이미 확정된 의사결정 (재논의 불필요)

1. **진행 시점**: 지금 바로 프론트 구현 (백엔드 매칭률 개선은 별도/나중에 진행)
2. **파티 표시 방식**: 매칭된 영상 카드에서
   - 파티가 있으면 **1편성만 기본 표시**하고 "N개 편성 더 보기" 버튼으로 확장
   - 매칭은 됐는데 파티 데이터가 없는 엣지케이스면 "편성 정보가 없어요" 표시
   - 카드 레이아웃/높이는 일관되게 유지 (매칭 카드들끼리 party 영역이 있다 없다로 들쭉날쭉하지 않게)
3. **배지/기록 문구**: "공식 기록 · 최종 N위" (시즌 종료 후, `finalRank > 0`) / "공식 기록 · 실시간 N위" (진행 중) — 지난 턴에 이미 결정, 적용했다가 롤백된 로직이므로 재사용 가능

## baql-ranks 쪽 실제 응답 형태 (구현된 백엔드 기준)

`GET /v1/videos` 응답의 각 video 객체:

```json
{
  "youtubeId": "...",
  "title": "...",
  "channelTitle": "...",
  "thumbnailUrl": "...",
  "publishedAt": "...",
  "raidType": "total_assault",
  "boss": "drumbarka",
  "defenseType": "special",
  "score": 39480562,
  "rankMatch": {
    "raidType": "total_assault",
    "season": 89,
    "defenseType": "special",
    "rank": 123,
    "finalRank": 123,
    "parties": [
      {
        "students": [
          { "uid": "10085", "level": 90, "tier": 5, "weaponTier": 4, "isAssist": false },
          null, null, null, null, null
        ]
      }
    ]
  }
}
```

- `rankMatch`는 매칭 안 되면 필드 자체가 없음 (`omitempty`)
- `rankMatch.parties`는 매칭된 rank entry에 저장된 party 데이터가 없으면 없음 (`omitempty`) — 이게 "매칭은 됐는데 파티 없음" 엣지케이스
- 각 party의 `students`는 항상 6슬롯, 빈 슬롯은 `null`
- 실측 데이터 기준 매칭률은 낮음 (drumbarka 보스 52건 중 11건, ~21%) — 대부분의 카드는 `rankMatch` 자체가 없는 상태로 렌더링됨을 전제로 설계할 것

## 참고: 이미 존재하는 유사 기능 (재사용 대상)

`/v1/ranks` 프로토콜은 이미 파티를 이런 형태로 프론트에 내려주고 있고, 몰루로그는 이미 이걸 렌더링하는 컴포넌트/변환 로직을 갖고 있다. **새로 만들지 말고 아래를 그대로 재사용/추출해서 쓸 것.**

- `app/lib/ranks/ranks.ts`
  - `ParsedRaidRankDocument` 타입 (파일 상단, `parties: { partyIndex, slots: [{slotIndex, tier, level, isAssist, studentUid}] }[]` 형태) — video 쪽 파티도 이 타입으로 맞춰서 파싱하면 하위 컴포넌트를 그대로 재사용 가능
  - `convertTier(totalTier)` / 내부 `convertToTotalTier(tier, weaponTier)` — tier+weaponTier ↔ 합산 tier 변환. `convertToTotalTier`는 현재 export 안 되어 있음 → export 추가 필요
  - `convertServerRankToParsed`의 슬롯 변환 로직(파일 내 108~161행 부근)이 "raw student → slot" 변환의 참고 구현. video 쪽 JSON 슬롯 모양(`{uid, level, tier, weaponTier, isAssist} | null`)은 protobuf 디코드 결과(`ServerStudentSlot`)와 모양이 다르므로 그대로 재사용은 안 되고, **video 전용의 작은 변환 함수를 하나 추가**해야 함 (아래 작업 항목 참고)
- `app/components/features/raids/RaidPartyCard.tsx`
  - `visibleRowCount` prop이 이미 "N개만 보이고 나머지는 접기/펼치기" 기능을 구현해놓음 (`shouldCollapse`, "N개 편성 더 보기" 버튼 문구까지 이미 존재) → **`visibleRowCount={1}`로 그대로 재사용하면 이번에 결정된 UX 요구사항을 그대로 만족**
  - `emptyText` prop 기본값이 "편성 데이터가 없어요" — 요구사항 문구("편성 정보가 없어요")로 커스터마이징해서 사용
- `app/components/features/raids/RaidRankScreen.tsx`
  - `toRaidPartyRow()` 함수 (261~295행)와 `getMaxLevelAt()`/`maximumLevels` (36~57행)가 현재 이 파일에만 로컬로 있음. 영상 카드에서도 파티 행을 만들어야 하므로 **공용 모듈로 추출 필요** (아래 작업 항목 참고)

## 레이어링 규칙 (docs/architecture.md 기준)

- `app/domain`은 순수 계산만, UI 컴포넌트 타입을 import하면 안 됨 (컴포넌트가 domain을 참조하는 방향이 맞고 반대는 금지)
- `toRaidPartyRow`는 `RaidPartyRow`(컴포넌트 prop 타입)를 반환하는 함수라 `app/domain`이 아니라 **`app/components/features/raids/` 안에 유지**해야 함 (기존 코드도 이미 그렇게 되어 있었음 — 이 컨벤션을 따를 것)
- 참고로 현재 영상 라우트(`raids.$raidType.$seasonIndex.videos.tsx`)는 이미 `app/routes`에서 `~/lib/ranks`를 직접 호출하고 있어 "routes는 view를 통해서만 데이터 접근" 원칙과 어긋나 있음(기존부터 그랬음, 이번 작업 범위 아님) — 이 기존 패턴을 그대로 따라가고 레이어링을 새로 바로잡으려 하지 말 것 (스코프 벗어남)

## 작업 항목 (파일별)

### 1. `app/lib/ranks/ranks.ts`
- `convertToTotalTier` 함수에 `export` 추가
- 새 함수 export:
  ```ts
  export type RawPartySlotStudent = {
    uid?: string | null;
    level?: number | null;
    tier?: number | null;
    weaponTier?: number | null;
    isAssist?: boolean | null;
  } | null | undefined;

  export function convertRawPartySlot(
    slot: RawPartySlotStudent,
    slotIndex: number,
  ): ParsedRaidRankDocument["parties"][number]["slots"][number] {
    if (!slot || !slot.uid) {
      return { slotIndex, tier: null, level: null, isAssist: null, studentUid: null };
    }
    const totalTier = convertToTotalTier(Number(slot.tier || 0), slot.weaponTier ?? 0);
    return {
      slotIndex,
      tier: totalTier > 0 ? totalTier : null,
      level: slot.level ? Number(slot.level) : null,
      isAssist: slot.isAssist ?? false,
      studentUid: slot.uid || null,
    };
  }
  ```

### 2. `app/lib/ranks/videos.ts`
- `VideosApiResponse`의 video 항목에 `rankMatch` 추가:
  ```ts
  export type RankMatchApiResponse = {
    raidType?: string | null;
    season?: number | null;
    defenseType?: string | null;
    rank?: number | null;
    finalRank?: number | null;
    parties?: Array<{ students?: RawPartySlotStudent[] | null } | null> | null;
  };
  ```
  (`videos[].rankMatch?: RankMatchApiResponse | null` 필드 추가)
- `fetchRaidVideos`의 매핑부에서 `rankMatch` 변환 추가:
  ```ts
  rankMatch: video.rankMatch
    ? {
        rank: video.rankMatch.rank ?? 0,
        finalRank: video.rankMatch.finalRank ?? 0,
        parties: (video.rankMatch.parties ?? []).map((party, partyIndex) => ({
          partyIndex,
          slots: (party?.students ?? []).map((slot, slotIndex) => convertRawPartySlot(slot, slotIndex)),
        })),
      }
    : undefined,
  ```
- `import { convertRawPartySlot, type RawPartySlotStudent } from "./ranks";` 추가

### 3. `app/models/raid-videos.ts`
- `RaidVideoItem`에 필드 추가:
  ```ts
  import type { ParsedRaidRankDocument } from "~/lib/ranks/ranks";

  export type RaidVideoRankMatch = {
    rank: number;
    finalRank: number;
    parties: ParsedRaidRankDocument["parties"];
  };

  export type RaidVideoItem = {
    // ...기존 필드
    rankMatch?: RaidVideoRankMatch;
  };
  ```

### 4. `app/components/features/raids/toRaidPartyRow.ts` (신규 파일)
`RaidRankScreen.tsx`에서 아래 세 개를 그대로 옮겨오고, export 처리:
- `maximumLevels` 상수 (36~46행)
- `getMaxLevelAt(date: UtcIsoString | Date): number` 함수 (48~57행)
- `toRaidPartyRow({ party, allStudents, maxLevel })` 함수 (261~295행) — 파라미터 타입의 `allStudents`는 새 타입으로 명명해서 export:
  ```ts
  export type RaidPartyStudentInfo = {
    name: string;
    attackType: Attack;
    defenseType: Defense;
    role: Role;
  };
  export type RaidPartyStudentMap = Record<string, RaidPartyStudentInfo>;
  ```
필요한 import: `UtcIsoString`(`~/lib/date-time`), `ParsedRaidRankDocument`(`~/lib/ranks/ranks`), `Attack, Defense`(`~/graphql/graphql`), `Role`(`~/models/content.d`), `RaidPartyRow`(`./RaidPartyCard`)

그 다음 `RaidRankScreen.tsx`에서:
- 로컬 정의 제거하고 `import { getMaxLevelAt, toRaidPartyRow, type RaidPartyStudentMap } from "./toRaidPartyRow";` 로 교체
- `RaidRankScreenProps.allStudents` 타입을 `RaidPartyStudentMap`으로 교체 (구조는 동일하니 동작 변화 없음)

`app/components/features/raids/index.ts`에 필요시 export 추가 (다른 라우트에서 직접 import할 필요는 없어 보이나, 일관성을 위해 `RaidPartyStudentMap` 타입 정도는 export 고려)

### 5. `app/routes/raids.$raidType.$seasonIndex.videos.tsx`
현재 loader는 `RaidVideosData`를 바로 리턴하고 `useRaidVideosFeed`가 이를 그대로 소비한다. **`useRaidVideosFeed`와 `.data.$raidType.$seasonIndex.videos.tsx`(페이지네이션용 리소스 라우트)는 건드릴 필요 없음** — 학생 카탈로그는 최초 로드시에만 한 번 필요하고 무한스크롤 페이지네이션에는 필요 없음 (`RaidRankScreen`도 동일 패턴: `allStudents`는 라우트 loader에서 한 번, 랭킹 목록 자체는 컴포넌트 내부에서 별도 fetch).

변경:
```ts
import { getAllStudentsMap } from "~/models/student";
// ...

export const loader = async ({ params, request, context }: LoaderFunctionArgs) => {
  // ...기존 검증 로직 동일...

  const rawAllStudents = await getAllStudentsMap(env, true);
  const allStudents = Object.fromEntries(
    Object.entries(rawAllStudents).map(([uid, student]) => [
      uid,
      { name: student.name, attackType: student.attackType, defenseType: student.defenseType, role: student.role },
    ]),
  );

  const videoDateRange = await getVideoDateRange(env, currentRaid);
  if (!videoDateRange) {
    return { initialData: null, allStudents };
  }

  try {
    const initialData = await fetchRaidVideos({ /* 기존과 동일 */ });
    return { initialData, allStudents };
  } catch {
    throw createErrorResponse("공략 영상을 불러오는 중 오류가 발생했어요", 500);
  }
};

export default function RaidVideos() {
  const { currentRaid } = useOutletContext<RaidPageContext>();
  const { initialData, allStudents } = useLoaderData<typeof loader>();
  const { allVideos, hasMore, isLoading, loadingRef, sort, setSort } = useRaidVideosFeed({
    initialData,
    raidType: raidTypeToParam(currentRaid.raidType),
    seasonIndex: currentRaid.seasonIndex,
  });

  return (
    <RaidVideosScreen
      videos={allVideos}
      hasMore={hasMore}
      sort={sort}
      setSort={setSort}
      isLoading={isLoading}
      loadingRef={loadingRef}
      allStudents={allStudents}
      maxLevel={getMaxLevelAt(currentRaid.startAt ?? new Date().toISOString())}
    />
  );
}
```
(`getMaxLevelAt`은 항목 4에서 추출한 것을 import. `currentRaid.startAt`은 `ranks.tsx:129`에서 이미 같은 방식으로 쓰고 있음 — `RaidPageContext`의 `currentRaid` 타입에 존재 확인됨)

**주의**: `useLoaderData<typeof loader>()`의 반환 타입이 `RaidVideosData`(video 배열 직접)에서 `{ initialData, allStudents }`로 바뀌므로, `useRaidVideosFeed.ts`가 참조하는 `RaidVideosData` 타입 자체는 변경 없음 (그 타입은 `initialData` 안쪽 값이므로 그대로 사용). `useRaidVideosFeed`에 넘기는 `initialData` 인자만 `data.initialData`로 바뀐다.

### 6. `app/components/features/raids/RaidVideosScreen.tsx`
- `RaidVideosScreenProps`에 추가:
  ```ts
  import type { RaidPartyStudentMap } from "./toRaidPartyRow";
  import { toRaidPartyRow } from "./toRaidPartyRow";
  import RaidPartyCard from "./RaidPartyCard";
  import { OptionBadge } from "~/components/primitives"; // 배지용, 필요 여부는 아래 참고

  export type RaidVideosScreenProps = {
    // ...기존 필드
    allStudents: RaidPartyStudentMap;
    maxLevel: number;
  };
  ```
- `VideoCard`에 `allStudents`, `maxLevel` 전달, `rankMatch` 있을 때:
  - 순위 배지: "공식 기록 · 최종 N위" / "공식 기록 · 실시간 N위" (`rankMatch.finalRank > 0` 분기) — 지난 턴에 이미 구현했다가 롤백된 코드가 있으니 그 diff를 참고해도 됨 (`git diff` 히스토리엔 안 남아있음, 이 문서의 로직 설명으로 재현)
  - 파티 카드:
    ```tsx
    {rankMatch && (
      <RaidPartyCard
        primaryLabel={rankMatch.finalRank > 0 ? `최종 ${rankMatch.finalRank}위` : `실시간 ${rankMatch.rank}위`}
        rows={rankMatch.parties.map((party) => toRaidPartyRow({ party, allStudents, maxLevel }))}
        summaryItems={[]}
        visibleRowCount={1}
        emptyText="편성 정보가 없어요"
        popupIdPrefix={`video-${youtubeId}`}
        surface="default"
      />
    )}
    ```
  - 배치 위치: 기존 카드 구조(썸네일 → 제목/채널 → 점수/날짜) 중 어디에 넣을지는 UI 디테일이므로 구현자 재량. 다만 그리드 카드(`md:grid-cols-2 lg:grid-cols-3`)라 폭이 좁으므로 `RaidPartyCard`의 `lg:flex-row` 레이아웃은 실질적으로 항상 세로 스택으로 보일 것 — 로컬에서 브라우저로 실제 렌더링 확인 필수

## 검증 방법
- 이 저장소는 `docs/frontend/design.md`, `components.md` 컨벤션을 따라야 함 (CLAUDE.md 지시)
- 구현 후 `pnpm run lint` 실행
- **UI 변경이므로 dev 서버 띄우고 실제 브라우저에서 시즌 89/드럼바르카처럼 매칭된 영상이 있는 시즌 페이지로 직접 접속해 확인할 것** (baql-ranks 로컬 DB에 실제 매칭 데이터 있음 — `localhost:8080`이 그 데이터를 물고 있는 서버). 카드 그리드에서 좁은 폭에 파티 카드가 어떻게 보이는지, 매칭 없는 카드와 섞여 있을 때 그리드가 어색하지 않은지 확인
- 이 저장소는 CLAUDE.md 지시에 따라 임의로 dev 서버를 시작/종료하지 말 것 — 사용자가 명시적으로 요청할 때만

## 이번 세션에서 확인된 실측 데이터 (참고용, 재검증 없이 신뢰 가능)
- 로컬 baql-ranks DB(`postgres://rank_user:rootpass@127.0.0.1:5432/ranks`, 로컬 서버 `localhost:8080`)에 total_assault 시즌 89(=GL 시즌 86, 보스 `drumbarka`, 방어타입 `special` 단일)의 실제 랭크 데이터(46,737건)와 매칭된 영상(11건, 전체 drumbarka 영상 52건 중)이 이미 존재함 — 프론트 개발/확인용 실데이터로 바로 활용 가능
- BAQL GraphQL 프로덕션 엔드포인트는 `https://api.baql.net/graphql` (개인 지식 메모에 잘못 기재되어 있던 `baql.mollulog.net`은 수정 완료, 그쪽은 현재 502/526 응답으로 죽어있음)
