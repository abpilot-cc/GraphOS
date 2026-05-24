---
name: graph-world-bevy
description: 'Rust + Bevy (headless app/ecs/time only) implementation workflow for GraphOS world projects. Use after graph-world closes graph design, then bootstrap GraphOS project files and initialize a Rust runtime without Bevy rendering stack.'
argument-hint: 'Describe your Bevy world task, e.g. "bootstrap GraphOS + Rust bevy_app/bevy_ecs/bevy_time project in current directory and create World bootstrap systems"'
user-invocable: true
---

# GraphOS Skill: graph-world-bevy

Implement GraphOS world runtime in Rust with Bevy ECS/time only, without Bevy rendering, windowing, UI, or asset pipeline.

This skill depends on `graph-world` for graph modeling and closure validation. Use `graph-world` first whenever the request changes `World`/`Context`/`Variant`/`System`/`Event`/`EventSystem` topology.

## Scope Boundary

- This skill covers GraphOS project bootstrap plus Rust runtime initialization.
- This skill does not include TypeScript implementation code.
- This skill does not include Bevy rendering stack (`bevy_render`, `bevy_winit`, `bevy_pbr`, `bevy_ui`, `bevy_sprite`, etc.).
- If the request includes rendering or frontend integration, hand off to another presentation/runtime skill.

## When to Use

- You need a GraphOS world project with Rust runtime instead of TypeScript runtime.
- You need Bevy as ECS/runtime scheduler and time source only.
- You need a deterministic, headless app loop for world/domain logic.

## Preconditions

1. Complete graph design with `graph-world` first.
2. Finish graph closed-loop validation before runtime coding.
3. If Graph changed, regenerate/update GraphOS outputs before changing Rust runtime bindings.

## Project Bootstrap (GraphOS, No TypeScript Code)

Use this when initializing a new world project that still needs GraphOS CLI and graph metadata, but no TS runtime code.

1. Initialize npm metadata and GraphOS tooling:

```bash
npm init -y
npm i -D graphos-world-plugin graphos-cli
```

2. Ensure `package.json` contains GraphOS config with TS generators disabled:

```json
{
  "type": "module",
  "graphos": {
    "world": {
      "genTypeScript": {
        "enabled": false,
        "outDir": "gen"
      },
      "genWebTypeScript": {
        "enabled": false,
        "outDir": "app"
      },
      "genCocosCreator": {
        "enabled": false,
        "outDir": "../cocos/assets/gen"
      },
      "genBevy": {
        "enabled": true,
        "outDir": "src/gen"
      }
    }
  }
}
```

3. Ensure `package.json` scripts includes GraphOS, wasm, and cross-compile commands:

```json
{
  "scripts": {
    "graphos": "graphos",
    "build:wasm": "wasm-pack build . --target web --release --out-dir dist",
    "build:wasm:bundler": "wasm-pack build . --target bundler --release --out-dir dist",
    "build:wasm:node": "wasm-pack build . --target nodejs --release --out-dir dist",

    "build:ios:arm64": "cargo build --release --target aarch64-apple-ios",
    "build:ios:x86_64": "cargo build --release --target x86_64-apple-ios",
    "build:ios:arm64_sim": "cargo build --release --target aarch64-apple-ios-sim",

    "build:android:armv7": "cargo ndk -t armeabi-v7a build --release",
    "build:android:arm64": "cargo ndk -t arm64-v8a build --release",

    "build:macos:x86_64": "cargo build --release --target x86_64-apple-darwin",
    "build:macos:arm64": "cargo build --release --target aarch64-apple-darwin",

    "build:windows:x86_64": "cargo zigbuild --release --target x86_64-pc-windows-gnu",
    "build:linux:x86_64": "cargo zigbuild --release --target x86_64-unknown-linux-gnu"
  }
}
```

4. Create `World.graph.json` in project root:

```json
{
  "id": "main",
  "name": "World",
  "nodes": [],
  "edges": []
}
```

5. Optional verification:

```bash
npm run graphos -- --help
npm run build:wasm
npm run build:macos:arm64
```

Completion checks:
- GraphOS CLI is available.
- Graph file exists.
- No TypeScript build/runtime files are required by this skill.
- wasm-pack build scripts are available in `package.json`.
- Cross-compile scripts exist for iOS/Android/macOS/Windows/Linux targets.

## Rust + Bevy Initialization (Latest, Headless)

Goal: initialize a Rust runtime that uses Bevy ECS/time scheduling only.

### Step 1: Initialize Rust crate in current directory

```bash
# Run this in the project root directory.
cargo init --bin .
```

If a Cargo project already exists in the current directory, skip this step.

### Step 2: Add Bevy runtime dependencies (no rendering)

Preferred (single `bevy` crate, default features disabled):

```bash
cargo add bevy --no-default-features --features bevy_app,bevy_ecs,bevy_time
```

Fallback (if feature flags change in newer Bevy releases):

```bash
cargo add bevy_app bevy_ecs bevy_time
```

Rules:
- Always use the latest published versions.
- Do not enable rendering/window/UI-related features.
- Keep dependency set minimal: app, ecs, time.

### Step 3: Minimal runtime app (no renderer)

Before wiring systems, initialize base source files for generated modules.

`src/gen/mod.ts`:

```ts
// This is auto-generated code.
```

