# LazyObsidian

Capture anything from your Mac into Obsidian — with a path toward progressive AI automation.

Inspired by [Lazy](https://lazy.so) and built on a clone of **Obsidian Smart Capture** (MIT).

## Features (Phase 0+)

- Context-aware capture: selected text + active browser tab (Safari, Chrome, Arc, Brave, Firefox, Edge, Opera)
- Optional page content / YouTube transcript
- Optional AI summary (Raycast AI / Pro)
- **Folder** and **Sub-Folders** dropdowns (vault filesystem)
- **Filesystem write** — no Advanced URI plugin required
- Optional open in Obsidian via core URI

## Setup

1. Install [Raycast](https://www.raycast.com) and [Obsidian](https://obsidian.md)
2. Clone this monorepo and:

```bash
cd extensions/lazy-obsidian
npm install
npm run dev
```

3. In Raycast, open **Lazy Capture** (import the extension from the folder if needed)
4. Optional preference: set **Vault Path(s)**; otherwise vaults are auto-detected from Obsidian's `obsidian.json`

## Page content

Content is resolved in this order (see [Browser Extension API](https://developers.raycast.com/api-reference/browser-extension)):

1. **Raycast Browser Extension** — `BrowserExtension.getContent({ format: "markdown" })` on the live tab (rendered DOM, cookies/session). Install from [raycast.com/browser-extension](https://www.raycast.com/browser-extension) if prompted.
2. **[Jina Reader](https://jina.ai/reader)** (`r.jina.ai`) — remote browser when the extension is unavailable or empty.
3. **Local HTML fetch** — last resort.
4. **YouTube** — `youtube-transcript`.

Optional **Jina Reader API Key** raises remote rate limits / enables proxy. Prefer the Browser Extension for paywalled or bot-gated pages you already have open.

## Preferences

| Preference | Description |
|------------|-------------|
| Vault Path(s) | Comma-separated absolute paths (optional) |
| Open in Obsidian | Open note after capture (default on) |
| Excluded Folders | Extra folder names to hide from pickers |

## Attribution

See [NOTICE](./NOTICE). Original Smart Capture by millin_gabani and contributors.

## License

MIT
