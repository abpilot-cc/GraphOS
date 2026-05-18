---
name: graph-world-pixijs
description: 'TypeScript + PixiJS (pixi.js intent) game presentation workflow for GraphOS. Use when implementing rendering, UI, animation, scene composition, camera, and view-state binding in ./app with build output to ./dist/app. Depends on graph-world for any logic-layer or graph model changes.'
argument-hint: 'Describe the game presentation task, e.g. "implement battle scene rendering and UI state binding without changing the logic layer"'
user-invocable: true
---

# GraphOS Skill: graph-world-pixijs

Develop the game presentation layer in the current workspace using TypeScript and PixiJS (interpreting your pixi.js request as PixiJS), and integrate with graph-world logic-layer rules.

## Scope Boundary

- Implement presentation only (rendering, animation, camera, UI, visual input feedback, asset loading and display).
- Do not directly modify logic-layer artifacts such as World model, Context, Variant, System, Event, or EventSystem in this skill.
- If a request requires logic-layer changes, hand off to graph-world first, then continue presentation implementation.
- **STRICT RULE: Never import or reference logic-layer source files directly (e.g. `src/` of the world package). All logic-layer access MUST go through `graphos-world-client`.**

## Logic Layer Access via graphos-world-client

All presentation code accesses the running logic layer exclusively through the `graphos-world-client` npm package. Direct imports from logic-layer source folders are forbidden.

### Installation

```bash
npm install graphos-world-client
```

### Standard Usage Pattern

```typescript
import { Client } from 'graphos-world-client';

const client = new Client();

function update() {
    for (const object of client.objects()) {
        // Read object state and drive PixiJS rendering here
    }
    requestAnimationFrame(update);
}

requestAnimationFrame(update);
```

### Object Types

- Object types returned by `client.objects()` are defined in `app/World.ts`.
- `app/World.ts` is **auto-generated** — do NOT modify it manually.
- Import types from `app/World.ts` for TypeScript type safety in presentation code.

```typescript
import type { SomeObjectType } from './World';
```

### Rules

1. Only read object state from `client.objects()` inside the render loop; do not cache stale snapshots across frames unless intentionally diffing.
2. Never call logic-layer APIs to mutate state from the presentation layer — mutation is the logic layer's responsibility.
3. If `client.objects()` does not expose a field you need, request the logic-layer change through graph-world first.
4. Default to immediate-mode rendering for dynamic geometry: in each frame, clear PixiJS `Graphics` and redraw based on current logic object state and object-to-object relationships.
5. If per-object rendering resources are needed (for example sprite, graphics wrapper, text, animation handles), store them in `WeakMap<IObject, ResourceHandle>` keyed by the logic object reference.

### Lifecycle Events via Client

If presentation needs object lifecycle hooks (create/update/destroy), listen to `Client` events instead of introducing logic-layer coupling.

Available event classes from `graphos-world-client`:

```typescript
export declare class SpawnEvent extends Event {
    readonly object: IObject;
    constructor(object: IObject);
}
export declare class DespawnEvent extends Event {
    readonly object: IObject;
    constructor(object: IObject);
}
export declare class ChangeEvent extends Event {
    readonly object: IObject;
    readonly changes: Partial<IObject>;
    constructor(object: IObject, changes: Partial<IObject>);
}
```

Runtime event names are `spawn`, `despawn`, and `change`:

```typescript
import { Client, SpawnEvent, DespawnEvent, ChangeEvent } from 'graphos-world-client';

const client = new Client();

client.addEventListener('spawn', (event) => {
    const e = event as SpawnEvent;
    // Initialize presentation resources for e.object if needed
});

client.addEventListener('change', (event) => {
    const e = event as ChangeEvent;
    // React to changed fields in e.changes
});

client.addEventListener('despawn', (event) => {
    const e = event as DespawnEvent;
    // Cleanup resources associated with e.object
});
```

## Directory and Output Constraints

- Presentation source code must be under ./app/.
- Build output must be under ./dist/app/.
- Do not place presentation implementation into logic-layer folders or Graph generated folders.

## When to Use

- You need to implement or refactor game visuals, scenes, character presentation, UI components, or effects.
- You need to map existing logic states to the visual layer.
- You need to improve rendering structure, performance, or maintainability without changing graph logic models.

## Required Decision Routing

1. First decide whether the task includes logic-layer changes.
   - If yes: pause presentation coding and run graph-world first to complete logic updates and closed-loop verification.
   - If no: continue this skill workflow.
2. After logic updates are complete, return to this skill for presentation adaptation.

## Workflow

### Step 0: Task Split and Boundary Confirmation

1. Split requirements into presentation requirements and logic requirements.
2. Explicitly list read-only dependencies (available Context, Variant, Event) and open questions.
3. Confirm this implementation touches only ./app/ plus minimal required build configuration.

Completion checks:
- It is clear whether graph-world must run first.
- In-scope and out-of-scope presentation items are explicit.

### Step 1: Presentation Architecture Design (app only)

1. Organize scene, view, component, and asset modules inside ./app/.
2. Define a state-mapping layer that converts logic state to view state without introducing new business rules.
3. Keep input handling presentation-only (for example button highlight and animation triggers), without adding business decisions.

