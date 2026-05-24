---
name: graph-world-ts
description: 'TypeScript implementation workflow for GraphOS world projects. Use after graph-world closes the graph design loop, then bootstrap npm/TypeScript, implement Systems and EventSystems, regenerate types, and wire runtime registration.'
argument-hint: 'Describe your TypeScript world task, e.g. "bootstrap a GraphOS world package and implement WorldBootstrapSystem in src/app.ts"'
user-invocable: true
---

# GraphOS Skill: graph-world-ts

Implement GraphOS world runtime code in TypeScript after the world graph has already been designed and validated.

This skill depends on `graph-world` for graph modeling and closure validation. Use `graph-world` first whenever the request changes `World`/`Context`/`Variant`/`System`/`Event`/`EventSystem` topology.

## Scope Boundary

- This skill covers npm + TypeScript project bootstrap, generated code integration, runtime implementation, and registration wiring.
- This skill does not replace graph modeling. If the request changes graph structure or event/data ownership, run `graph-world` first.
- Keep presentation-layer work outside this skill. Presentation concerns belong in a separate app/view skill such as `graph-world-pixijs`.

## When to Use

- You need to initialize a fresh GraphOS world package with npm and TypeScript.
- You need to configure GraphOS code generation in `package.json`.
- You need to implement `System` or `EventSystem` code against generated `./gen/World` types.
- You need to wire startup bootstrap behavior in `System.spawn`.
- You need to register generated runtime handlers in `src/app.ts`.

## Preconditions

1. Complete graph design with `graph-world` first.
2. Finish graph closed-loop validation before writing runtime code.
3. If Graph changed, regenerate types before updating TypeScript implementations.
4. Preserve the repository's existing TypeScript import style; do not force `.js` suffix rewrites unless the project already requires them.

## Project Bootstrap (npm + TypeScript)

Use this when the user asks to initialize a new world logic project.

1. Initialize npm project and install TypeScript + Node typings:

```bash
npm init -y
npm i -D typescript @types/node
```

2. Install `graphos-world-plugin` and `graphos-cli` as dev dependencies:

```bash
npm i -D graphos-world-plugin graphos-cli
```

3. Ensure `package.json` contains the following `graphos` config:

```json
{
	"type": "module",
	"graphos": {
		"world": {
			"genTypeScript": {
				"enabled": true,
				"outDir": "gen"
			},
			"genWebTypeScript": {
				"enabled": true,
				"outDir": "app"
			},
			"genCocosCreator": {
				"enabled": false,
				"outDir": "../cocos/assets/gen"
			}
		}
	}
}
```

4. Ensure `package.json` scripts includes:

```json
{
	"scripts": {
		"graphos": "graphos",
		"build": "tsc -p tsconfig.world.json"
	}
}
```

5. Ensure root `tsconfig.world.json` exists (minimal example):

```json
{
	"compilerOptions": {
		"target": "ES2020",
		"module": "ESNext",
		"moduleResolution": "Bundler",
		"strict": true,
		"esModuleInterop": true,
		"forceConsistentCasingInFileNames": true,
		"skipLibCheck": true,
		"outDir": "dist"
	},
	"include": ["src/**/*.ts", "gen/**/*.ts"],
	"exclude": ["node_modules", "dist"]
}
```

6. Create `World.graph.json` in the project root as the initial empty graph:

```json
{
  "id": "main",
  "name": "World",
  "nodes": [],
  "edges": []
}
```

7. Optional verification:

```bash
npm run graphos -- --help
npm run build
```

## Workflow

### Step 1: Sync Graph Output Into TypeScript

1. Confirm Graph changes are complete and validated.
2. Regenerate `./gen/World` and related outputs if Graph changed.
3. Re-read generated types before implementing runtime code.

Completion checks:
- Generated `Context` and event types match the current graph.
- No runtime code is being written against stale generated APIs.

### Step 2: Implement Systems

Implement concrete `System` behavior only after Graph data ownership is finalized.

