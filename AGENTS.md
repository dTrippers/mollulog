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
- Before creating or changing UI components, read `docs/frontend/design.md` and follow its component structure, naming, reuse, layout, and performance rules.
- Before adding, moving, or refactoring components, read `docs/frontend/components.md` and follow its final structure rules for `primitives`, `features`, and route-local components.
- Before restructuring route files or extracting screen-only UI, read `docs/frontend/routing.md` and follow its route-local composition rules.
- Avoid Tailwind arbitrary values such as `text-[10px]`, `h-[37px]`, `mt-[3px]`, or custom grid sizes unless there is a concrete layout constraint that cannot be expressed with the existing scale.
- Prefer the project's existing spacing, typography, radius, and color tokens such as `text-xs`, `text-sm`, `gap-1`, `rounded-md`, and semantic color classes.
- If an arbitrary value is necessary, keep it isolated inside the smallest relevant component and explain why it is necessary in the implementation note.
- Do not start or stop development servers unless the user explicitly asks for it.
- Before stopping any server or long-running process, identify the exact PID, working directory, and command, then ask for confirmation.
- Never assume a process belongs to the current task based only on its command name or port. Multiple MolluLog worktrees may run similar React Router or PNPM commands at the same time.
- For BAQL GraphQL work, follow these rules:
  - Define queries with `graphql(...)` in `app/**/*.{ts,tsx}` so GraphQL codegen can pick them up.
  - After adding or changing a query, run `pnpm codegen`. Do not manually edit generated files under `app/graphql/`.
  - Prefer codegen-inferred query/result/variables types. Do not duplicate GraphQL result or variables types locally unless there is a clear reason.
  - Prefer domain-level return types only at the boundary where GraphQL data is transformed into app-specific models.
  - Shared BAQL read logic, source caching, and upstream→domain normalization live in `app/models/` (data access only). Keep pure calculation/transformation in `app/domain/`, and route-presentation composition with route caching (SWR) in `app/views/`. See `docs/architecture.md` for the architecture.
  - Avoid `TypedDocumentNode` casts or manual GraphQL shape annotations unless codegen is temporarily unavailable or inference is blocked by an existing project issue.
- This project uses Biome for code formatting and linting. Always follow the Biome conventions when creating or modifying code. You can run `pnpm run lint` to check formatting issues.
