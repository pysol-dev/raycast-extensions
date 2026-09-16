# AGENTS.md — Imagen

Guidance for AI agents working in this repository.

## What this is

A Raycast extension providing versioned, manifest-driven AI image generation and editing. Four AI tools (`imagen-generate`, `imagen-edit`, `imagen-session`, `imagen-commit`) plus one view command (`configure`). `imagen-commit` ingests images produced by Raycast's native image tools (`@gpt_image`, `@nano_banana`, `@flux-kontext`) into the session — see `.agents/decisions/007-NATIVE-TOOL-ORCHESTRATION.md`.

## Repository layout

```
src/
├── lib/
│   ├── session.ts        # session resolution, manifest read/write, versioning
│   └── engines.ts        # engine routing + HTTP clients (BFL, OpenAI, Gemini)
├── tools/
│   ├── imagen-edit.ts    # edit tool (default engine: flux-kontext)
│   ├── imagen-generate.ts# generation tool (default engine: gpt-image)
│   ├── imagen-session.ts # manifest inspection / rollback
│   └── imagen-commit.ts  # ingest external/native-tool images into the session
└── configure.tsx         # view command: default dir + project mappings
assets/icon.png           # 512×512 store icon (required)
.agents/
├── skills/SKILL.md       # agent skill for image-session workflows
└── decisions/            # design decision records with doc citations
```

## Hard rules

1. **Never hardcode API keys.** All keys come from extension preferences (`password` type) via `getPreferenceValues()`.
2. **Never delete version files.** Rollback and set-current only move the manifest's `current` pointer.
3. **Manifest writes are atomic** — write to `manifest.json.tmp`, then `rename`. Preserve this pattern.
4. **Session resolution order is fixed**: explicit `sessionDir` → project-root mapping (longest prefix) → default preference → structured `session-not-configured` error. Do not add fallbacks that guess a directory.
5. **Engine routing defaults**: edits → `flux-kontext`, generations → `gpt-image`. Changes to defaults require a new decision record in `.agents/decisions/`.
6. **Tool contract**: each tool is a default-exported async function taking a single object input; JSDoc on the export and on each input field becomes the AI-facing instructions. Input types must be JSON-schema-serializable (string-literal unions become enums; unsupported types fail in strict mode).
7. **Manifest schema versioning**: `schema: 1`. Any breaking manifest change bumps the number and adds a migration path in `readManifest`.

## Build & verify

```bash
npm install
npm run lint     # ray lint
npm run build    # ray build -e dist
```

Both must pass before committing. The manifest is validated against
`https://www.raycast.com/schemas/extension.json` at build time.

## Docs used for design decisions

Citations live in `.agents/decisions/*.md`. Key sources:

- Manifest schema: https://www.raycast.com/schemas/extension.json
- Tools: https://developers.raycast.com/api-reference/tools
- AI extensions concepts: https://developers.raycast.com/basics/ai-extensions/learn-core-concepts-of-ai-extensions
- CLI: https://developers.raycast.com/basics/developers/ray-cli
- Preferences: https://developers.raycast.com/api-reference/preferences
- LocalStorage: https://developers.raycast.com/api-reference/storage
- Publishing: https://developers.raycast.com/basics/publish-an-extension

Retrieve docs as markdown with `curl -sL "https://developers.raycast.com/<path>.md?ask=<question>&goal=<goal>"`.

## Publishing flow

`npm run publish` verifies, builds, and opens a PR into `raycast/extensions` (requires GitHub auth via `ray login`). Re-run to push more commits. The store icon must be a 512×512 PNG at `assets/icon.png`.
