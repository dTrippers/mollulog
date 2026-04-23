# 컴포넌트 개발 가이드

이 문서는 새 UI 코드를 어디에 둘지 판단하는 기준입니다.
컴포넌트 목록을 유지하는 대신, 오래 가는 계층 규칙과 승격 기준만 정리합니다.

## 소스 오브 트루스

현재 UI 구조의 기준 계층은 아래 네 가지입니다.

1. `app/components/primitives`
2. `app/components/features/<domain>`
3. `app/routes/*._components`, `app/routes/*/_components`

새 작업은 이 구조를 강화하는 방향으로 진행합니다.
예전 계층(`atoms`, `molecules`, `organisms`, `navigation`)은 다시 만들지 않습니다.

## 계층별 역할

### `app/components/primitives`

- 도메인에 속하지 않는 얇은 앱 공통 UI
- 버튼, 입력, 필드, callout, 공통 surface 같은 저수준 인터랙션과 표현 레이어
- 여러 도메인에서 반복되는 표시 패턴

이 계층에서는:

- semantic token 기반 기본 색상과 surface 역할
- 공통 variant
- 일관된 기본 spacing
- 프로젝트 공통 field/input 밀도

를 관리합니다.

예:

- 페이지 제목
- 버튼, 입력, textarea, field
- 빈 상태
- 프로필 이미지
- 공통 section/panel 래퍼

주의:

- 같은 책임의 generic control을 두 벌 만들지 않습니다.
- 도메인 용어가 들어가면 대개 `features`가 더 맞습니다.

### `app/components/features/<domain>`

- 여러 라우트에서 재사용되는 도메인 UI
- 도메인 용어, 문구, 상태 흐름을 포함할 수 있습니다
- 화면 조합 일부를 공유할 때 기본 선택지입니다

예:

- 프로필 편집 UI
- 레이드 선택기
- 커뮤니티 피드
- 이벤트 정보 카드

### route-local 컴포넌트

- 한 화면이나 한 라우트 패밀리 안에서만 쓰는 UI
- 라우트 파일을 짧게 유지하기 위한 분리
- 화면 전용 훅과 보조 유틸도 함께 둘 수 있습니다

기본 성향은 "일단 route-local, 재사용이 확인되면 승격"입니다.

## 승격 기준

새 UI를 만들 때는 아래 순서로 판단합니다.

1. 기존 `primitives` 또는 `features/forms` 조합으로 해결 가능한가
2. 저수준 공통 variant 추가로 해결 가능한가
3. 같은 도메인 여러 화면에서 재사용되는가
4. 그렇다면 `features/<domain>` 으로 둔다
5. 아니라면 route-local 로 둔다

너무 이른 공용화보다, 재사용이 확인된 뒤 승격하는 편을 기본으로 합니다.

## import 규칙

- 저수준 UI와 앱 공통 표현은 `~/components/primitives`
- 도메인 공유 UI는 `~/components/features/<domain>`
- route-local 코드는 상대 경로 import

route-local 코드를 억지로 `features`로 올리지 않습니다.
반대로 여러 화면에서 재사용되는 UI를 계속 route-local 로 복붙하지도 않습니다.

## 네이밍 규칙

- 크기보다 책임을 이름에 드러냅니다.
- 스타일 차이보다 역할 차이를 이름에 반영합니다.
- `Small`, `Mini`, `New`, `Custom` 같은 접두사는 마지막 수단입니다.
- 같은 역할을 variant로 해결할 수 있으면 하나의 컴포넌트를 유지합니다.

좋은 예:

- `StudentCard`
- `RaidSelector`
- `ProfileEditor`

## API 규칙

- 저수준 컴포넌트는 작고 예측 가능한 prop API를 유지합니다.
- 도메인 컴포넌트는 layout prop보다 도메인 의도를 드러내는 prop를 선호합니다.
- route `action`과 숨은 form serialization은 가능한 한 화면 가까운 컴포넌트 안에 캡슐화합니다.
- one-off boolean 조합으로 의미가 모호해지면 컴포넌트를 다시 나누는 쪽을 먼저 검토합니다.

## 스타일링 규칙

- 기본 시각 언어는 `primitives`와 `app/tailwind.css`의 semantic token에서 맞춥니다.
- `features`는 base control을 다시 꾸미기보다 조합합니다.
- 같은 상호작용에 두 개의 시각 패턴이 생기지 않게 합니다.
- 폼 밀도는 route 수준에서 임의로 조이지 말고, 필요하면 명시적 variant로 해결합니다.

상세 시각 규칙은 [UI/UX 가이드](./ui-ux-guidelines.md)를 따릅니다.

## 체크리스트

새 UI 코드를 추가하기 전에 아래를 확인합니다.

1. 올바른 계층에 두고 있는가
2. 기존 `primitives`/`features/forms` 재사용으로 해결할 수 없는가
3. 이름이 책임을 설명하는가
4. semantic element를 사용했는가
5. 재사용 근거 없이 너무 빨리 공용화하지 않았는가
