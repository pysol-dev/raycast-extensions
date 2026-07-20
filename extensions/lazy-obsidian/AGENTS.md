# AGENTS.md — lazy-obsidian

## Goal

Capture content from macOS into an Obsidian vault with progressive AI automation.
Plan reference: Raycast Note **LazyObsidian**.

## Stack

- TypeScript, React, `@raycast/api`, `@raycast/utils`
- **Primary write path:** direct filesystem (`src/utils/fs-vault.ts`)
- **Optional open:** core `obsidian://open?path=...` (no Advanced URI required)
- Context: AppleScript browser helpers + `getSelectedText`

## Do

- Prefer FS writes over Advanced URI
- Folder + Sub-Folders via controlled `Form.Dropdown` + `listVaultFolders`
- Keep capture working without Raycast AI / Pro (`environment.canAccess(AI)`)
- Native-first side effects (screencapture, AppleScript Reminders later)
- Escalate heavy work via vault INGEST/task files (future), not extension deps
- Attribute MIT upstream (Obsidian Smart Capture / Obsidian Raycast patterns)

## Don't

- Hard-require Advanced URI or other Raycast extensions
- Blind-overwrite evergreen notes without backup/confirm
- Arbitrary shell from untrusted prompt text
- Depend on CleanShot / Exa / bridges extensions for core features

## Key files

| File | Role |
|------|------|
| `src/capture.tsx` | Main capture form command |
| `src/utils/fs-vault.ts` | FS write + folder listing |
| `src/utils/utils.tsx` | Vault discovery (`useObsidianVaults`) |
| `src/scripts/browser.ts` | Browser URL/title AppleScript |
| `package.json` | Manifest, preferences, commands |

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Upstream

Cloned from Raycast Store tree `extensions/obsidian-smart-capture` (originally millin_gabani / trillhause, MIT). Diverged as LazyObsidian — not an upstream fork network.
