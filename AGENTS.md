# MolluLog
This project is a service that provides information about the game "Blue Archive", developed by Nexon Games.

## About Game
In "Blue Archive", players are called "Sensei" which means "teacher" in Japanese.
Players can collect various characters called "Students".
Students have various attributes such as "Attack Type", "Defense Type", "Role", "Equipment", etc.

There are various events in the game, and players can participate in these events to get various rewards.
For some events, there are some pickups to get students.

## About MolluLog
This project provides information about the schedule of events and the students that can be picked up.
Users can check the schedule and pickups, and plan their activities.
Also, users can record their game activities such as collected students, participated events, etc.

## Technology
This project uses the following stack:
- React Router v7 as a framework
- TypeScript
- Tailwind CSS for styling
- PNPM for package manager
- Drizzle ORM and Cloudflare D1 for database

This project has been deployed to Cloudflare Workers.

## Development Guides
- Please follow the conventions of the project. Search for the existing code and follow the same style.
- For UI layout, use modern and simple design.
- Before creating or changing UI components, read `docs/ui-ux-guidelines.md` and follow its component structure, naming, reuse, layout, and performance rules.
- Before adding, moving, or refactoring components, read `docs/component-development-guide.md` and follow its final structure rules for `primitives`, `features`, and route-local components.
- Before restructuring route files or extracting screen-only UI, read `docs/routes.md` and follow its route-local composition rules.
- For BAQL GraphQL work, follow these rules:
  - Define queries with `graphql(...)` in `app/**/*.{ts,tsx}` so GraphQL codegen can pick them up.
  - After adding or changing a query, run `pnpm codegen`. Do not manually edit generated files under `app/graphql/`.
  - Prefer codegen-inferred query/result/variables types. Do not duplicate GraphQL result or variables types locally unless there is a clear reason.
  - Prefer domain-level return types only at the boundary where GraphQL data is transformed into app-specific models.
  - Shared BAQL read logic, caching, and request orchestration should live in `app/repositories/`. Keep pure calculation and transformation logic in `app/models/`.
  - Avoid `TypedDocumentNode` casts or manual GraphQL shape annotations unless codegen is temporarily unavailable or inference is blocked by an existing project issue.
- This project uses Biome for code formatting and linting. Always follow the Biome conventions when creating or modifying code. You can run `pnpm run lint` to check formatting issues.