```ts
import type { GameplayContext } from './gen/World';
import type { ISystem } from 'graphos-world-plugin';

export function createGameBootstrapSystem(): ISystem<GameplayContext> {
	// Optional internal cache owned by this specific system instance.
	return {
		spawn(ctx: GameplayContext): void {
			// TODO
		},
		despawn(ctx: GameplayContext): void {
			// TODO
		},
		update(ctx: GameplayContext, deltaTime: number): void {
			// TODO
		},
		change(ctx: GameplayContext): void {
			// TODO
		},
	};
}
```

Implementation guidance:
- Keep method behavior aligned with the closure checks from `graph-world` Step 4.
- Do not implement business logic before Graph data model and ownership are finalized.
- If Graph changes update generated context types, regenerate types first, then update this `System` implementation.
- Keep presentation behavior outside `System`; the View layer should react by observing `Context` data changes.
- Intermediate cache should be handled privately inside each `System` and should not leak into presentation concerns.
- Do not create module-level or global cache/state for `System` implementations.
- Any cache must live inside the `create...System` factory function scope so each created system instance owns its own cache.
- Put shared data contracts, constants, and Context singleton ids/names used by generated `System` code into `src/types.ts`, then import them from `System` files.
- Put runtime configuration into `src/config.ts` and read it from generated `System` logic; prefer configurable defaults over hard-coded values.
- When generating `System` code files, use PascalCase file names and keep them exactly aligned with the graph `System` node `name`.
- Example: graph node `GameBootstrapSystem` -> file `GameBootstrapSystem.ts`.
- Since `Context` provides storage capability, implement a get-or-create pattern in `System` logic: fetch existing Context/state first, and create/initialize only when missing.
- For singleton `Context` access in `System` implementations, use a fixed id with `get...ById('id')`.
- Do not fetch singleton `Context` instances through positional access such as `get...Children()[0]`, because order-based lookup is unstable and obscures identity.

### Step 3: Implement World Startup Entry

Goal: define a clear and deterministic startup entry for world logic initialization.

You must implement the following startup pattern:

1. Initialize required `Context` in a `System.spawn` mounted under `World`.
	- Add a bootstrap system node under `World` (for example `WorldBootstrapSystem`).
	- In `spawn`, initialize the required root/domain Context instances using get-or-create semantics.
	- Keep initialization idempotent: repeated `spawn` calls must not create duplicate singleton Context data.

Startup responsibility:
- `System.spawn`: baseline/default world Context bootstrap that should exist before runtime flows.

```ts
import type { ISystem } from 'graphos-world-plugin';
import { WorldContext } from '../gen/World';

export function createWorldBootstrapSystem(): ISystem<WorldContext> {
	return {
		spawn(ctx: WorldContext): void {
			// Get-or-create required singleton contexts here.
			// Example: ctx.getGameplayById('gameplay') ?? ctx.createGameplay({ id: 'gameplay' })
		},
	};
}
```

Completion checks:
- Startup initialization is idempotent.
- Required singleton/root contexts are available before downstream runtime flows.

### Step 4: Implement EventSystems

Implement event handlers only after Graph trigger chains and payload design are validated.

```ts
import type { WorldContext, IChickenShootEvent } from './gen/World';
import type { ISystem } from 'graphos-world-plugin';

export type SpawnBulletOnShootEventSystem = ISystem<WorldContext, IChickenShootEvent>;

export function createSpawnBulletOnShootEventSystem(): SpawnBulletOnShootEventSystem {
	// Optional internal cache owned by this specific event-system instance.
	return {
		handle(event: IChickenShootEvent): void {
			const world = event.source as unknown as WorldContext;
			// TODO
		},
	};
}
```

