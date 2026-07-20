# VERSIONS.md — raycast-extensions / LazyObsidian

Living product + engineering roadmap for this monorepo.

| | |
|:---|:---|
| **Repo** | https://github.com/pysol-dev/raycast-extensions |
| **Local** | `~/dev/raycast-extensions` |
| **Primary extension** | `extensions/lazy-obsidian` |
| **Raycast author** | `xeno` |
| **Last updated** | 2026-07-20 |

---

## 1. Product goal

Near-zero-friction capture from macOS (selection, browser tab, clipboard, screenshots, files) into a structured Obsidian vault, with progressive AI automation (taxonomy, AGENTS.md, evergreen updates, external-agent handoff via vault tickets).

**Design principles**

1. **Clone, don’t GitHub-fork** Smart Capture into this monorepo (independent product).
2. **Native / Raycast-first** — prefer official Raycast APIs and in-extension code over depending on other Store extensions.
3. **FS-first vault writes** — Advanced URI optional, not required.
4. **Browser Extension first for page content** — live tab DOM/session; remote fetch only as fallback.
5. **Heavy work → vault tickets** (Hermes / omo / humans), not hard extension deps.
6. **Progressive UI removal** — rich form now; auto mode later as vault rules mature.

---

## 2. Version history (shipped)

### v0.1.0 — Phase 0 bootstrap (2026-07-19)

*Commit: `57b372f`*

* Monorepo `raycast-extensions` + public GitHub
* Cloned Smart Capture → `extensions/lazy-obsidian` only (not full `raycast/extensions`)
* Rename: LazyObsidian / Lazy Capture; MIT + NOTICE
* **FS-first** writes (`fs-vault.ts`); drop Advanced URI hard gate
* Folder + Sub-Folders dropdowns
* Root + extension `AGENTS.md`

### v0.1.1 — Phase 0 review fixes (2026-07-19)

*Commit: `3a91c7a`*

* Merge pref vault paths + `obsidian.json`
* Vault dropdown value = path (unique names)
* Controlled Title; summary-in-flight guard
* FS write modes hardened; metadata typo fix; lint clean

### v0.2.0 — Phase 1 Prompt + remote page fetch (2026-07-20)

*Commit: `91a77c8`*

* Author → **`xeno`**
* Prompt field + AI ingest JSON pipeline (`ai-pipeline.ts`)
* Jina Reader + local HTML fallback (`page-fetch.ts`)
* Prefs: `jinaApiKey`, `autoProcessWithAI`

### v0.2.1 — Browser Extension primary (2026-07-20)

*Commit: `b64bdcd`*

* **Primary:** `BrowserExtension.getTabs` + `getContent({ format: "markdown" })`
* Fallback: Browser Extension → Jina → local HTML
* AppleScript URL only if Browser Extension unavailable
* Docs: https://developers.raycast.com/api-reference/browser-extension

---

## 3. Current architecture (as of v0.2.1)

```
extensions/lazy-obsidian/
├── package.json          # author: xeno; commands: capture
├── src/
│   ├── capture.tsx       # main form
│   ├── scripts/browser.ts
│   └── utils/
│       ├── page-fetch.ts     # Browser Ext → Jina → local
│       ├── ai-pipeline.ts    # Prompt → structured ingest
│       ├── fs-vault.ts       # list folders + write notes
│       └── utils.tsx         # vault discovery
```

| Concern | Implementation |
|:---|:---|
| Page content | Browser Extension → Jina → local; YouTube transcript separate |
| Write path | Filesystem; optional `obsidian://open?path=` |
| AI | `AI.ask` for summary + Prompt ingest (not yet AI Extension tools) |
| Persistence | `LocalStorage` vault/folder/subfolder |
| Side effects | None yet (Reminders/screenshot later, native) |

---

## 4. Raycast docs audit (2026-07-20)

