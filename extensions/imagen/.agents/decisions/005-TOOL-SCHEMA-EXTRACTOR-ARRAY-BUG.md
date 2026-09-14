# DECISION 005: Tool schema extractor crashes on array-typed Input fields combined across tools

## Status
Accepted (workaround applied)

## Context
`ray build` failed with `extracting tool schemas failed — Cannot read properties of undefined (reading 'flags')` on `imagen-edit.ts` and `imagen-generate.ts` whenever all three tools were registered and the build was TypeScript-valid.

### Debugging history (important: false-positive trap)
`ray build` runs the TypeScript check BEFORE schema extraction. Any experiment that introduced TS errors (e.g. changing `target?: number` to `target?: string` without updating the body) caused tsc to abort, schema extraction never ran, and `grep -c "extracting tool schemas failed"` returned 0 — a false pass. Several early conclusions (that `target`'s type was the root cause) were artifacts of this trap. Only TS-valid builds were trusted in the final analysis.

### Verified findings (TS-valid builds only)
- Each tool alone extracts fine; any pair extracts fine.
- All three tools together crash when `imagen-edit`/`imagen-generate` declare an array-typed optional Input field (`lockedAttributes?: string[]` or `{ attribute: string; text: string }[]`).
- Removing the array field from both Inputs → build passes with all three tools registered.
- The crash is independent of `imagen-session`'s `target` field type (number or string both crash when the array field is present).
- Nested object-array properties named `name` or `value` combined with string-literal unions also crashed in single-file tests (extractor limitation, consistent with the array-field finding).

## Decision
Remove `lockedAttributes` from the tool Input schemas. The locked-attributes feature is preserved at the manifest level: `manifest.locked` (a `Record<string, string>`) is still part of the session schema, `composePrompt` in `src/lib/engines.ts` still injects `manifest.locked` into every prompt, and lock management can be exposed through `imagen-session` in a future release once the upstream extractor bug is fixed.

## Consequences
- Tool Inputs are flat scalars + unions only, which the extractor handles reliably.
- Users cannot set locks inline on generate/edit calls in v0.1.0; locks persist via the manifest.
- Revisit when Raycast fixes the schema extractor; file upstream report with reproduction (three tools, array-typed optional field in two of them).
