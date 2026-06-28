# MolluLog Documentation

These documents describe the project's durable structure and conventions — where code lives, how data flows, and the rules new code follows. They intentionally avoid listing files or screens, which change often. For the exact current state, read the source directories the documents point to.

## Map

### Architecture

- [architecture.md](./architecture.md) — system overview, layers, data flow, caching, authentication, runtime and deployment.

### Frontend

- [frontend/routing.md](./frontend/routing.md) — route file naming, route responsibilities, and route-local composition.
- [frontend/components.md](./frontend/components.md) — component layers (`primitives`, `features`, route-local) and promotion criteria.
- [frontend/design.md](./frontend/design.md) — visual language, layout, forms, and interaction rules.

### Data

- [data/database.md](./data/database.md) — D1 / Drizzle modeling, canonical stores, and migrations.
- [data/baql.md](./data/baql.md) — BAQL GraphQL queries, codegen, and read placement.
- [data/date-time.md](./data/date-time.md) — date and time conventions.

### Contributing

- [contributing/code-review.md](./contributing/code-review.md) — pull request review checklist.

## How the layers relate

```text
Routes  (loader / action · thin)
  → Views   (composition + route cache, SWR)
      → Domain  (pure calculation · no I/O)
      → Models  (D1 CRUD · BAQL reads · source cache · normalization)
          → lib/cache · lib/baql · db
```

Data flows in one direction, top to bottom. Each document above expands on one slice of this picture.
