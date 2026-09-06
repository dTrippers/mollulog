# MolluLog Documentation

These documents describe the project's durable structure and conventions — where
code lives, how data flows, and the rules new code follows. Most pages avoid
listing files or screens, which change often. The frontend patterns page keeps a
small set of verified source anchors and an evidence process for reuse; it is not
an exhaustive screen catalogue or an approval set of screenshots.

## Map

### Architecture

- [architecture.md](./architecture.md) — system overview, layers, data flow, caching, authentication, runtime and deployment.

### Frontend

- [frontend/routing.md](./frontend/routing.md) — route file naming, route responsibilities, and route-local composition.
- [frontend/components.md](./frontend/components.md) — component layers (`primitives`, `features`, route-local) and promotion criteria.
- [frontend/design.md](./frontend/design.md) — visual language, layout, forms, and interaction rules.
- [frontend/patterns.md](./frontend/patterns.md) — verified Panel, filter, and student-screen reuse references.
- [frontend/ui-quality.md](./frontend/ui-quality.md) — task briefs and actual visual/interaction evidence.

### Data

- [data/database.md](./data/database.md) — PostgreSQL / Drizzle modeling, canonical stores, and migrations.
- [data/baql.md](./data/baql.md) — BAQL GraphQL queries, codegen, and read placement.
- [data/date-time.md](./data/date-time.md) — date and time conventions.

### Contributing

- [development.md](./development.md) — shared worktree settings, local PostgreSQL commands, and agent execution.
- [contributing/code-review.md](./contributing/code-review.md) — pull request review checklist.
- [contributing/verification.md](./contributing/verification.md) — scope-proportional commands and evidence.

## How the layers relate

```text
Routes  (loader / action · thin)
  → Views   (composition + route cache, SWR)
      → Domain  (pure calculation · no I/O)
      → Models  (PostgreSQL CRUD · BAQL reads · source cache · normalization)
          → lib/cache · lib/baql · db
```

Data flows in one direction, top to bottom. Each document above expands on one slice of this picture.
