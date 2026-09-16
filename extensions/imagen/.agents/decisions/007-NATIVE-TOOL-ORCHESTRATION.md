# DECISION 007 — Native tool orchestration via imagen-commit

**Status:** Accepted
**Date:** 2026-09-16

## Context

The user requires Imagen to work with Raycast's **native chat-layer image
tools** — `@gpt_image`, `@nano_banana`, `@flux-kontext` — without requiring
personal API keys. Earlier design asserted that extension code cannot invoke
chat-layer tools; that assertion is correct at the API level (the
`@raycast/api` `AI` namespace exposes only `ask`/`AskOptions`/`Creativity`/
`Model` — verified in `node_modules/@raycast/api/types/index.d.ts` line 437,
no image or tool-invocation surface), but it does **not** preclude the
workflow the user wants.

The user's own framing (accepted): the **chat model** is the orchestrator.
It can call Imagen's tools AND the native image tools in the same turn,
because both are exposed to it as tools. Imagen's job is the **state layer**:
manifest, locks, versioning, rollback.

## Decision

Add a fourth AI tool, **`imagen-commit`**, which ingests an image file
produced by any external tool into the versioned session:

- Copies (never moves) the file into `versions/v(n+1).<ext>`.
- Applies the same progressive-lock semantics as `imagen-edit` /
  `imagen-generate` (`lock` / `unlock` inputs, `locksApplied` /
  `locksRemoved` provenance).
- Records the producing tool's label in the version's `engine` field
  (free-form, e.g. `"gpt_image"`, `"nano_banana"`, `"flux-kontext"`).
- Advances the manifest's `current` pointer.

The orchestration contract lives in `.agents/skills/SKILL.md` ("Mode A"):

1. `imagen-session` (status) → read current version + locked attributes.
2. Call the native image tool with the current version as reference and the
   locked-attributes block injected into the prompt.
3. `imagen-commit` with the produced file path, prompt, engine label, and
   lock updates.

This gives the user the exact workflow they demanded — typing `@imagen`
alongside `@nano-banana` etc. — with zero API keys on that path.

## Consequences

- Mode A (native tools) requires no BFL/OpenAI/Gemini keys; Mode B (Imagen's
  own engines) remains available for unattended flows.
- The SKILL.md is the enforcement mechanism for orchestration order; the
  extension code cannot force the model to commit, but the skill instructs
  it to commit immediately after any native-tool generation.
- `imagen-commit` copies rather than moves, so external tools' output files
  are never destroyed.
- Engine labels in Mode A are free-form strings, not the `Engine` union —
  the manifest's `engine` field is already a plain `string`.

## Alternatives rejected

- **MCP server wrapping the native tools**: impossible — MCP servers run
  outside Raycast's chat layer and have no access to chat-layer tools either.
- **Waiting for a Raycast API to invoke AI extensions from extension code**:
  no such API exists in `@raycast/api@2.3.1`; would block the feature
  indefinitely.
- **Prompt-only convention (no commit tool)**: without `imagen-commit`,
  native-tool output never enters the manifest, so versioning/rollback is
  impossible — the core value proposition is lost.
