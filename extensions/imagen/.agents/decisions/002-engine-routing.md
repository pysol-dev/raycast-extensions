# DECISION 002 — Engine routing: Flux Kontext for edits

**Status:** Accepted
**Date:** 2026-09-13

## Context

Raycast's built-in image extensions (`gpt_image`, `nano_banana`) condition on reference images but regenerate the whole image on every call. In long editing sessions this produces wrong-base selection and drift in regions the user never asked to change. The user's own experience (patchWERKS logo iteration) confirmed the failure mode is whole-image regeneration, not from-scratch generation.

Flux Kontext (Black Forest Labs) is architecturally designed for **instruction-based editing with preservation of unchanged regions** — its API takes an input image plus an edit instruction (per https://docs.bfl.ai/flux_kontext/quick_start).

## Constraint

The `@raycast/api` AI namespace exposes only text completion (`AI.ask`, verified at `node_modules/@raycast/api/types/index.d.ts` line 467). **There is no image-generation API in Raycast's AI namespace.** Therefore Imagen calls image APIs directly over HTTPS with user-supplied keys stored as extension preferences (`password` type), per the preferences docs (`https://developers.raycast.com/api-reference/preferences`).

## Decision

Routing rule:

| Task | Default engine | Rationale |
|---|---|---|
| Edit existing image | `flux-kontext` (BFL) | Region preservation is architectural, not prompt-hoped |
| Fresh generation | `gpt-image` (OpenAI) | Strong general generation; `nano-banana` (Gemini) available via `engine` input |

- The caller can override the engine per call (`engine` input on both tools).
- If Kontext quality disappoints for a specific edit type, switch engines per call; changing the *default* requires a new decision record.

## Consequences

- Users must supply a BFL API key for edits (OpenAI key for generations).
- Engine HTTP clients live in one module (`src/lib/engines.ts`); swapping or adding engines is localized.
- BFL uses an async submit/poll flow (`x-key` header, `polling_url`); OpenAI uses sync base64 responses; Gemini uses inline_data parts. All are encapsulated behind `runEngine()`.
