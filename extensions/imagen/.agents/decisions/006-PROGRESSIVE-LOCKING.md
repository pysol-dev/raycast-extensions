# DECISION 006 — Progressive Locking

## Status
Accepted

## Context
The original scaffold only *injected* `manifest.locked` into prompts
(`composePrompt` in `src/lib/engines.ts`) but had **no tool path that wrote new
locks**. The removed accumulation loops from an earlier iteration were the only
writers, and they were dropped during the schema-extractor bugfix (see 005).
That made sessions read-only with respect to locking — the opposite of the
extension's purpose: progressive image generation requires that each accepted
edit *becomes* a constraint for all future versions.

## Decision
1. **`lock` input on `imagen-edit` and `imagen-generate`** — a string of
   `key=value` pairs separated by `;` or newlines. Parsed by `parseLockSpec`
   (`src/lib/session.ts`), merged over existing locks by `mergeLocks`
   (last-writer-wins per key), and persisted to `manifest.locked` atomically
   with the version append.
2. **`unlock` input on both tools** — semicolon-separated keys to delete from
   the locked set, so a constraint can be retired without regenerating.
3. **`set-locks` action on `imagen-session`** — manage the locked set without
   generating an image (e.g. pre-seed a session before v1, or clean up after
   review).
4. **Provenance on each version** — `SessionVersion` gains optional
   `locksApplied?: Record<string, string>` and `locksRemoved?: string[]`, so
   the manifest records *which* version introduced or removed each constraint.
   This makes rollback reasoning possible: rolling back the image pointer does
   NOT roll back locks (locks are session state, not version state) — the
   provenance fields let a human or agent reconstruct what was true at any
   version.

## Why string-typed `lock` instead of an object/array input
The Raycast tool-schema extractor crashes on array-typed optional Input fields
when multiple tools are registered (documented in 005), and `Record<string,
string>` object inputs are not supported by the extractor either. A delimited
string is the only shape that survives schema extraction while remaining
ergonomic for the calling model. Parsing is lenient: malformed pairs are
skipped, never fatal.

## Semantics
- Locks are **session-scoped**, injected into every subsequent prompt via
  `composePrompt` ("Preserve the following attributes exactly as described").
- Re-locking an existing key **overwrites** it — the most recent explicit
  instruction wins, matching how the user iterates ("make the cube more
  perfect" replaces the earlier cube description).
- Locks persist across `rollback`/`set-current` pointer moves; use `unlock`
  to remove them explicitly.

## Consequences
- Every accepted edit can harden into a constraint with one extra input field.
- Manifest grows monotonically in lock count unless explicitly unlocked;
  acceptable at realistic session scales (tens of keys).
- The calling model must be instructed (via tool JSDoc) to use `lock` for
  attributes the user wants preserved — this is the primary drift-prevention
  lever.
