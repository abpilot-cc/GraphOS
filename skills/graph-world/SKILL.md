---
name: graph-world
description: 'World logic design tool for GraphOS. Design World/Context/Variant/System/Event/EventSystem graph models for any game or app, focusing on domain logic, lifecycle systems, bootstrap events, and event-driven context initialization. Depends on graph-management skill for graph read/apply APIs.'
argument-hint: 'Describe your domain and goals, e.g. "Any game or app world model with contexts, variants, systems, and bootstrap initialization"'
user-invocable: true
---

# GraphOS Skill: graph-world

Design world logic in GraphOS with a node-first architecture for any game or application.

This skill depends on `graph-management` for graph inspection and transaction apply APIs.

## Node Semantics

- World: Single root context of the whole model. The World node name is fixed to `World`.
- Context: Hierarchical domain/data model node under World or Context. Context belongs to the logical/data layer, not the presentation layer, but should expose the state that the View layer needs to observe. Context also has built-in storage semantics, so logic should prefer reusing existing Context instances/state before creating new ones.
- Variant: Typed variable definition under World or Context. Variant is the default design surface for persistent/stored runtime data.
- System: Lifecycle logic node under World or Context. Temporary cache or ephemeral working state should be handled inside the owning System rather than modeled as stored graph data.
- Event: World-level event definition.
- EventSystem: Event-driven handler under Event.

## When to Use

- You are designing a new game/app world model from scratch.
- You need to convert business domains into nested Context trees.
- You need typed data variables (Variant) before writing lifecycle logic.
- You need event-driven initialization or runtime flows (for example game startup).
- You need to bootstrap a fresh npm + TypeScript world project with GraphOS generation config.

## Preconditions

