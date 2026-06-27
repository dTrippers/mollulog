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

### Helpful commands

Not every command is always required, but please check the following when you can.

```bash
pnpm typecheck
pnpm lint
pnpm test
```

To run only the Biome check separately:

```bash
pnpm exec biome check
```

### Project conventions

#### UI work

Before adding or changing UI, please read these documents first.

- [docs/frontend/design.md](./docs/frontend/design.md)
- [docs/frontend/components.md](./docs/frontend/components.md)
- [docs/frontend/routing.md](./docs/frontend/routing.md)

#### GraphQL work

- GraphQL data uses the [BAQL](https://github.com/hellodhlyn/baql) project.
- Define queries with `graphql(...)` inside `app/**/*.{ts,tsx}`.
- After adding or changing a query, run `pnpm codegen`.
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
- A screenshot or short description if there is a UI change

### Review references

- [docs/contributing/code-review.md](./docs/contributing/code-review.md)

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

### 확인하면 좋은 명령

변경 전부에 항상 모든 명령이 필요한 것은 아니지만, 가능하면 아래 항목을 확인해 주세요.

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Biome 검사만 별도로 보고 싶다면 아래 명령도 사용할 수 있습니다.

```bash
pnpm exec biome check
```

### 프로젝트 규칙

#### UI 작업

UI를 추가하거나 변경할 때는 아래 문서를 먼저 읽어 주세요.

- [docs/frontend/design.md](./docs/frontend/design.md)
- [docs/frontend/components.md](./docs/frontend/components.md)
- [docs/frontend/routing.md](./docs/frontend/routing.md)

#### GraphQL 작업

- GraphQL 데이터는 [BAQL](https://github.com/hellodhlyn/baql) 프로젝트를 사용하고 있습니다.
- 쿼리는 `app/**/*.{ts,tsx}` 안에서 `graphql(...)` 로 정의해 주세요.
- 쿼리를 추가하거나 수정했다면 `pnpm codegen` 을 실행해 주세요.
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
- UI 변경이 있다면 스크린샷 또는 짧은 설명

### 리뷰 참고 문서

- [docs/contributing/code-review.md](./docs/contributing/code-review.md)

### 라이선스

별도 합의가 없는 한, 이 저장소에 제출된 기여는 저장소와 동일한 [Apache License 2.0](./LICENSE) 조건으로 제공되는 것으로 간주합니다.
