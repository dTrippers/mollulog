# 날짜/시간 처리 규약

이 문서는 MolluLog에서 날짜/시간 값을 저장, 캐시, 전달, 표시할 때 따르는 공통 규칙입니다.

## 기본 규칙

- 시각을 나타내는 timestamp instant는 `UTC ISO string`으로 다룹니다.
  예: `2026-05-01T15:30:00.000Z`
- 날짜만 의미하는 값은 `YYYY-MM-DD` 문자열로 다룹니다.
  예: `2026-05-02`
- `Date` 객체는 loader, cache, model/repository 반환값의 계약으로 쓰지 않습니다.
- D1 `current_timestamp`처럼 timezone이 없는 legacy 값은 model/repository read boundary에서 UTC instant로 정규화합니다.
- 사용자의 표시 timezone은 KST 고정이 아니라 브라우저 timezone을 preference cookie에 저장한 값을 사용합니다.

## 구현 규칙

- 날짜/시간 변환은 `app/lib/date-time.ts`를 통해 수행합니다.
- 새 timestamp write는 `nowUtcIso()` 또는 `toUtcIso()`를 사용합니다.
- 표시용 포맷은 `formatInstant(instant, { timeZone, format })`을 사용합니다.
- View에서 `dayjs(value).format(...)`, `new Date(value).toLocaleDateString(...)`처럼 runtime timezone에 의존하는 코드는 추가하지 않습니다.
- 새 cache payload에는 `Date` 객체를 넣지 않습니다. `fetchCached()`의 Date revive/replacer는 legacy 호환용으로만 남겨둡니다.

## SSR과 Hydration

- timezone cookie가 없을 때 서버는 `UTC`를 fallback으로 사용합니다.
- 클라이언트는 mount 후 `Intl.DateTimeFormat().resolvedOptions().timeZone`으로 브라우저 timezone을 감지해 preference cookie에 저장합니다.
- 표시 컴포넌트는 root에서 제공하는 display timezone을 명시적으로 사용합니다.
- 이 방식은 첫 SSR과 초기 hydration을 안정적으로 맞춘 뒤, 감지된 브라우저 timezone으로 표시를 갱신합니다.

## D1 정렬

- mixed legacy timestamp와 ISO timestamp가 함께 있을 수 있는 쿼리는 문자열 정렬에 의존하지 않습니다.
- D1에서는 `unixepoch(...)` 기준 정렬을 사용합니다.
- 모든 데이터가 canonical ISO UTC로 정리된 테이블은 ISO 문자열 정렬을 사용할 수 있습니다.