1. Load and use `graph-management` skill first.
2. Read available node types and current graph state before mutation.
3. Use one coherent transaction per design step when possible.
4. Enforce root naming constraint: the `World` node `name` is fixed to `'World'`.

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
      "build": "tsc -p tsconfig.world.json",
      "test:logic": "tsc -p tsconfig.world.json && node dist/test.js"
   }
}
```

5. Ensure root `tsconfig.world.json` exists (minimal example):

```json
{
   "compilerOptions": {
      "target": "ES2020",
      "module": "NodeNext",
      "moduleResolution": "NodeNext",
      "strict": true,
      "esModuleInterop": true,
      "forceConsistentCasingInFileNames": true,
      "skipLibCheck": true,
      "outDir": "dist"
   },
   "include": ["src/**/*.ts","gen/**/*.ts"],
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
npm run test:logic
```

## Logic Layer Test Harness (`src/test.ts`)

Use this when you need to verify the logic layer in a headless, deterministic way without the UI.

1. Create `src/test.ts` as the simulation entry point for logic validation.
   - Load the generated world/runtime types and register the same `System` / `EventSystem` wiring used by the app.
   - Run the logic layer against scripted scenarios that represent the main gameplay or business branches.
   - Keep the harness independent from rendering, DOM, canvas, and presentation-layer code.
2. Print detailed logs for every scenario and branch.
   - Log scenario name, input payloads, target Context scopes, and the exact branch being exercised.
   - Log before/after snapshots for relevant Context and Variant data so failures can be traced quickly.
   - Log every Event dispatch, System transition, cache decision, and assertion result.
   - Prefer structured output that is easy to diff, such as JSON payloads plus concise human-readable summaries.
3. Validate closure with automated assertions.
   - Assert that each scenario reaches the expected end state.
   - Assert that each critical logic branch is executed at least once across the scenario matrix.
   - Assert that no required Event, System, Context, or Variant path remains unvisited for the intended design.
4. Repeat testing until all game or app branches pass.
   - If a branch fails, inspect the logs, patch the graph or runtime logic, and rerun the harness.
   - Continue the scenario matrix until the logic layer is closed-loop and all intended flows pass consistently.

Suggested `package.json` scripts for the harness:

```json
{
   "scripts": {
      "test:logic": "tsc -p tsconfig.world.json && node dist/test.js"
   }
}
```

Suggested `src/test.ts` responsibilities:

```ts
// 1. bootstrap app/runtime
// 2. register generated systems and event systems
// 3. execute scenario matrix
// 4. print detailed logs for each step
// 5. assert expected branch coverage and final state
// 6. exit non-zero on failure
```

Recommended `src/test.ts` initialization example:

```ts
import { App, MemStorage } from 'graphos-world-plugin'; // Do not modify this fixed access pattern.
import { WorldContext } from '../gen/World'; // Do not modify this fixed access pattern.
import createWorldContext from './app'; // Do not modify this fixed access pattern.

let _app: App = new App(new MemStorage());
let _world: WorldContext = createWorldContext(_app);

// TODO test case for world context
```

## Modification Rules (Mandatory Order)

These rules are hard constraints for any change workflow:

1. Data model and data logic changes must be applied to Graph first.
   - Complete required Context/Variant/System/Event/EventSystem updates in Graph before writing downstream code/docs/tasks.
2. Validate Graph logic is closed-loop immediately after Graph changes.
   - Run the Step 4 closure checks and ensure all closure dimensions pass.
3. Only after closed-loop validation passes, proceed to any other tasks.
   - If closure fails, return to Graph patching first; do not continue with non-Graph work.
4. After every successful graph change, update `gen/README.md` with a change record.
   - Record what was added/modified/removed and why.
   - Append to the change log section; do not overwrite previous records.
5. After every successful graph change, update `gen/GRAPH.md` with the complete current process diagram and closure checkpoints.
   - Keep the diagram in sync with the actual Step 0-6 workflow.
   - Validate that the diagram remains closed-loop (failed checks route back to patch steps).

## Procedure

### Step 0: Read Current State

1. Call `get_available_node_types` to validate node schemas.
2. Call `get_graph_description` to identify current root, contexts, and gaps.
3. If extending an existing area, call `get_graph_node` on the focus node.

Completion check:
- You know whether a World node already exists.
- You confirmed the World root node `name` is exactly `'World'`.
- You know where new Context/Variant/System/Event nodes should be attached.

### Step 1: Build Data Model and Variants

Goal: create the structural model first, then type its data.

1. Ensure exactly one `World` root exists.
   - The root node name must be exactly `World`; do not rename it or create alternative root names.
2. Create `Context` tree by domain boundaries:
   - Broad to specific: e.g. `Gameplay` -> `Player` -> `Inventory`.
   - Keep sibling contexts cohesive and low-coupling.
3. Under each relevant `World`/`Context`, add `Variant` nodes:
   - Set `name` with stable semantic naming.
   - Set `type` from `string|float|integer|boolean|JSONSchema`.
   - If `type=JSONSchema`, provide `jsonSchema` with required fields.
   - Mark `required` only for truly mandatory runtime data.
4. Apply the transaction and re-read graph.

Decision points:
- Use `Context` when modeling a domain boundary or ownership scope.
- Use `Variant` when modeling typed data inside a scope, especially when the requirement includes storage/persistence.
- Prefer `JSONSchema` only for structured objects; otherwise use primitive types.
- If data must survive as part of the graph-defined state, design it as a `Variant`.
- If data is only a temporary cache, intermediate computation result, or frame-local working set, keep it inside the relevant `System` instead of adding a `Variant`.
- Graph design should contain logical/domain state only, not presentation-layer widgets, styles, animations, or rendering concerns.
- Design `Context` and its `Variant`s so the View layer can react to data changes through observation/binding.
- If the View depends on explicit runtime states such as loading, selected, active, disabled, visible, phase, or mode, model those as logical state in `Context`/`Variant` rather than leaving them implicit in the presentation layer.

Completion check:
- Every core domain has a Context owner.
- Every runtime-critical datum has a Variant with explicit type.
- No orphan Variants without a clear World/Context parent.

### Step 2: Define Systems Based on the Data Model

Goal: bind lifecycle behavior to existing data model scopes.

1. For each behavior unit, create a `System` under its owning `World`/`Context`.
2. Define required lifecycle entry points by implementation contract:
   - `spawn`, `despawn`, `update`, `change`.
3. Document each implemented lifecycle method with clear intent, trigger, and target data scope.
4. Ensure system responsibilities align with nearby Context/Variant ownership.
5. Apply and verify topology.

Decision points:
- Place System at the nearest scope that owns the data it mutates.
- Use `Spawn` for initialization, `Update` for recurring logic, `Change` for reactive sync, `Despawn` for cleanup.
- Split a System when a single node spans unrelated responsibilities.
- `System` implementation should contain no presentation-layer logic (rendering, styling, animation, UI orchestration).
- `System` logic should be driven by `Context`/`Variant` state and domain rules only.
- Keep temporary cache data internal to the owning `System`; do not promote cache-only state into graph `Variant`s unless it must be stored as part of the domain model.

Completion check:
- Each implemented lifecycle method has a matching description.
- Systems are attached to the correct World/Context scope.
- No lifecycle method exists without a clear trigger and data target.

TypeScript example (implement System after Graph is validated):

```ts
import type { GameplayContext } from './gen/World'; // graph auto-generated TypeScript types
import type { ISystem } from 'graphos-world-plugin';

export function createGameBootstrapSystem(): ISystem<GameplayContext> {
   // optional internal cache for the System; not exposed to presentation layer
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
- Keep method behavior aligned with the closure checks in Step 4.
- Do not implement business logic before Graph data model and ownership are finalized.
- If Graph changes update generated context types, regenerate types first, then update this System implementation.
- Keep presentation behavior outside `System`; the View layer should react by observing `Context` data changes.
- Intermediate cache should be handled privately inside each `System` and should not leak into presentation concerns.
- Do not create module-level or global cache/state for `System` implementations.
- Any cache must live inside the `create...System` factory function scope (closure) so each created system instance owns its own cache.
- Put shared data contracts, constants, and Context singleton ids/names used by generated `System` code into `src/types.ts`, then import them from `System` files.
- Put runtime configuration into `src/config.ts` and read it from generated `System` logic; prefer configurable defaults over hard-coded values.
- When generating `System` code files, use PascalCase file names and keep them exactly aligned with the graph `System` node `name`.
- Example: graph node `GameBootstrapSystem` -> file `GameBootstrapSystem.ts`.
- Since `Context` provides storage capability, implement a get-or-create pattern in `System` logic: fetch existing Context/state first, and create/initialize only when missing.
- For singleton `Context` access in `System` implementations, use a fixed id with `get...ById('id')`.
- Do not fetch singleton `Context` instances through positional access such as `get...Children()[0]`, because order-based lookup is unstable and obscures identity.
- After implementing a `System`, register it in `src/app.ts` with `app.addSystem(...)`; generated code is not complete until runtime registration is wired.

### World Startup Entry Design (Mandatory)

Goal: define a clear and deterministic startup entry for world logic initialization.

You must implement the following startup pattern:

1. Initialize required `Context` in a `System.spawn` mounted under `World`.
   - Add a bootstrap system node under `World` (for example `WorldBootstrapSystem`).
   - In `spawn`, initialize the required root/domain Context instances using get-or-create semantics.
   - Keep initialization idempotent: repeated `spawn` calls must not create duplicate singleton Context data.

Startup responsibility:
- `System.spawn`: baseline/default world Context bootstrap that should exist before runtime flows.

TypeScript example (`System.spawn` for baseline initialization):

```ts
import type { ISystem } from 'graphos-world-plugin';
import { WorldContext } from '../gen/World';

export function createWorldBootstrapSystem(): ISystem<WorldContext> {
   return {
      spawn(ctx: WorldContext): void {
         // get-or-create required singleton contexts here
         // e.g. ctx.getGameplayById('gameplay') ?? ctx.createGameplay({ id: 'gameplay' })
      },
   };
}
```

Required registration wiring in `src/app.ts`:
- Register the World bootstrap system with `app.addSystem(WorldContext.Table, createWorldBootstrapSystem())`.
- Ensure bootstrap initialization remains idempotent and safe on retry/re-entry.

### Step 3: Define Events and EventSystems

Goal: model event-driven flows after data and lifecycle foundations are stable.

1. Under `World`, create `Event` nodes for key domain events:
   - Examples: `GameStarted`, `UserRegistered`, `SessionRestored`.
2. If event payload is needed, attach `Variant` nodes under each `Event`.
3. Under each `Event`, create `EventSystem` handlers:
   - Describe how handlers create/init/update Context instances.
4. Apply transaction and verify event-to-handler completeness.

Decision points:
- Create an `Event` for cross-context or explicit trigger boundaries.
- Use `EventSystem` when handling should be decoupled from per-frame System logic.
- For bootstrap flows, prefer an explicit startup/boot event plus handler.
- For UI-facing events, keep the Event data model as small as possible and prefer defining no payload fields unless data is strictly required.

Completion check:
- Every critical trigger has an Event.
- Every Event has at least one intended EventSystem handler (or explicitly documented as future work).
- Event payload Variants match handler input expectations.

TypeScript example (implement EventSystem after Graph trigger chain is validated):

```ts
import type { ChickenMergeLiteWorldContext, IChickenShootEvent } from './gen/World'; // graph auto-generated TypeScript types
import type { ISystem } from 'graphos-world-plugin';

export type SpawnBulletOnShootEventSystem = ISystem<ChickenMergeLiteWorldContext, IChickenShootEvent>;

export function createSpawnBulletOnShootEventSystem(): SpawnBulletOnShootEventSystem {
   // optional internal cache for the System; not exposed to presentation layer
   return {
      handle(event: IChickenShootEvent): void {
         // TODO
      },
   };
}
```

Implementation guidance:
- Ensure Event payload fields are defined in Graph and match `IChickenShootEvent`.
- For events consumed mainly by the presentation/UI layer, prefer signal-style Events with no payload; add fields only when the UI cannot derive the required state from `Context`.
- Keep `handle` side effects scoped to the owning Context and verified by Step 4 trigger closure.
- If Event or payload schema changes in Graph, regenerate `./gen/World.js` types before updating EventSystem code.
- Do not create module-level or global cache/state for `EventSystem` implementations.
- Any cache must live inside the `create...EventSystem` factory function scope (closure) so each created event-system instance owns its own cache.
- Put shared data contracts, constants, and Context singleton ids/names used by generated `EventSystem` code into `src/types.ts`, then import them from `EventSystem` files.
- Put runtime configuration into `src/config.ts` and read it from generated `EventSystem` logic; prefer configurable defaults over hard-coded values.
- When generating `EventSystem` code files, use PascalCase file names and keep them exactly aligned with the graph `EventSystem` node `name`.
- Example: graph node `SpawnBulletOnShootEventSystem` -> file `SpawnBulletOnShootEventSystem.ts`.
- Since `Context` provides storage capability, `EventSystem` handlers should fetch target Context/state first and create/initialize only when it does not exist.
- For singleton `Context` access in `EventSystem` implementations, use a fixed id with `get...ById('id')`.
- Do not resolve singleton `Context` instances through `get...Children()[0]` or any other position-based child lookup.
- After implementing an `EventSystem`, register it in `src/app.ts` with `app.addEventSystem(...)`; event handlers are incomplete until the app entry wires them.

Application registration example (`src/app.ts`):

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
- Register every generated `System` and `EventSystem` in `src/app.ts`.
- Keep imported symbol names aligned with the generated PascalCase file names and graph node names.
- Use the owning Context table when calling `app.addSystem(...)`.
- Use the exact graph `Event` name when calling `app.addEventSystem(...)`.
- Keep the `src/app.ts` default export signature fixed as `export default function (app: App): WorldContext`; this format is mandatory and must not be changed.

### Step 4: Closed-Loop Validation and Completion

Goal: verify the model is end-to-end closed-loop; if not, patch missing links and re-validate.

1. Run full validation after Step 1-3:
   - Re-run `get_graph_description` and compare expected topology with actual graph.
   - Optionally inspect key nodes with `get_graph_node` (World, core Contexts, bootstrap Event).
2. Validate closure dimensions:
   - Structural closure: single World root, no orphan Context/Variant/System/Event/EventSystem.
   - Data closure: each critical runtime datum exists as typed Variant and has owner scope.
   - Behavior closure: each implemented lifecycle method has a concrete description and target data.
   - Trigger closure: bootstrap and key domain triggers map to Event -> EventSystem -> target Context updates.
   - Transaction closure: all apply results are successful, or retries resolved partial failures.
3. If any closure check fails, classify and patch gaps in one focused transaction batch:
   - Missing structure/data -> go back to Step 1.
   - Missing lifecycle method coverage -> go back to Step 2.
   - Missing event trigger/handler chain -> go back to Step 3.
4. Re-run closure validation until all dimensions pass.
5. Produce final verification summary:
   - Added nodes/edges.
   - Remaining deferred items (if any) with explicit reason.
   - Confirmation that the model is closed-loop and ready for next iteration.

Completion check:
- All five closure dimensions pass.
- No unresolved critical gap remains.
- Final graph description matches intended domain design.

### Step 5: Update gen/README.md Change Log

Goal: persist a human-readable record of every graph mutation session.

1. Open (or create) `gen/README.md`.
2. Append a new change record under a `## Change Log` section using the format below:

```markdown
### YYYY-MM-DD — <short summary>

**Added**
- <node type> `<node name>` under `<parent>`: <reason>

**Modified**
- <node type> `<node name>`: <what changed and why>

**Removed**
- <node type> `<node name>`: <reason>

**Notes**
- <any closure gaps deferred, design decisions, or follow-up items>
```

3. Do not overwrite previous records — always append.
4. Keep each entry concise (one line per node change is sufficient).

Completion check:
- `gen/README.md` exists and contains an up-to-date change record for this session.
- All added/modified/removed nodes are listed.
- Deferred items or known gaps are noted.

### Step 6: Update gen/GRAPH.md Full Flow Diagram

Goal: keep an executable process diagram artifact that reflects the current workflow and closure loop.

1. Open (or create) `gen/GRAPH.md`.
2. Maintain one complete Mermaid flowchart for the end-to-end process:
   - Include Step 0 to Step 6.
   - Include closure dimensions and retry loops for failed checks.
3. After each graph mutation session, update the diagram if any step, gate, or retry path changed.
4. Validate closed-loop correctness in the diagram:
   - Any failed closure/gate must route back to the correct patch step.
   - Success path must end at final verification summary.

Completion check:
- `gen/GRAPH.md` exists and contains the latest complete flowchart.
- The flowchart includes all active steps (0-6) and retry branches.
- Diagram closure is verified: no broken success/failure path and no missing back-edge.

## Quality Gates (Final Review)

1. Structure gate: exactly one World root, its `name` is exactly `'World'`, and the Context tree is coherent.
2. Type gate: Variants are typed correctly; JSONSchema nodes contain valid schema text.
3. Ownership gate: Systems and Variants are attached to the scope that owns their data.
4. Event gate: Event/EventSystem pairs cover bootstrap and key domain triggers.
5. Verification gate: re-run `get_graph_description` after each apply and confirm expected node/edge deltas.
6. Diagram gate: `gen/GRAPH.md` is updated and reflects the current closed-loop workflow.

## Suggested Prompt Inputs

- "Design a roguelike game world with player, map, combat, and bootstrap event flow."
- "Build an e-commerce world model with catalog/order/payment contexts and event-driven order creation."
- "Create a smart-home app model with device contexts, lifecycle systems, and device-connected event handling."

## Reference Example

`skills/graph-world/World.graph.json` is a complete, real-world graph for a **Merge Chicken** tower-defense game. Use it as a concrete reference when designing new worlds.

### Structure Overview

```
World
└── Game (Context)          — shared game data
    ├── time (float)        — game time (seconds)
    ├── gold (integer)      — gold coins
    ├── wave (JSONSchema)   — current enemy wave {value, state, start_time}
    ├── egg (JSONSchema)    — egg cooldown config {time, cooldown, ...}
    ├── buy (JSONSchema)    — buy-chicken config {gold, increaseGold, ...}
    ├── heal (JSONSchema)   — heal config {gold, value}
    ├── health (JSONSchema) — global game health {value, max}
    ├── grid (JSONSchema)   — map grid {cols, rows, cell_size}
    ├── reward (JSONSchema) — claim-reward state
    ├── status (string)     — game status: none/running/paused/failed/success
    ├── Ally (Context)      — allied units (chickens)
    │   ├── level (integer)
    │   ├── attack (JSONSchema)  — {damage, speed, radius}
    │   ├── skin (string)
    │   ├── pos (JSONSchema)     — grid integer position {x, y}
    │   ├── ally_gold (Variant)  — chicken gold-production config
    │   ├── AllyAttackSystem     — launch attacks and shoot bullets based on attack data
    │   └── AllyGoldSystem       — periodically reward gold; higher level yields more gold
    ├── Enemy (Context)     — enemy units (dogs)
    │   ├── level, attack, health, move (JSONSchema)
    │   ├── skin (string), state (string: idle/walk/attack)
    │   ├── pos (JSONSchema)     — world float position {x, y}
    │   └── EnemyMoveSystem      — movement + attack-range check + self-destruct logic
    ├── Bullet (Context)    — bullets
    │   ├── damage, speed, max_count, radius (float/integer)
    │   ├── pos, dst (JSONSchema) — world float position
    │   ├── skin (integer)
    │   └── BulletMoveSystem     — bullet movement + enemy collision + attack logic
    ├── WaveSystem               — enemy wave spawn scheduling
    └── GameSystem               — initialize Game singleton, config-driven

Events (under World):
  Merge            → MergeEventSystem           — move / swap / merge chickens
  Egg              → EggEventSystem             — spawn chicken (free)
  Buy              → BuyEventSystem             — buy chicken (costs gold)
  Heal             → HealEventSystem            — restore game health
  IncreaseHealth   → IncreaseHealthEventSystem  — permanently increase max health
  Toast            → (tag, message)             — notification message
  Pause            → PauseEventSystem           — pause game
  Resume           → ResumeEventSystem          — resume game
  Reset            → ResetEventSystem           — restart after defeat (clear enemies + restore 50% health)
  ClaimReward      → ClaimRewardEventSystem     — claim stage-clear reward (multiplier supported)
```

### Key Design Patterns in This Example

1. **JSONSchema for structured data**: Use `JSONSchema` Variant type when a field groups related sub-fields (e.g., `attack = {damage, speed, radius}`). Use primitive types (`float`, `integer`, `string`) for scalar values.
2. **Config-driven Systems**: `GameSystem` initializes a singleton Game context and reads all configurable parameters (costs, cooldowns, scaling) from Variant fields, never hard-coding values.
3. **Singleton Context access**: Systems and EventSystems always fetch the Game context by fixed id (`getGameById('id')`), not by positional child lookup.
4. **Event payload minimalism**: Events like `Merge` carry only the minimum required payload (`ally_id`, `dst`). The handler derives remaining state from Context.
5. **Ephemeral state in System cache**: Frame-local working sets (bullet-enemy collision candidates, move targets per frame) live in System closure scope, not as graph Variants.
6. **Wave difficulty scaling**: `WaveSystem` reads `wave.value` to scale enemy count and stats — all scaling parameters are configurable Variants, not embedded constants.
7. **Reset flow**: `ResetEventSystem` handles `Reset` event by despawning all Enemy and Bullet contexts, restoring health by a configurable percentage, and re-triggering wave spawn after a wait period.

## Execution Notes

- Prefer atomic mutation batches with `apply_graph_transaction`.
- If partial success occurs, inspect `errors` and retry only failed intent.
- Keep node ids stable for iterative evolution.

## Complete Process Diagram

```mermaid
flowchart TD
   A[Start: load graph-world skill] --> B[Preconditions\nload graph-management\nread node types + graph state]
   B --> C[Step 0\nRead Current State]
   C --> D[Step 1\nBuild Context tree + Variants]
   D --> E{Step 1 complete?\nno orphan data\nall key variants typed}
   E -- No --> D
   E -- Yes --> F[Step 2\nDefine Systems]
   F --> G{Step 2 complete?\nlifecycle methods + intent docs\nownership aligned}
   G -- No --> F
   G -- Yes --> H[Step 3\nDefine Events + EventSystems]
   H --> I{Step 3 complete?\ncritical events covered\nhandler chain defined}
   I -- No --> H
   I -- Yes --> J[Step 4\nClosed-Loop Validation]

   J --> K{Structure closure?\n(single World, no orphans)}
   K -- No --> D
   K -- Yes --> L{Data closure?\n(typed variants + owner scope)}
   L -- No --> D
   L -- Yes --> M{Behavior closure?\n(system timing -> descriptions -> data target)}
   M -- No --> F
   M -- Yes --> N{Trigger closure?\n(Event -> EventSystem -> Context update)}
   N -- No --> H
   N -- Yes --> O{Transaction closure?\n(apply success/retry resolved)}
   O -- No --> P[Inspect errors\nretry failed intent only]
   P --> J
   O -- Yes --> Q[Quality Gates Final Review]
   Q --> R{All gates passed?}
   R -- No --> J
   R -- Yes --> T[Step 5\nUpdate gen/README.md change log]
   T --> U[Step 6\nUpdate gen/GRAPH.md full flowchart\nand verify diagram closed-loop]
   U --> S[Output final verification summary\nClosed-loop model complete]
```
