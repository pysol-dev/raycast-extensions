# LazyObsidian Changelog

## [Phase 0 — Clone & FS-first capture] - 2026-07-19

- Cloned Obsidian Smart Capture sources into personal monorepo as LazyObsidian
- Renamed package/command identity (author: pysol-dev)
- Primary write path is filesystem (`fs-vault.ts`); Advanced URI no longer required
- Replaced Storage Path text field with Folder + Sub-Folders dropdowns
- Optional open-after-capture via core Obsidian URI
- Extension preferences: vaultPath, openOnCapture, excludedFolders
- Added monorepo + extension AGENTS.md and NOTICE attribution

## [Phase 0 review fixes] - 2026-07-19

- Fix vault discovery: merge preference paths with obsidian.json (prefs no longer hide other vaults)
- Use vault path as dropdown value (unique when two vaults share a name)
- Prefer `getFrontmostApplication()` for browser context; fix AppleScript frontmost process query
- Controlled Title field (resource title no longer stuck as defaultValue)
- Block submit while AI summary still generating
- Harden FS write modes (append/new/overwrite); unique names on collision
- Remove unused `yaml` dependency; fix monorepo `.npmrc` omit parsing
- Rename metadata screenshots `lazy-obdisian-*` → `lazy-obsidian-*`
- Replace non-editable TagPicker link with Description; Prettier/ESLint clean

## [Phase 1 — Prompt + Jina page fetch] - 2026-07-20

- Author set to Raycast username `xeno`
- Page content via **Jina Reader** (`r.jina.ai`) with browser engine; optional API key + proxy; local HTML fallback
- YouTube still uses youtube-transcript
- **Prompt** form field: optional Raycast AI ingest (title/folder/tags/body JSON) when filled
- Prefs: `jinaApiKey`, `autoProcessWithAI`

## [Browser Extension primary page capture] - 2026-07-20

- Prefer official Raycast `BrowserExtension.getTabs` / `getContent({ format: "markdown" })` for live-tab content
  (https://developers.raycast.com/api-reference/browser-extension)
- Fallback chain: Browser Extension → Jina Reader → local HTML
- AppleScript browser URL only when Browser Extension unavailable
