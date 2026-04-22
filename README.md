# 몰루로그 - MolluLog

모바일 게임 "블루 아카이브"의 컨텐츠 일정/통계 정보를 확인하고 플레이 기록을 관리해보세요.  
[https://mollulog.net](https://mollulog.net)

## 개발

### 요구 사항

- Node.js 22+


### 빠른 시작

```bash
pnpm install
pnpm dev:db:migrate
pnpm dev
```

### 자주 사용하는 명령어

```bash
pnpm codegen       # GraphQL 타입 갱신
pnpm typecheck     # 타입 체크
pnpm lint          # Biome 린트 및 포매팅
pnpm test          # 테스트 실행
pnpm staging:deploy
pnpm prod:deploy
```

GraphQL 쿼리를 추가하거나 수정했다면 `pnpm codegen`을 실행해 주세요.

## 문서

- [기여 가이드](./CONTRIBUTING.md)
- [아키텍처](./docs/architecture.md)
- [데이터베이스](./docs/database.md)
- [컴포넌트 개발 가이드](./docs/component-development-guide.md)
- [라우트 가이드](./docs/routes.md)
- [UI/UX 가이드](./docs/ui-ux-guidelines.md)

## 라이선스

별도 표기가 없는 한, 이 저장소의 소스 코드는 Apache License 2.0을 따릅니다.

> 게임 "블루 아카이브"의 각종 에셋 및 컨텐츠의 권리는 넥슨, 넥슨게임즈 및 Yostar에 있습니다.  
> 몰루로그는 "블루 아카이브"의 팬 사이트이며 컨텐츠를 상업적으로 이용하지 않습니다.