Design requirements:
- Keep component responsibilities focused and avoid a monolithic scene class.
- Separate render update flow from data-mapping flow for testability and replacement.
- Use explicit TypeScript types for view models and rendering interfaces.

Completion checks:
- ./app/ has clear module layering.
- No logic-layer rules are implemented in presentation code.

### Step 2: PixiJS + TypeScript Implementation

1. Implement scene bootstrap, asset loading, render loop, and UI mounting.
2. Access object state exclusively via `client.objects()` from `graphos-world-client`. Never import from logic-layer source directories.
3. Import object type definitions from `app/World.ts` (auto-generated; read-only).
4. Bind object state to PixiJS presentation objects (Sprite, Container, Graphics, UI components).
5. Add necessary animation and transitions so state changes are visible and traceable.
6. Keep presentation as a pure consumer: read state and render only, do not rewrite state-machine logic.

Library convention:
- This skill defaults to a PixiJS-based stack (compatible with your pixi.js wording).
- Logic-layer bridge: `graphos-world-client` (`Client` class, `client.objects()` iterator).

Implementation requirements:
- Prefer composition over deep inheritance.
- Keep frame-update cost controlled and avoid creating repeated objects every frame.
- Add minimal and focused comments only on critical rendering paths.
- Use TypeScript types from `app/World.ts` for all object state fields accessed in rendering.
- For relationship-heavy dynamic visuals, prefer a `Graphics.clear()` + redraw flow per frame (immediate mode) over long-lived retained geometry.
- For retained PixiJS resources, associate objects and resources with `WeakMap` so resources follow object lifecycle without manual ownership coupling.
- If lifecycle-level initialization or disposal is required, subscribe to `spawn` / `change` / `despawn` events from `Client`.

Completion checks:
- Core presentation requirements run from ./app/.
- All logic-layer reads go through `graphos-world-client`, not direct source imports.
- No new logic-layer entities or graph structure changes are introduced.

### Step 3: Build and Output Verification

1. Ensure build target outputs to ./dist/app/.
2. Run build and verify output path, entry file, and asset references.
3. If build pipeline conflicts with existing project settings, make minimal and scoped adjustments only.

Completion checks:
- Artifacts are generated in ./dist/app/.
- Non-presentation modules are not impacted.

### Step 4: Integration and Regression Check

1. Integrate using logic states provided by graph-world.
2. Validate key scenarios: initialization, state transitions, event feedback, and fallback presentation.
3. If new or changed logic state is required:
   - Stop additional presentation patching.
   - Record the contract gap and hand off to graph-world.
   - Resume integration after logic updates are complete.

Completion checks:
- Presentation and logic contracts are aligned.
- Logic gaps are explicitly handed off and not bypassed in this skill.

## Quality Criteria

- Correct boundary: presentation code does not carry business decisions.
- Correct paths: source in ./app/ and build output in ./dist/app/.
- Client-only access: all logic-layer state is read through `graphos-world-client`; no direct imports from logic-layer source folders.
- Type safety: object types from `app/World.ts` (auto-generated) are used throughout presentation code; `app/World.ts` is never modified.
- Rendering rule: immediate-mode redraw paths use PixiJS `Graphics` clear-and-redraw based on current object state and relationships.
- Resource binding: object-scoped rendering resources may use `WeakMap<IObject, ...>` and are cleaned up on despawn.
- Lifecycle hooks: lifecycle-sensitive presentation behavior listens to `Client` events (`spawn`, `change`, `despawn`) with `SpawnEvent` / `ChangeEvent` / `DespawnEvent` typing.
- Contract alignment: naming and semantics are consistent with graph-world Context, Variant, and Event.
- Maintainability: clear modules, explicit typing, readable critical render paths.
- Verifiability: at least one successful build and key integration flow validation.

## Failure Recovery

- Build fails: inspect TypeScript and asset paths in ./app/ first, then minimal build config.
- `client.objects()` returns unexpected or missing fields: stop presentation patching, identify the missing contract, and hand off to graph-world to expose the field.
- Immediate-mode redraw performance degrades: keep immediate mode for dynamic links/relations, but move static layers to retained containers and profile draw-call hotspots.
- Lifecycle mismatch (missing init/cleanup timing): verify `spawn` / `change` / `despawn` event wiring on `Client` before adding workaround state in presentation.
- Type mismatch on `app/World.ts` types: re-read `app/World.ts` (do not edit it); adjust presentation code to match the generated types.
- Integration fails due to logic gap: immediately route back to decision step and hand off to graph-world.
- Requirement out of scope: split out-of-scope logic items into graph-world follow-up tasks, and deliver only feasible presentation work here.

## Example Requests

- Use TypeScript + PixiJS in ./app to implement battle scene HUD and hit animation, without changing the logic layer.
- Refactor rendering layer to map existing player state to UI while keeping output in ./dist/app.
- I need one new state field for presentation usage first through graph-world, then continue presentation work.
- Render all objects from `client.objects()` as PixiJS sprites, using types from `app/World.ts`.

## Scope Migration

- This file is currently a repository-scoped skill at skills/graph-world-pixijs/SKILL.md.
- For personal global reuse, copy the same skill to a user skill directory, for example ~/.copilot/skills/graph-world-pixijs/SKILL.md or ~/.agents/skills/graph-world-pixijs/SKILL.md.
