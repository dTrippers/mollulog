# MolluLog

Check content schedules and statistics for the mobile game "Blue Archive", and keep track of your play records.
[https://mollulog.net](https://mollulog.net)

## Development

### Requirements

- Node.js 22+

### Quick start

```bash
pnpm install
pnpm dev:db:migrate
pnpm dev
```

### Common commands

```bash
pnpm codegen       # Update GraphQL types
pnpm typecheck     # Type check
pnpm lint          # Biome lint and format
pnpm test          # Run tests
pnpm staging:deploy
pnpm prod:deploy
```

If you added or changed a GraphQL query, run `pnpm codegen`.

## Documentation

- [Contributing guide](./CONTRIBUTING.md)
- [Documentation index](./docs/README.md)
- [Architecture](./docs/architecture.md)
- [Database](./docs/data/database.md)
- [Components](./docs/frontend/components.md)
- [Routing](./docs/frontend/routing.md)
- [Design](./docs/frontend/design.md)

## License

Unless otherwise noted, the source code in this repository is licensed under the Apache License 2.0.

> The rights to the assets and content of the game "Blue Archive" belong to Nexon, Nexon Games, and Yostar.  
> MolluLog is a fan site for "Blue Archive" and does not use its content commercially.

> 게임 "블루 아카이브"의 각종 에셋 및 컨텐츠의 권리는 넥슨, 넥슨게임즈 및 Yostar에 있습니다.  
> 몰루로그는 "블루 아카이브"의 팬 사이트이며 컨텐츠를 상업적으로 이용하지 않습니다.
