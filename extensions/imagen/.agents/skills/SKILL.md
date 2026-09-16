---
name: imagen-image-sessions
description: Use Imagen for any multi-step AI image generation or editing in Raycast — versioned sessions, region preservation, locked attributes. Works with Raycast's native image tools (@gpt_image, @nano_banana, @flux-kontext) via imagen-commit, or with Imagen's own API-key engines. Use when the user asks to generate, edit, refine, or iterate on images, especially when consistency across versions matters.
---

# Imagen — versioned image sessions

## When to use

- Any image edit on an existing image (use `imagen-edit`, engine `flux-kontext` by default).
- Any fresh generation that may be iterated on later (use `imagen-generate`).
- Any request to "keep X unchanged", "only change Y", "same eyes as before", or similar consistency demands.
- Any workflow where the user invokes native image tools (`@gpt_image`, `@nano_banana`, `@flux-kontext`) — commit their output with `imagen-commit`.

## Two modes

**Mode A — native tools (no API keys).** The chat model orchestrates:

1. `imagen-session` (action `status`) to read the manifest: current version, locked attributes, history.
2. Call the native image tool the user named (`@gpt_image`, `@nano_banana`, or `@flux-kontext`), passing the session's current image as the reference/attachment and injecting the locked-attributes block into the prompt.
3. `imagen-commit` with the produced file path, the prompt used, the engine label, and any `lock`/`unlock` updates. This records v(n+1) and advances the pointer.

**Mode B — Imagen engines (API keys configured).** Same workflow, but steps 1–3 collapse into a single `imagen-generate` or `imagen-edit` call; Imagen calls the engine over HTTPS itself.

Prefer Mode A when the user explicitly invokes native tools or has no API keys configured. Prefer Mode B for unattended/automated flows.

## Core workflow (Mode B)

1. **First call**: `imagen-generate` with a detailed prompt describing everything that must persist (subject identity, palette, composition, style). Note the returned `session` path and `version`.
2. **Subsequent edits**: `imagen-edit` with ONLY the change described in `prompt`. Do NOT pass `imagePath` unless editing an image outside the session — the session's current version is used automatically, which eliminates wrong-base selection.
3. **Consistency**: locked attributes accumulate in the session manifest and are injected into every future prompt in that session, preventing drift.
4. **Wrong turn?**: `imagen-session` with `action: "rollback"` to move the current pointer back, then edit again. Files are never deleted.
5. **Inspect**: `imagen-session` with `action: "status"` to list all versions, engines, and prompts.

## Rules

- After ANY native image tool produces a file, commit it with `imagen-commit` before doing anything else — uncommitted images are invisible to the session and will be lost to drift.
- When editing in Mode A, always pass the session's CURRENT version file (from `imagen-session` status) as the reference image to the native tool — never a stale or remembered path.
- Describe only the delta in edit prompts; inject the locked-attributes block verbatim.
- If an edit engine produces poor quality for a specific edit type, retry with a different engine and note the result.
- If tools return `session-not-configured`, tell the user to run **Configure Session Storage** in Raycast (or pass `sessionDir` explicitly).
- If tools return `missing-api-key`, either tell the user which preference to set in Raycast Preferences → Extensions → Imagen, or fall back to Mode A with the native tools.

## Session resolution

Explicit `sessionDir` → project-root mapping (configured via the Configure command) → global default directory. Pass `projectRoot` when working inside a known project so the mapping applies.
