# DECISION 001 — Session directory scoping

**Status:** Accepted
**Date:** 2026-09-13

## Context

Imagen tools need a place to store session manifests and version files. The user wants:

- A **universal tool** — not bound to one project or named after one chat.
- **Per-project scoping** when used inside a project, with a sensible default otherwise.
- No repeated manual configuration every time the tool is used in a new project.

## Investigation

The Raycast `Environment` interface (verified in `node_modules/@raycast/api/types/index.d.ts`, line 2659) exposes:

```
raycastVersion, ownerOrAuthorName, extensionName, entryPointType,
entryPointName, entryPointMode, assetsPath, supportPath, isDevelopment,
appearance, textSize, launchType, canAccess, launchContext, commandName, commandMode
```

**There is no API to detect the caller's "current project" or working directory.** Raycast AI tools receive only their declared input plus this environment — they cannot auto-detect which repo or folder the user is "in". This was verified against both the type definitions and the official docs (`https://developers.raycast.com/api-reference/environment`, retrieved via `curl -sL "https://developers.raycast.com/environment.md?ask=..."`).

## Decision

Three-tier resolution, in fixed order:

1. **Explicit `sessionDir`** in the tool input — full manual control per call.
2. **Project-root mapping** — the user maps a project root (e.g. `~/dev/patchwerks`) to a session directory once, via the **Configure Session Storage** command. Mappings are stored in `LocalStorage` under `imagen.root:<path>` and matched by **longest prefix**, so subdirectories of a mapped root inherit it.
3. **Global default directory** — a `directory`-type extension preference.

If none resolve, tools return a structured `session-not-configured` error with setup instructions instead of guessing.

## Consequences

- One-time setup per project (a directory picker in the Configure command), then zero friction.
- Longest-prefix matching means mapping a monorepo root covers all subprojects.
- LocalStorage is used only for small key→path mappings, consistent with the docs' guidance that LocalStorage is not for large data (`https://developers.raycast.com/api-reference/storage`); image files are written with Node `fs`.
- A future Raycast API for project detection could replace tier 2 automatically; the resolution function is the single place to change.
