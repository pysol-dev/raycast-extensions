# AGENTS.md — raycast-extensions monorepo

## Purpose

Personal monorepo for Raycast extensions we build, clone, or heavily modify.
**Not** a mirror of `raycast/extensions`.

## Layout

- `extensions/<name>/` — one Raycast extension per directory
- Each extension is independently developable:

```bash
cd extensions/<name>
npm install
npm run dev
```

## Rules for agents

1. Only edit the extension directory named in the task (unless explicitly asked to change monorepo root docs).
2. Read that extension's `AGENTS.md` before changing code.
3. Prefer `@raycast/api` / `@raycast/utils` patterns; do not invent non-existent APIs.
4. **Native-first:** implement capabilities inside the extension (fs, screencapture, AppleScript) rather than depending on other Raycast extensions when reasonable.
5. Run `npm run build` and/or `npm run lint` in the extension dir before claiming done.
6. Never commit secrets; use Raycast Preferences for tokens.
7. MIT license; preserve third-party attribution in READMEs / NOTICE.

## Creating a new extension

1. Scaffold under `extensions/<name>`
2. Add `extensions/<name>/AGENTS.md`
3. Register in root `README.md` table

## Publishing to Raycast Store

Development lives here. Store publish still goes through Raycast:

```bash
cd extensions/<name>
npm run publish
```

That opens a PR against `raycast/extensions`. See https://developers.raycast.com/basics/publish-an-extension

## Current extensions

| Directory | Title | Status |
|-----------|-------|--------|
| `lazy-obsidian` | LazyObsidian | Phase 0+ (cloned from Obsidian Smart Capture) |
| `imagen` | Imagen | Scaffolded — versioned AI image sessions, multi-engine routing |