Implementation guidance:
- Ensure Event payload fields are defined in Graph and match the generated event type.
- For events consumed mainly by the presentation/UI layer, prefer signal-style Events with no payload; add fields only when the UI cannot derive the required state from `Context`.
- Keep `handle` side effects scoped to the owning Context and verified by graph closure.
- If Event or payload schema changes in Graph, regenerate `./gen/World` types before updating EventSystem code.
- Do not create module-level or global cache/state for `EventSystem` implementations.
- Any cache must live inside the `create...EventSystem` factory function scope so each created event-system instance owns its own cache.
- Put shared data contracts, constants, and Context singleton ids/names used by generated `EventSystem` code into `src/types.ts`, then import them from `EventSystem` files.
- Put runtime configuration into `src/config.ts` and read it from generated `EventSystem` logic; prefer configurable defaults over hard-coded values.
- When generating `EventSystem` code files, use PascalCase file names and keep them exactly aligned with the graph `EventSystem` node `name`.
- Example: graph node `SpawnBulletOnShootEventSystem` -> file `SpawnBulletOnShootEventSystem.ts`.
- Since `Context` provides storage capability, `EventSystem` handlers should fetch target Context/state first and create/initialize only when it does not exist.
- For singleton `Context` access in `EventSystem` implementations, use a fixed id with `get...ById('id')`.
- Do not resolve singleton `Context` instances through `get...Children()[0]` or any other position-based child lookup.

### Step 5: Register Runtime Wiring in src/app.ts

After implementing handlers, wire the runtime explicitly in `src/app.ts`.

```ts
import { App } from 'graphos-world-plugin';
import { MatchLoopContext, WorldContext } from '../gen/World';
import { createMatchLifecycleSystem } from './MatchLifecycleSystem';
import { createApplyConfigHotReloadEventSystem } from './ApplyConfigHotReloadEventSystem';

export default function (app: App): WorldContext {
	app.addSystem(MatchLoopContext.Table, createMatchLifecycleSystem());
	app.addEventSystem('ConfigHotReloadRequested', createApplyConfigHotReloadEventSystem());
	return WorldContext.default(app.ctx, app.cache)!;
}
```

Registration guidance:
- After implementing a `System`, register it in `src/app.ts` with `app.addSystem(...)`.
- Register the World bootstrap system with `app.addSystem(WorldContext.Table, createWorldBootstrapSystem())`.
- Ensure bootstrap initialization remains idempotent and safe on retry/re-entry.
- After implementing an `EventSystem`, register it in `src/app.ts` with `app.addEventSystem(...)`.
- Keep imported symbol names aligned with the generated PascalCase file names and graph node names.
- Use the owning Context table when calling `app.addSystem(...)`.
- Use the exact graph `Event` name when calling `app.addEventSystem(...)`.
- Keep the `src/app.ts` default export signature fixed as `export default function (app: App): WorldContext`; this format is mandatory and must not be changed.

Completion checks:
- Every implemented `System` and `EventSystem` is registered.
- `src/app.ts` matches the current generated graph contracts.

## Quality Gates

1. Graph-first gate: no runtime implementation started before `graph-world` closure validation passed.
2. Generated-type gate: `./gen/World` has been regenerated and re-read after Graph changes.
3. Scope gate: `System` and `EventSystem` code respects graph ownership and does not invent new topology.
4. Cache gate: no module-level or global mutable cache; per-instance closure cache only.
5. Config gate: implementation-specific config lives in `src/config.ts`, not in Graph topology.
6. Registration gate: every runtime handler is wired in `src/app.ts`.
7. Startup gate: `World` bootstrap initialization is idempotent and singleton-safe.

## Failure Recovery

- Generated types do not match expectations: regenerate Graph output first, then re-open `./gen/World` before editing runtime code.
- A handler needs data that is missing from the graph: stop TypeScript patching and route back to `graph-world`.
- Runtime code is using positional child lookup for singleton contexts: replace with fixed-id get-or-create access.
- Imports appear to need `.js` suffixes: only change import paths if the target repository already enforces that convention.
- Registration is incomplete: finish `src/app.ts` wiring before treating the feature as complete.

## Example Requests

- Bootstrap a GraphOS world npm package with `package.json`, `tsconfig.world.json`, and `World.graph.json`.
- Implement `WorldBootstrapSystem` and register it in `src/app.ts`.
- Regenerate `./gen/World` and update runtime code after adding a new `EventSystem` in graph-world.
- Refactor Systems to use `src/config.ts` and `src/types.ts` instead of hard-coded constants.
