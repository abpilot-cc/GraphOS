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
2. Bind existing logic states to presentation objects (sprite, container, UI).
3. Add necessary animation and transitions so state changes are visible and traceable.
4. Keep presentation as a pure consumer: read state and render only, do not rewrite state-machine logic.

Library convention:
- This skill defaults to a PixiJS-based stack (compatible with your pixi.js wording).

Implementation requirements:
- Prefer composition over deep inheritance.
- Keep frame-update cost controlled and avoid creating repeated objects every frame.
- Add minimal and focused comments only on critical rendering paths.

Completion checks:
- Core presentation requirements run from ./app/.
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
- Contract alignment: naming and semantics are consistent with graph-world Context, Variant, and Event.
- Maintainability: clear modules, explicit typing, readable critical render paths.
- Verifiability: at least one successful build and key integration flow validation.

## Failure Recovery

- Build fails: inspect TypeScript and asset paths in ./app/ first, then minimal build config.
- Integration fails due to logic gap: immediately route back to decision step and hand off to graph-world.
- Requirement out of scope: split out-of-scope logic items into graph-world follow-up tasks, and deliver only feasible presentation work here.

## Example Requests

- Use TypeScript + PixiJS in ./app to implement battle scene HUD and hit animation, without changing the logic layer.
- Refactor rendering layer to map existing player state to UI while keeping output in ./dist/app.
- I need one new state field for presentation usage first through graph-world, then continue presentation work.

## Scope Migration

- This file is currently a repository-scoped skill at skills/graph-world-pixijs/SKILL.md.
- For personal global reuse, copy the same skill to a user skill directory, for example ~/.copilot/skills/graph-world-pixijs/SKILL.md or ~/.agents/skills/graph-world-pixijs/SKILL.md.