Full surface from [sitemap](https://developers.raycast.com/sitemap.md) / [llms.txt](https://developers.raycast.com/llms.txt), mapped to LazyObsidian.

### 4.1 Already used

| API | Use | Docs |
|:---|:---|:---|
| `BrowserExtension.getTabs` / `getContent` | Primary page capture | [Browser Extension](https://developers.raycast.com/api-reference/browser-extension) |
| `environment.canAccess(AI \| BrowserExtension)` | Feature gates | [Environment](https://developers.raycast.com/api-reference/environment) |
| `AI.ask` | Summary + Prompt pipeline | [AI](https://developers.raycast.com/api-reference/ai) |
| `Form` + controlled dropdowns | Capture UI | [Form](https://developers.raycast.com/api-reference/user-interface/form) |
| `LocalStorage` | Last vault/folder | [Storage](https://developers.raycast.com/api-reference/storage) |
| `getSelectedText` | Highlight | Environment |
| `getFrontmostApplication` + AppleScript | URL fallback | [System utilities](https://developers.raycast.com/api-reference/utilities) |
| `showToast` / `showHUD` / `isLoading` | Feedback | Best practices |
| `open` | Open note in Obsidian | System utilities |
| Prefs: textfield, password, checkbox | Config | [Preferences](https://developers.raycast.com/api-reference/preferences) |

### 4.2 Gaps — P0 (high impact)

| Gap | Why | Docs | Target version |
|:---|:---|:---|:---|
| Pref type **`directory`** for vault | Safer than free-text path | Preferences | v0.3 |
| **`openExtensionPreferences`** on NoVaultFound | One-click fix empty vault | Preferences | v0.3 |
| Browser Extension **missing/declined UX** | Docs: prompt then throw; don’t silent-fail | Browser Extension | v0.3 |
| **`AI.ask` + `AbortSignal`** | Cancel on unmount / uncheck summary | AI.AskOptions | v0.3 |
| Surface **AI rate limits** (10/min, 100/hr) | Summary + Prompt can double-hit | AI | v0.3 |
| **`useAI`** for streaming summary | Docs prefer hook in React | [useAI](https://developers.raycast.com/utilities/react-hooks/useai) | v0.3–v0.4 |
| **AI Extension `tools[]`** + **`Tool.Confirmation`** | Ask LazyObsidian / Agents; safe overwrites | [Create AI Extension](https://developers.raycast.com/ai/create-an-ai-extension), [Tool](https://developers.raycast.com/api-reference/tool) | v0.5 |

### 4.3 Gaps — P1 (strong UX / product)

| Gap | Why | Docs | Target version |
|:---|:---|:---|:---|
| **`Form.enableDrafts` + `draftValues`** | Don’t lose Prompt/Note on dismiss | Form drafts | v0.3 |
| **`useForm` + validation** | Required title, clean errors | [useForm](https://developers.raycast.com/utilities/react-hooks/useform) | v0.3 |
| **`storeValue`** on stable fields | Less custom LocalStorage | Form | v0.3 |
| **Post-capture Actions** | ShowInFinder, Copy path, Open note, OpenInBrowser | [Actions](https://developers.raycast.com/api-reference/user-interface/actions) | v0.3 |
| **`Clipboard.read` / history** | Clipboard-first command | [Clipboard](https://developers.raycast.com/api-reference/clipboard) | v0.4 |
| **`getSelectedFinderItems` + `Form.FilePicker`** | Files/attachments into vault | Environment, Form | v0.4 |
| **`useExec` + screencapture** | Screenshot command (native, no CleanShot dep) | [useExec](https://developers.raycast.com/utilities/react-hooks/useexec) | v0.4 |
| **Command `arguments`** (max 3) | Prefill title/prompt from Root Search | [Arguments](https://developers.raycast.com/information/lifecycle/arguments) | v0.4 |
| **Deeplinks + `fallbackText`** | Automation / hotkey entry | [Deeplinks](https://developers.raycast.com/information/lifecycle/deeplinks) | v0.4 |
| **`confirmAlert`** | Overwrite policy | Alert API | v0.5 |
| **`Cache` + `environment.supportPath`** | Folder tree / note index / temp media | Cache, Environment | v0.5–v0.6 |
| **`Form.TextArea` `enableMarkdown`** | Nicer Prompt/Note editing | Form | v0.3 |
| Optional **AI `model` pref** | User picks model | AI.Model | v0.5 |

### 4.4 Gaps — P2 (automation / scale)

| Gap | Why | Docs | Target version |
|:---|:---|:---|:---|
| **`no-view` + `interval` background** | Drain vault INGEST/tasks | [Background refresh](https://developers.raycast.com/information/lifecycle/background-refresh) | v0.6 |
| **`updateCommandMetadata`** | Subtitle: pending queue count | Command | v0.6 |
| **`launchCommand`** | Screenshot → capture form chain | Command | v0.4 |
| **AI Extension evals** | Regression for tools | [Evals](https://developers.raycast.com/ai/write-evals-for-your-ai-extension) | v0.5+ |
| Menu bar quick status | Optional | Menu Bar | later |
| Evergreen atomic merge + wikilinks | Core vault automation | Product | v0.5–v0.7 |
| External agent tickets (Hermes/omo) | Heavy jobs | Vault file protocol | v0.6+ |

### 4.5 Explicitly deprioritized / removed from old plan

| Old idea | Decision | Replacement |
|:---|:---|:---|
| **Advanced URI as required write path** | **Removed** | FS-first + optional core `obsidian://open` |
| **GitHub-fork full `raycast/extensions` monorepo** | **Removed** | Clone Smart Capture sources only into this repo |
| **Depend on CleanShot / Apple Reminders / Exa / bridges extensions** | **Removed as deps** | Native `screencapture` / AppleScript; optional user MCP; vault tickets |
| **Remote scrape as primary page capture** | **Demoted** | Browser Extension primary; Jina secondary; local last |
| **Defuddle / custom scraper farm as core** | **Not adopted** | Browser Extension + Jina cover bot walls for open tabs |
| **Templater CLI dependency** | **Not blocking** | Pre-render templates in Raycast from vault files |
| **True “spawn sub-agent” Raycast API** | **Does not exist** | AI tools + Agents + nested `AI.ask` + vault tickets |
| **PR upstream Smart Capture as mainline** | **Out of scope** | Independent LazyObsidian product |
| **OAuth / Window Management / Grid** | **Skip** unless product needs change |
| **Windows support** | **Skip** (`platforms: ["macOS"]`; Browser Extension macOS-only) |

### 4.6 Browser Extension contract (must keep)

From [official docs](https://developers.raycast.com/api-reference/browser-extension):

* Formats: `html` | `text` | `markdown` (markdown ≈ reader mode)
* `cssSelector`: first match; **not** with `format: "markdown"`
* `tabId` optional; default active tab of focused window
* `canAccess` first; missing install may prompt; decline throws
* macOS only for now

Still available later: `html` for custom extractors; `cssSelector` for site-specific fields.

### 4.7 AI contract (must keep)

From [AI API](https://developers.raycast.com/api-reference/ai):

* Rate limit: **10/min**, **100/hour** from extensions
* Options: `creativity`, `model`, `signal`
* Streaming via EventEmitter / `useAI`
* Pro gated via `canAccess(AI)`

---

## 5. Revised phased roadmap

Phases renumbered after docs audit. **Struck items** are obsolete vs original LazyObsidian plan.

### ✅ Phase 0 — Bootstrap & stabilize (done → v0.1.x)

* [x] Personal monorepo + GitHub
* [x] Clone Smart Capture only
* [x] FS-first writes; no Advanced URI requirement
* [x] Folder + Sub-Folders dropdowns
* [x] Review fixes (vault merge, controlled title, etc.)

~~Fork entire raycast/extensions~~ · ~~Advanced URI hard gate~~

### ✅ Phase 1 — Prompt + page content stack (done → v0.2.x)

* [x] Prompt field + structured AI ingest
* [x] Page fetch pipeline with resilient fallbacks
* [x] **Browser Extension primary** (docs-correct)
* [x] Jina + local fallbacks; YouTube transcript

~~Remote-only scrape as primary~~ · ~~Depend on third-party clip extensions~~

### 🔜 Phase 2 — Docs P0/P1 capture UX (→ v0.3)

**Goal:** Make the existing capture command production-polished per Raycast best practices.

* [ ] Vault preference: `directory` type (and/or clearer multi-vault UX)
* [ ] `NoVaultFoundMessage`: Action → `openExtensionPreferences`
* [ ] Browser Extension: explicit install CTA when `!canAccess(BrowserExtension)`
* [ ] `Form.enableDrafts` + `draftValues` for Prompt/Note/Title
* [ ] `useForm` validation (required title at minimum)
* [ ] `enableMarkdown` on Prompt/Note text areas
* [ ] Post-submit / success Actions: Show in Finder, Copy path, Open note, Open source URL
* [ ] `AbortSignal` on all `AI.ask`; cancel on unmount / toggle off
* [ ] Rate-limit-aware errors; avoid duplicate AI calls when possible
* [ ] Optional: `storeValue` where it simplifies LocalStorage

### 🔜 Phase 3 — Capture surfaces (→ v0.4)

**Goal:** Capture from anywhere, not only browser+selection.

* [ ] **Lazy Capture Clipboard** — `Clipboard.read` / `readText` (+ optional history offset)
* [ ] **Lazy Screenshot** — `useExec` + `/usr/sbin/screencapture`; save under vault attachments; embed `![[…]]`
* [ ] Finder selection — `getSelectedFinderItems` → copy into vault
* [ ] `Form.FilePicker` for manual attachments
* [ ] Command **arguments** (title, prompt, optional folder) + deeplink docs
* [ ] `launchCommand` to chain screenshot → form when useful

~~CleanShot extension dependency~~ · ~~Video v1 (defer until screenshot solid)~~

### 🔜 Phase 4 — AI Extension tools (→ v0.5)

**Goal:** LazyObsidian as first-class Raycast AI Extension (“Ask LazyObsidian”).

* [ ] Manifest `tools[]` + `ai.yaml` instructions/evals
* [ ] Tools: `list-vault-folders`, `search-notes`, `read-note`, `write-note`, `append-note`, `read-agents-md`, `apply-taxonomy`, `enqueue-task`
* [ ] `Tool.Confirmation` for overwrite / destructive evergreen edits
* [ ] Optional AI model preference
* [ ] Wire Apple Reminders/Calendar via **native** AppleScript/JXA (not Store extension deps)

~~Cross-extension `launchCommand` to Reminders/Exa as required path~~

### 🔜 Phase 5 — Evergreen, wikilinks, vault intelligence (→ v0.5–v0.7)

**Goal:** Minimal/atomic updates to existing notes; taxonomy; AGENTS.md walk.

* [ ] Related-note retrieval (title index; Cache for tree)
* [ ] Append-first policy; `.bak` / confirm before overwrite
* [ ] Wikilink propose/create/remove per vault policy
* [ ] Walk folder-scoped `AGENTS.md` into system prompt / tool policy
* [ ] Finite taxonomy file enforcement

### 🔜 Phase 6 — Queue, background, progressive auto mode (→ v0.6+)

**Goal:** Hotkey (+ rare prompt) → correct place; heavy work off Raycast AI.

* [ ] Vault ticket protocol: `_ai/tasks/INGEST-*.md` or `INGEST.md` queue
* [ ] `no-view` + `interval` worker to process queue / notify
* [ ] `updateCommandMetadata` subtitle for pending count
* [ ] Auto mode: skip folder UI when AI confidence high; Capture Log note
* [ ] Document Hermes / Oh-My-OpenAgent as **external** consumers of tickets (not deps)
* [ ] Progressive removal of form sections as vault rules harden

~~Native Raycast “spawn sub-agent” API (does not exist)~~ · ~~Package raycast-bridges/RayBridge as dependencies~~

---

## 6. Target command set (end state)

| Command | Mode | Role |
|:---|:---|:---|
| **Lazy Capture** | `view` | Main form (current) |
| **Lazy Capture Clipboard** | `view` or `no-view` | Clipboard → vault |
| **Lazy Screenshot** | `view` | screencapture → form/vault |
| **Lazy Process Queue** | `no-view` + `interval` | Background INGEST |
| *(tools, not commands)* | `tools[]` | AI Chat / Agents |

Deeplink pattern:

```text
raycast://extensions/xeno/lazy-obsidian/capture
```

---

## 7. Page content strategy (canonical)

```text
1. BrowserExtension.getContent({ format: "markdown", tabId? })
     ↑ live DOM, cookies, no bot wall for open tabs
2. Jina Reader r.jina.ai  (+ optional API key, X-Proxy: auto)
3. Local fetch + html→markdown
4. YouTube → youtube-transcript
```

Do **not** invert this order without a written decision in this file.

---

## 8. External systems (non-Raycast)

| System | Role | Integration |
|:---|:---|:---|
| Obsidian vault FS | Source of truth | Direct read/write |
| Vault `AGENTS.md` / taxonomy | Policy | Inject into AI / tools |
| Vault INGEST/tasks | Work queue | Files as API |
| Hermes / omo / coding CLIs | Heavy agents | Consume tickets; optional user MCP |
| Jina Reader | Remote page fallback | Optional key in prefs |
| Advanced URI | Optional only | Not required |

---

## 9. Release checklist (each version)

* [ ] `npm run build` + `npm run lint` in `extensions/lazy-obsidian`
* [ ] Manual smoke: Browser Extension tab, selection, Prompt, FS write to SemInterGore
* [ ] Update this file’s version history
* [ ] Update `extensions/lazy-obsidian/CHANGELOG.md`
* [ ] Commit + push `main`
* [ ] (When Store-bound) `npm run publish` → PR to `raycast/extensions`

---

## 10. Sources

* https://developers.raycast.com/sitemap.md  
* https://developers.raycast.com/llms.txt  
* https://developers.raycast.com/api-reference/browser-extension  
* https://developers.raycast.com/api-reference/ai  
* https://developers.raycast.com/ai/create-an-ai-extension  
* https://developers.raycast.com/api-reference/tool  
* https://developers.raycast.com/api-reference/user-interface/form  
* https://developers.raycast.com/api-reference/user-interface/actions  
* https://developers.raycast.com/api-reference/preferences  
* https://developers.raycast.com/api-reference/storage  
* https://developers.raycast.com/api-reference/cache  
* https://developers.raycast.com/api-reference/clipboard  
* https://developers.raycast.com/api-reference/environment  
* https://developers.raycast.com/api-reference/command  
* https://developers.raycast.com/information/lifecycle/arguments  
* https://developers.raycast.com/information/lifecycle/deeplinks  
* https://developers.raycast.com/information/lifecycle/background-refresh  
* https://developers.raycast.com/information/best-practices  
* https://developers.raycast.com/utilities/react-hooks/useform  
* https://developers.raycast.com/utilities/react-hooks/useai  
* https://developers.raycast.com/utilities/react-hooks/useexec  
* https://jina.ai/reader  

---

## 11. Next action

**Implement Phase 2 (v0.3)** — directory vault pref, prefs CTA, Browser Extension empty-state, drafts, useForm, post-capture Actions, AI abort/rate-limit UX.

