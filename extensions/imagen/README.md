# Imagen

Versioned, manifest-driven AI image generation and editing for Raycast AI.

Imagen gives image-generation sessions **persistence, versioning, and preservation of unchanged regions**. Every generation or edit is appended to a session manifest on disk, so long iterative sessions (logo refinement, concept art, UI mockups) never lose history and never silently drift.

## Why

Raycast's built-in image extensions (`gpt_image`, `nano_banana`) regenerate the whole image on every call. In long editing sessions this causes:

- **Wrong-base selection** — the model edits a stale or different image than the one you meant.
- **Drift** — regions you never asked to change (eyes, palette, composition) get redrawn.
- **No history** — nothing records which prompt produced which image, or what attributes must stay locked.

Imagen fixes this with a **session manifest** (`manifest.json`) stored next to your images:

```
<session-dir>/<session-name>/
├── manifest.json      # versions, prompts, engines, locked attributes
└── versions/
    ├── v1.png
    ├── v2.png
    └── ...
```

## Tools (for Raycast AI)

| Tool | Purpose | Default engine |
|---|---|---|
| `imagen-generate` | Fresh generation from a prompt (optional reference image) | `gpt-image` (OpenAI) |
| `imagen-edit` | Edit an existing image, preserving unchanged regions | `flux-kontext` (Black Forest Labs) |
| `imagen-session` | Inspect the manifest, list versions, roll back the current pointer | — |
| `imagen-commit` | Ingest an image produced by any external tool into the session | — |

### Native-tools mode (no API keys)

Imagen works with Raycast's built-in image extensions — `@gpt_image`, `@nano_banana`, `@flux-kontext` — without any API keys. The chat model orchestrates:

1. `imagen-session` reads the manifest: current version, locked attributes, history.
2. The model calls the native image tool, passing the session's current image as the reference and injecting the locked-attributes block into the prompt.
3. `imagen-commit` records the produced file as v(n+1), applies lock updates, and advances the pointer.

Imagen's own API-key engines (Mode B) remain available for unattended flows — same manifest, same locks, same versioning. See `.agents/skills/SKILL.md` for the full orchestration contract and `.agents/decisions/007-NATIVE-TOOL-ORCHESTRATION.md` for the rationale.

### Routing rule

- **Edits to existing images** default to **Flux Kontext**, which is architected for instruction-based editing with region preservation.
- **Fresh generations** default to **gpt-image**; `nano-banana` (Gemini) is available via the `engine` input.
- Override the engine per call if a specific edit type disappoints.

### Session resolution

The session directory is resolved in this order:

1. Explicit `sessionDir` passed in the tool call.
2. A **project mapping** — project root → session directory, configured once via the **Configure Session Storage** command. Matched by longest prefix, so `~/dev/patchwerks` covers `~/dev/patchwerks/branding`.
3. The **global default directory** preference.

If nothing is configured, tools return a structured `session-not-configured` error pointing at setup — they never guess.

### Locked attributes

Locked attributes (e.g. `"eyes": "all-black ovals with gloss"`, `"palette": "pink, blue, orange, red"`) are stored in the session manifest and appended to every subsequent prompt in that session, preventing drift across versions. Edits route to Flux Kontext, which conditions on the previous version's image so unchanged regions are preserved.

**Locking is progressive.** Every `imagen-edit`, `imagen-generate`, and `imagen-commit` call accepts a `lock` parameter — `key=value` pairs separated by `;` or newlines — that is merged into the session's locked set and persisted with the new version. Re-locking an existing key overwrites it (the most recent instruction wins). An `unlock` parameter removes keys. The `imagen-session` tool's `set-locks` action manages the locked set without generating an image. Each version records `locksApplied` / `locksRemoved` provenance in the manifest, so you can trace which version introduced each constraint. Locks survive rollback — they are session state, not version state; remove them explicitly with `unlock` or `set-locks`.

## Setup

1. Install the extension.
2. Open **Configure Session Storage** in Raycast:
   - Set a default session directory.
   - Optionally map project roots to dedicated directories.
3. **Native-tools mode needs no API keys.** For Imagen's own engines, add keys in **Raycast Preferences → Extensions → Imagen**:
   - **Black Forest Labs API key** (edits — [console.bfl.ai](https://console.bfl.ai))
   - **OpenAI API key** (generations — [platform.openai.com](https://platform.openai.com))
   - **Google Gemini API key** (optional, for `nano-banana` — [aistudio.google.com](https://aistudio.google.com))

Keys are stored as Raycast extension preferences (`password` type) — never hardcoded.

## Commands

- **Configure Session Storage** — set the default directory and manage project mappings.

## Development

```bash
npm install
npm run dev      # run in Raycast development mode
npm run lint
npm run build
```

## Publishing

```bash
npm run publish  # verifies, builds, and opens a PR into raycast/extensions
```

## License

MIT — see [LICENSE](./LICENSE).
