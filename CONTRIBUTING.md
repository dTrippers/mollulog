# Contributing to MolluLog

[English](#english) · [한국어](#한국어)

## English

Thanks for your interest in MolluLog.

This is a short guide to help first-time contributors set up a development environment quickly and propose changes that fit the project's conventions.

### Before you start

- For large features or structural changes, share your intent first through an issue or PR description.
- Documentation edits, typo fixes, and small bug fixes are all welcome contributions.

### Workflow

1. Keep the change scope as small as possible.
2. Check the related documents first.
3. Update code and docs together when needed.
4. In the PR, describe why you made the change and how you verified it.

### Verification

Use the [verification guide](./docs/contributing/verification.md) to choose checks
for the change. Runtime commands use `mise exec --`:

```bash
mise exec -- pnpm typecheck
mise exec -- pnpm lint
mise exec -- pnpm test
```

When a full-tree, generated-inclusive Biome check is specifically relevant:

```bash
mise exec -- pnpm exec biome check .
```

Documentation-only changes need link/content consistency and `git diff --check`;
application lint, typecheck, and tests are not mandatory for those changes.

### Project conventions

#### UI work

Read only the frontend guidance relevant to the task. Use these documents for
visual rules, component placement, proven compositions, and UI evidence:

- [docs/frontend/design.md](./docs/frontend/design.md)
- [docs/frontend/components.md](./docs/frontend/components.md)
- [docs/frontend/patterns.md](./docs/frontend/patterns.md)
- [docs/frontend/ui-quality.md](./docs/frontend/ui-quality.md)
- [docs/frontend/routing.md](./docs/frontend/routing.md)

#### GraphQL work

- GraphQL data uses the [BAQL](https://github.com/hellodhlyn/baql) project.
- Define queries with `graphql(...)` inside `app/**/*.{ts,tsx}`.
- After adding or changing a query, run `mise exec -- pnpm codegen`.
- Do not edit generated files under `app/graphql/` by hand.

#### Code style

- The project follows TypeScript, Biome, and Tailwind CSS standards.
- Check the style and structure of existing files first, then follow the same patterns.
- Keep screen-only UI that is not reused in route-local `_components/`, and promote only shared UI to the shared layer.

### Using AI

Contributions made with AI tools are allowed, but please follow these principles.

- Read and understand the generated code, docs, and explanations yourself before submitting.
- Accuracy, security, performance, accessibility, and license suitability must always be reviewed by a person.
- Do not submit code that does not fit the project context as-is.
- The final judgment, final review, and responsibility for the submitted result rest with the contributor.

### Pull request guide

Please include the following in the PR description.

- What you changed
- Why this change is needed
- How you verified it
- For a visual or layout change, include an actual-render capture or accessible
  actual-render reference with its route, viewport, theme, and state. A
  description must summarize evidence that was obtained, not replace the QA.
  For a behavior or state-transition change, record the scenario, action, and
  observed result; a screenshot alone does not prove the transition. Mark
  missing applicable evidence `UNVERIFIED`; invisible logic changes do not need
  a screenshot.

### Review references

- [docs/contributing/code-review.md](./docs/contributing/code-review.md)
- [docs/contributing/verification.md](./docs/contributing/verification.md)

### License

Unless otherwise agreed, contributions submitted to this repository are considered to be provided under the same [Apache License 2.0](./LICENSE) terms as the repository.

---

## 한국어

MolluLog에 관심을 가져주셔서 감사합니다.

이 문서는 처음 기여하는 분이 빠르게 개발 환경을 준비하고, 프로젝트 규칙에 맞춰 변경을 제안할 수 있도록 돕기 위한 간단한 가이드입니다.

### 시작하기 전에

- 큰 기능 추가나 구조 변경은 작업 전에 issue 또는 PR 설명으로 의도를 먼저 공유해 주세요.
- 문서 수정, 오타 수정, 작은 버그 수정도 좋은 기여입니다.

### 작업 흐름

1. 변경 범위를 가능한 한 작게 유지해 주세요.
2. 관련 문서를 먼저 확인해 주세요.
3. 필요한 경우 코드와 문서를 함께 업데이트해 주세요.
4. PR에는 변경 이유와 테스트 방법을 함께 적어 주세요.

### 확인 방법

[검증 안내](./docs/contributing/verification.md)를 참고해 작업 범위에 맞는
검사를 선택해 주세요. Runtime 명령은 `mise exec --`로 실행합니다.

```bash
mise exec -- pnpm typecheck
mise exec -- pnpm lint
mise exec -- pnpm test
```

생성 파일을 포함한 전체 파일 Biome 검사가 필요할 때 아래 명령을 사용하세요.

```bash
mise exec -- pnpm exec biome check .
```

문서만 변경한 경우에는 링크·내용 일관성과 `git diff --check`를 확인하면
되며, 앱 lint·typecheck·test는 필수가 아닙니다.

### 프로젝트 규칙

#### UI 작업

작업에 필요한 프론트엔드 지침만 읽어 주세요. 시각 규칙, 컴포넌트 위치,
재사용 가능한 조합, UI 증거 기준은 아래 문서에서 확인할 수 있습니다.

- [docs/frontend/design.md](./docs/frontend/design.md)
- [docs/frontend/components.md](./docs/frontend/components.md)
- [docs/frontend/patterns.md](./docs/frontend/patterns.md)
- [docs/frontend/ui-quality.md](./docs/frontend/ui-quality.md)
- [docs/frontend/routing.md](./docs/frontend/routing.md)

#### GraphQL 작업

- GraphQL 데이터는 [BAQL](https://github.com/hellodhlyn/baql) 프로젝트를 사용하고 있습니다.
- 쿼리는 `app/**/*.{ts,tsx}` 안에서 `graphql(...)` 로 정의해 주세요.
- 쿼리를 추가하거나 수정했다면 `mise exec -- pnpm codegen` 을 실행해 주세요.
- `app/graphql/` 아래 생성 파일은 직접 수정하지 말아 주세요.

#### 코드 스타일

- 프로젝트는 TypeScript, Biome, Tailwind CSS 기준을 따릅니다.
- 기존 파일의 스타일과 구조를 먼저 확인한 뒤, 같은 패턴을 따라 주세요.
- 재사용되지 않는 화면 전용 UI는 route-local `_components/` 에 두고, 공유 UI만 공용 계층으로 올려 주세요.

### AI 사용에 대해

AI 도구를 사용한 기여는 가능합니다. 다만 아래 원칙을 꼭 지켜 주세요.

- 생성된 코드, 문서, 설명을 사람이 직접 읽고 이해한 뒤 제출해 주세요.
- 정확성, 보안, 성능, 접근성, 라이선스 적합성은 반드시 사람이 최종 검토해 주세요.
- 프로젝트 문맥과 맞지 않는 코드는 그대로 제출하지 말아 주세요.
- 최종 판단, 최종 검수, 제출 결과에 대한 책임은 반드시 기여한 사람이 가집니다.

### Pull Request 가이드

PR 설명에는 아래 내용을 포함해 주세요.

- 무엇을 변경했는지
- 왜 이 변경이 필요한지
- 어떻게 확인했는지
- 시각 또는 layout 변경이라면 route·viewport·theme·state를 포함한 실제
  렌더링 캡처나 확인 가능한 실제 렌더링 참조를 첨부해 주세요. 설명은 실제로
  확보한 증거를 요약해야 하며 QA를 대신할 수 없습니다. 동작 또는 상태 전이
  변경이라면 시나리오·동작·관찰한 결과를 기록해 주세요. 스크린샷만으로는
  전이를 증명할 수 없습니다. 관련 증거가 없으면 `UNVERIFIED`로 표시해
  주세요. 보이지 않는 로직 변경에는 스크린샷이 필요하지 않습니다.

### 리뷰 참고 문서

- [docs/contributing/code-review.md](./docs/contributing/code-review.md)
- [docs/contributing/verification.md](./docs/contributing/verification.md)

### 라이선스

별도 합의가 없는 한, 이 저장소에 제출된 기여는 저장소와 동일한 [Apache License 2.0](./LICENSE) 조건으로 제공되는 것으로 간주합니다.
