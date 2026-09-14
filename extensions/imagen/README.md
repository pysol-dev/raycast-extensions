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

## Setup

1. Install the extension.
2. Open **Configure Session Storage** in Raycast:
   - Set a default session directory.
   - Optionally map project roots to dedicated directories.
3. Add API keys in **Raycast Preferences → Extensions → Imagen**:
   - **Black Forest Labs API key** (required for edits — [console.bfl.ai](https://console.bfl.ai))
   - **OpenAI API key** (required for generations — [platform.openai.com](https://platform.openai.com))
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
