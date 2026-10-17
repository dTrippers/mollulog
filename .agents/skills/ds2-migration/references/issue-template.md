# Linear sub-issue template

Follow the structure of MLLG-124. Write in Korean, short declarative sentences,
nested bullets for detail. Omit a section only when it truly has no content.

```markdown
작업 기준: [디자인 시스템 2.0 작업 지침](<https://linear.app/dtrippers/document/%EB%94%94%EC%9E%90%EC%9D%B8-%EC%8B%9C%EC%8A%A4%ED%85%9C-20-%EC%9E%91%EC%97%85-%EC%A7%80%EC%B9%A8-4309c83b0488>)

## 목표

{화면}(`/route`)을 2.0으로 교체한다. {페이지 역할 한 문장}.

* {왜 바꾸는지: 현재 사용 경험의 핵심 문제}

{선행 조건이 있으면: "OO 이관 PR이 머지된 뒤 착수한다."}

## 대상

* Route: `app/routes/...`
* 컴포넌트: `..._components/`
* 범위 외:
  * {제외 항목과 사유}

## 현재 문제

착수할 때 코드와 대조해서 보완한다.

* **{영역}**: {코드로 확인한 구체적 문제}

## 결정 사항

* **{결정 제목}**
  * {결정 내용}
  * {근거 또는 사례 조사 출처가 필요하면 함께}

## 작업 범위

1. **현재 화면 기준선 캡처**
   * 데스크톱·모바일 × 라이트·다크
   * {이 화면의 주요 상태 목록}
2. **화면 구성 시안**: 실제 데이터로 만든다. 시안 리뷰에서 아래 항목을 확인받는다.
   * {레이아웃 레시피, 영역 구성, 탭·패널, 모바일 표현 등}
3. **구현**
   * 2.0 레이아웃 부품과 토큰, `app/components/v2/` 컴포넌트만 쓴다. 기존 v2 컴포넌트를 먼저 재사용한다.
   * {새로 만들 v2 부품과 위치}
4. **source guard 등록**: 이관된 route 목록에 대상 route를 추가한다.
5. **상태 표현**
   * {로딩, 빈 결과, 데이터 없음, 실패 등 이 화면의 상태를 구분해서 나열}
   * 내부 오류나 의미 없는 대체 값을 노출하지 않는다.
6. **유지할 기존 동작**
   * {저장된 보기·필터, 스크롤 복원, 키보드 흐름 등}
7. **접근성**
   * {이 화면에 필요한 항목}

## 완료 기준

* 시안을 확인받은 내용과 구현 결과가 일치한다.
* 데스크톱·모바일 × 라이트·다크 캡처로 시각 검증을 받는다.
  * {긴 이름, 많은 항목, 빈 결과, 실패 상태 등 이 화면에 맞는 경계 상태}
* {결정 사항별로 관찰 가능한 기준}
* 주요 흐름의 motion을 녹화로 확인하고, reduced-motion 상태도 확인한다.
* 유지할 기존 동작이 모두 유지된다.
* guard를 통과하고, 교체 후 쓰이지 않게 된 1.x 코드는 삭제한다.
* 기존 테스트를 유지하고, 새 컴포넌트의 상태 분기 테스트를 추가한다.
* lint, typecheck, 관련 테스트를 통과한다.
* 시각 검증을 통과하면 기존 화면을 바로 교체한다.
```

Every "완료 기준" item must be observable. plan-and-subagent traces its
completion conditions to this section.
