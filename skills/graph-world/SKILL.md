---
name: graph-world
description: 'Design World/Context/Variant/System/Event/EventSystem graph models for games and applications. Use when creating domain models, lifecycle systems, bootstrap events, and event-driven context initialization in GraphOS. Depends on graph-management skill for graph read/apply APIs.'
argument-hint: 'Describe your domain and goals, e.g. "RPG world with player inventory and bootstrap initialization"'
user-invocable: true
---

# GraphOS Skill: graph-world

Design a world model in GraphOS using node-first architecture for games and applications.

This skill depends on `graph-management` for graph inspection and transaction apply APIs.

## Node Semantics

- World: Single root context of the whole model.
- Context: Hierarchical domain/data model node under World or Context.
- Variant: Typed variable definition under World or Context.
- System: Lifecycle logic node under World or Context.
- Event: World-level event definition.
- EventSystem: Event-driven handler under Event.

## When to Use

- You are designing a new game/app world model from scratch.
- You need to convert business domains into nested Context trees.
- You need typed data variables (Variant) before writing lifecycle logic.
- You need event-driven initialization or runtime flows (for example game startup).

## Preconditions

1. Load and use `graph-management` skill first.
2. Read available node types and current graph state before mutation.
3. Use one coherent transaction per design step when possible.

## Modification Rules (Mandatory Order)

These rules are hard constraints for any change workflow:

1. Data model and data logic changes must be applied to Graph first.
   - Complete required Context/Variant/System/Event/EventSystem updates in Graph before writing downstream code/docs/tasks.
2. Validate Graph logic is closed-loop immediately after Graph changes.
   - Run the Step 4 closure checks and ensure all closure dimensions pass.
3. Only after closed-loop validation passes, proceed to any other tasks.
   - If closure fails, return to Graph patching first; do not continue with non-Graph work.

## Procedure

### Step 0: Read Current State

1. Call `get_available_node_types` to validate node schemas.
2. Call `get_graph_description` to identify current root, contexts, and gaps.
3. If extending an existing area, call `get_graph_node` on the focus node.

Completion check:
- You know whether a World node already exists.
- You know where new Context/Variant/System/Event nodes should be attached.

### Step 1: Build Data Model and Variants

Goal: create the structural model first, then type its data.

1. Ensure exactly one `World` root exists.
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
- Use `Variant` when modeling typed data inside a scope.
- Prefer `JSONSchema` only for structured objects; otherwise use primitive types.

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

Completion check:
- Each implemented lifecycle method has a matching description.
- Systems are attached to the correct World/Context scope.
- No lifecycle method exists without a clear trigger and data target.

TypeScript example (implement System after Graph is validated):

```ts
import type { GameplayContext } from './gen/World.js'; // graph auto-generated TypeScript types
import type { ISystem } from 'graphos-world-plugin';

export function createGameBootstrapSystem(): ISystem<GameplayContext> {
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

Completion check:
- Every critical trigger has an Event.
- Every Event has at least one intended EventSystem handler (or explicitly documented as future work).
- Event payload Variants match handler input expectations.

TypeScript example (implement EventSystem after Graph trigger chain is validated):

```ts
import type { ChickenMergeLiteWorldContext, IChickenShootEvent } from './gen/World.js'; // graph auto-generated TypeScript types
import type { ISystem } from 'graphos-world-plugin';

export type SpawnBulletOnShootEventSystem = ISystem<ChickenMergeLiteWorldContext, IChickenShootEvent>;

export function createSpawnBulletOnShootEventSystem(): SpawnBulletOnShootEventSystem {
   return {
      handle(event: IChickenShootEvent): void {
         // TODO
      },
   };
}
```

Implementation guidance:
- Ensure Event payload fields are defined in Graph and match `IChickenShootEvent`.
- Keep `handle` side effects scoped to the owning Context and verified by Step 4 trigger closure.
- If Event or payload schema changes in Graph, regenerate `./gen/World.js` types before updating EventSystem code.

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

## Quality Gates (Final Review)

1. Structure gate: exactly one World root and coherent Context tree.
2. Type gate: Variants are typed correctly; JSONSchema nodes contain valid schema text.
3. Ownership gate: Systems and Variants are attached to the scope that owns their data.
4. Event gate: Event/EventSystem pairs cover bootstrap and key domain triggers.
5. Verification gate: re-run `get_graph_description` after each apply and confirm expected node/edge deltas.

## Suggested Prompt Inputs

- "Design a roguelike game world with player, map, combat, and bootstrap event flow."
- "Build an e-commerce world model with catalog/order/payment contexts and event-driven order creation."
- "Create a smart-home app model with device contexts, lifecycle systems, and device-connected event handling."

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
   R -- Yes --> S[Output final verification summary\nClosed-loop model complete]
```
