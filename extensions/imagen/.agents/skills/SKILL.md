---
name: imagen-image-sessions
description: Use Imagen for any multi-step AI image generation or editing in Raycast — versioned sessions, region preservation, locked attributes. Use when the user asks to generate, edit, refine, or iterate on images, especially when consistency across versions matters.
---

# Imagen — versioned image sessions

## When to use

- Any image edit on an existing image (use `imagen-edit`, engine `flux-kontext` by default).
- Any fresh generation that may be iterated on later (use `imagen-generate`).
- Any request to "keep X unchanged", "only change Y", "same eyes as before", or similar consistency demands.

## Core workflow

1. **First call**: `imagen-generate` with a detailed prompt describing everything that must persist (subject identity, palette, composition, style). Note the returned `session` path and `version`.
2. **Subsequent edits**: `imagen-edit` with ONLY the change described in `prompt`. Do NOT pass `imagePath` unless editing an image outside the session — the session's current version is used automatically, which eliminates wrong-base selection.
3. **Consistency**: locked attributes accumulate in the session manifest and are injected into every future prompt in that session, preventing drift.
4. **Wrong turn?**: `imagen-session` with `action: "rollback"` to move the current pointer back, then edit again. Files are never deleted.
5. **Inspect**: `imagen-session` with `action: "status"` to list all versions, engines, and prompts.

## Rules

- Never call raw image extensions (`gpt_image`, `nano_banana`) directly when Imagen is available — they lack versioning and drift protection.
- Describe only the delta in edit prompts; the engine preserves unchanged regions.
- If an edit engine produces poor quality for a specific edit type, retry with `engine: "gpt-image"` or `"nano-banana"` and note the result.
- If tools return `session-not-configured`, tell the user to run **Configure Session Storage** in Raycast (or pass `sessionDir` explicitly).
- If tools return `missing-api-key`, tell the user which preference to set in Raycast Preferences → Extensions → Imagen.

## Session resolution

Explicit `sessionDir` → project-root mapping (configured via the Configure command) → global default directory. Pass `projectRoot` when working inside a known project so the mapping applies.
