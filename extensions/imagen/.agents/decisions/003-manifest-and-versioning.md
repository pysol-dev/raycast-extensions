# DECISION 003 — Manifest format and versioning

**Status:** Accepted
**Date:** 2026-09-13

## Context

The core problem: long image-editing sessions lose state. Nothing records which prompt produced which image, which engine made it, what it was based on, or which attributes must persist. Raycast's built-in extensions keep no history.

## Decision

Each session is a directory:

```
<session-dir>/<session-name>/
├── manifest.json
└── versions/
    ├── v1.png
    ├── v2.png
    └── ...
```

`manifest.json` (schema version 1):

```json
{
  "schema": 1,
  "name": "patchwerks-logo",
  "createdAt": "...",
  "updatedAt": "...",
  "current": 3,
  "versions": [
    { "n": 1, "file": ".../v1.png", "engine": "gpt-image", "prompt": "...", "createdAt": "...", "basedOn": null },
    { "n": 2, "file": ".../v2.png", "engine": "flux-kontext", "prompt": "add torn corner", "createdAt": "...", "basedOn": 1 }
  ],
  "locked": { "eyes": "all-black ovals with gloss", "palette": "pink, blue, orange, red" }
}
```

Key properties:

- **Append-only versions.** Every generation or edit writes `v(n+1)` and updates `current`. Nothing is ever overwritten or deleted.
- **`basedOn` lineage.** Each version records which version it was derived from, making the edit chain auditable.
- **`locked` attributes.** Accumulate across calls, stored in the manifest, and injected into every prompt — the anti-drift mechanism.
- **Pointer-based rollback.** `imagen-session` rollback/set-current moves only the `current` pointer; files remain, so any version is revisitable.
- **Atomic writes.** Manifest is written to a temp file then renamed, preventing corruption on crash.
- **`schema` field.** Breaking changes bump the version and require a migration in `readManifest`.

## Consequences

- Sessions are plain files — inspectable with `cat`, diffable, and safe to commit or sync.
- Disk usage grows with versions; acceptable for image work (PNGs are small relative to the value of history). A future `prune` action could be added without breaking the schema.
- The manifest doubles as the AI-facing state: `imagen-session` returns it directly, so the model always knows the full history without re-reading files.