`src/lib.rs`:

```rust
pub mod r#gen;
```

Then implement runtime entry logic.

`src/main.rs` example:

```rust
use bevy_app::{App, Startup, Update};
use bevy_ecs::prelude::*;
use bevy_time::{Time, TimePlugin};

#[derive(Component, Default)]
struct TickAge(f32);

fn setup(mut commands: Commands) {
    commands.spawn(TickAge::default());
}

fn tick(time: Res<Time>, mut q: Query<&mut TickAge>) {
    for mut age in &mut q {
        age.0 += time.delta_secs();
    }
}

fn main() {
    App::new()
        .add_plugins(TimePlugin)
        .add_systems(Startup, setup)
        .add_systems(Update, tick)
        .run();
}
```

### Step 4: Build verification

```bash
cargo check
cargo run
```

### Step 5: wasm-pack packaging

1. Install wasm target and wasm-pack:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

2. Ensure root `Cargo.toml` exposes cdylib:

```toml
[lib]
crate-type = ["cdylib", "rlib"]
```

3. Build/package with npm scripts:

```bash
npm run wasm:build
# or
npm run wasm:build:bundler
npm run wasm:build:node
```

4. Optional direct command:

```bash
wasm-pack build . --target web --release --out-dir pkg
```

Completion checks:
- Runtime compiles and runs.
- ECS systems execute.
- Time resource updates normally.
- No Bevy render/window/UI modules are linked.
- `pkg/` contains wasm-pack artifacts (`.wasm`, JS glue, package metadata).

### Step 6: Cross-compile setup on macOS

1. Install Rust targets:

```bash
rustup target add \
  aarch64-apple-ios \
  x86_64-apple-ios \
  aarch64-apple-ios-sim \
  armv7-linux-androideabi \
  aarch64-linux-android \
  x86_64-apple-darwin \
  aarch64-apple-darwin \
  x86_64-pc-windows-gnu \
  x86_64-unknown-linux-gnu
```

2. Install cross-compile helpers:

```bash
brew install zig
cargo install cargo-zigbuild
cargo install cargo-ndk
```

3. Configure Android NDK (required by `cargo ndk`):

```bash
export ANDROID_NDK_HOME=/path/to/android-ndk
export ANDROID_NDK_ROOT="$ANDROID_NDK_HOME"
```

4. Run platform builds:

```bash
# iOS
npm run build:ios:arm64
npm run build:ios:x86_64
npm run build:ios:arm64_sim

# Android
npm run build:android:armv7
npm run build:android:arm64

# macOS
npm run build:macos:x86_64
npm run build:macos:arm64

# Windows / Linux (cross on macOS via zig)
npm run build:windows:x86_64
npm run build:linux:x86_64
```

Output notes:
- Rust artifacts are generated under `target/<triple>/release/`.
- Android `cargo ndk` outputs ABI-specific artifacts for `armeabi-v7a` and `arm64-v8a`.
- For iOS universal libs, combine device/simulator outputs later with Xcode tooling as needed.

## GraphOS Integration Notes for Rust Runtime

- Keep graph topology/design operations in `graph-world` workflow.
- Keep runtime implementation in Rust under this skill.
- If Graph model changes, apply Graph changes first, then update Rust side adapters/systems.
- Do not introduce TypeScript runtime code in this workflow.

## Quality Gates

1. Graph-first gate: runtime coding starts only after graph closure validation passes.
2. No-TS gate: no TypeScript runtime implementation is introduced.
3. Headless-Bevy gate: no rendering/window/UI Bevy modules enabled.
4. Minimal-runtime gate: app, ecs, time capabilities are present and verified.
5. Build gate: `cargo check` succeeds for the Rust runtime crate.
6. wasm gate: `wasm-pack build` succeeds and outputs package files.
7. cross-compile gate: all required target scripts complete successfully on macOS toolchain.

## Failure Recovery

- `cargo add bevy --no-default-features ...` fails due to feature changes:
  use split crates `bevy_app`, `bevy_ecs`, `bevy_time` instead.
- Runtime compiles but time is not advancing:
  verify `TimePlugin` is added and systems run on `Update` schedule.
- Rendering-related crate unexpectedly appears:
  remove it and re-check `Cargo.toml` features/dependencies.
- `wasm-pack` build fails due to missing wasm target:
  run `rustup target add wasm32-unknown-unknown` and retry.
- `wasm-pack` build fails because crate type is not compatible:
  add `[lib] crate-type = ["cdylib", "rlib"]` to root `Cargo.toml`.
- Android build fails with NDK not found:
  set `ANDROID_NDK_HOME` and `ANDROID_NDK_ROOT`, then rerun `cargo ndk` scripts.
- Windows/Linux cross compile fails on macOS linker:
  install `zig` and use `cargo zigbuild` scripts (do not use plain `cargo build` for those targets).
- iOS build fails due to missing target:
  run `rustup target add <ios-target>` and retry.
- Request needs graph topology change:
  pause Rust edits and switch back to `graph-world` first.

## Example Requests

- Bootstrap a GraphOS world project for Rust runtime with no TypeScript runtime code.
- Initialize a Bevy headless app using only app/ecs/time and add a basic tick system.
- Migrate existing world runtime from TS to Rust + Bevy ECS/time while keeping graph workflow unchanged.
