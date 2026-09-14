/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Black Forest Labs API Key - API key for Black Forest Labs (Flux Kontext). Required for the default edit engine. */
  "bflApiKey"?: string,
  /** OpenAI API Key - API key for OpenAI. Required for the gpt-image generation engine. */
  "openaiApiKey"?: string,
  /** Google Gemini API Key - API key for Google AI Studio. Required for the nano-banana generation engine. */
  "geminiApiKey"?: string,
  /** Default Session Directory - Directory used to store image sessions when no project mapping or explicit path applies. */
  "defaultSessionDir"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `configure` command */
  export type Configure = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `configure` command */
  export type Configure = {}
}

