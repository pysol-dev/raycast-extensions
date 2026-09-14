# DECISION 004 — Extension vs. in-chat convention

**Status:** Accepted
**Date:** 2026-09-13

## Context

The original problem (image drift, wrong-base edits, lost history) could have been addressed with an in-chat convention: "always read/write a manifest file before/after image calls." The user explicitly rejected this: consistency must not depend on model discipline, and the tool should be shareable with others.

## Investigation

Raycast's AI extension system supports **tools** — functions the AI can call, defined in the extension manifest and implemented in `src/tools/<name>.ts`. Verified from the official docs and the manifest JSON schema (`https://www.raycast.com/schemas/extension.json`):

- `tools` items require `name`, `title`, `description` (min 12 chars); optional `keywords` (max 12), `functionalities` (`"AI tool"`), `preferences`.
- Tool implementation contract (from `https://developers.raycast.com/api-reference/tools` and the bundled types): default-exported async function, max one parameter which must be a single object; input JSON schema is auto-extracted from TypeScript types (string-literal unions become enums); JSDoc on the default export and each input field becomes AI-facing instructions; an exported `confirmation` runs before the tool with the same input; the return value is given back to the AI.
- The `ai` manifest key (recommended as `ai.yaml` at extension root) provides `instructions` injected as a system message when the extension is mentioned, plus evals runnable via `npx ray evals`.

This means the manifest-read/write discipline can be **enforced by code** — the tool always loads the manifest, always appends versions, always injects locked attributes — with zero reliance on the model remembering a convention.

## Decision

Build Imagen as a **real Raycast extension** with three AI tools, not an in-chat convention or a per-project script.

Supporting choices:

- **`ai.yaml` at repo root** for extension-level `instructions` (docs-recommended location over the inline manifest key).
- **JSDoc-driven instructions**: the tool descriptions and input docs live next to the code, so the AI-facing contract and implementation cannot drift apart.
- **Structured errors** (`session-not-configured`, `missing-api-key`, `no-base-image`) instead of thrown exceptions where the AI can act on the error — the model gets actionable setup guidance rather than a stack trace.
- **Confirmation only where surprising**: `imagen-edit` confirms when an explicit `imagePath` outside the session is edited; in-session edits are append-only and need no confirmation.

## Consequences

- Distributable via the Raycast Store (`npm run publish` opens a PR into `raycast/extensions`), satisfying the shareability requirement.
- Works identically in every chat, every project, every machine where the extension is installed.
- Extension-level `ai.yaml` instructions make the routing rule (Kontext for edits) visible to the AI even before it reads the skill file.
