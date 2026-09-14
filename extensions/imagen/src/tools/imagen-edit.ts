/**
 * imagen-edit — Edit an existing image, preserving unchanged regions.
 *
 * Default engine: flux-kontext (BFL), chosen for instruction-based editing
 * with region preservation. Override with `engine` if quality disappoints.
 *
 * The tool:
 * 1. Resolves the session directory (explicit > project mapping > default pref).
 * 2. Loads or creates the session manifest.
 * 3. Resolves the base image (explicit `imagePath` > session current version).
 * 4. Calls the engine, writes versions/v(n+1).png, updates the manifest.
 * 5. Returns the new version path and session state.
 */

import { Tool } from "@raycast/api";
import * as fs from "fs";
import {
  resolveSessionBase,
  createSession,
  readManifest,
  writeManifest,
  nextVersionPath,
  versionFile,
  parseLockSpec,
  mergeLocks,
  SessionManifest,
  SessionNotConfiguredError,
} from "../lib/session";
import { runEngine, defaultEngine, MissingApiKeyError } from "../lib/engines";

type Input = {
  /**
   * The edit instruction. Describe ONLY what should change; unchanged
   * regions are preserved by the engine.
   */
  prompt: string;
  /**
   * Absolute path to the image to edit. If omitted, the session's current
   * version is used. Pass a path when editing an image outside the session.
   */
  imagePath?: string;
  /**
   * Session name. Reuse the same name to continue the same versioned
   * session; omit to create a new timestamped session.
   */
  sessionName?: string;
  /**
   * Directory that contains (or will contain) the session. If omitted,
   * the configured project mapping or default directory is used.
   */
  sessionDir?: string;
  /**
   * Absolute path of the project this work belongs to. Used to look up a
   * project-specific session directory configured via the Configure command.
   */
  projectRoot?: string;
  /**
   * Engine override. Default for edits is "flux-kontext".
   */
  engine?: "flux-kontext" | "gpt-image" | "nano-banana";
  /**
   * New attributes to lock into the session, as "key=value" pairs separated
   * by ";" or newlines (e.g. "eyes=black ovals with gloss; palette=muted").
   * Locked attributes are injected into every future prompt in this session
   * to prevent drift. Existing keys with the same name are overwritten.
   */
  lock?: string;
  /**
   * Keys to remove from the locked set (semicolon-separated). Removing a
   * lock stops it being injected into future prompts.
   */
  unlock?: string;
};

export const confirmation: Tool.Confirmation<Input> = async (input) => {
  // Only confirm when overwriting behavior could surprise: editing an image
  // outside the session (explicit imagePath) — the result is still written as
  // a NEW version, so nothing is destroyed. Keep confirmation lightweight.
  if (!input.imagePath) return undefined;
  return {
    message: `Edit ${input.imagePath} and save as a new version?`,
    info: [{ name: "Engine", value: input.engine ?? "flux-kontext (default)" }],
  };
};

/**
 * Edit an image with region preservation and append the result as a new
 * version in the session. Returns the new version path and session summary.
 */
export default async function tool(input: Input) {
  let baseDir: string;
  try {
    baseDir = await resolveSessionBase(input.sessionDir, input.projectRoot);
  } catch (err) {
    if (err instanceof SessionNotConfiguredError) {
      return {
        error: "session-not-configured",
        message: err.message,
        setup: "Run the 'Configure Session Storage' command in Raycast, or pass sessionDir explicitly.",
      };
    }
    throw err;
  }

  const sessionPath = createSession(baseDir, input.sessionName);
  let manifest = readManifest(sessionPath);

  // Resolve base image
  let baseImage = input.imagePath;
  if (!baseImage && manifest) {
    baseImage = versionFile(manifest);
  }
  if (!baseImage) {
    return {
      error: "no-base-image",
      message:
        "No image to edit. Pass imagePath, or generate a first version with the imagen-generate tool before editing.",
    };
  }
  if (!fs.existsSync(baseImage)) {
    return { error: "base-image-missing", message: `Base image not found: ${baseImage}` };
  }

  // Progressive locking: start from existing locks, apply unlock, then apply
  // new locks. The effective set is injected into this call's prompt AND
  // persisted to the manifest so every future version inherits it.
  let locked: Record<string, string> = { ...(manifest?.locked ?? {}) };
  if (input.unlock) {
    for (const key of input.unlock
      .split(/[;\n]+/)
      .map((k) => k.trim())
      .filter(Boolean)) {
      delete locked[key];
    }
  }
  const newLocks = input.lock ? parseLockSpec(input.lock) : {};
  locked = mergeLocks(locked, newLocks);

  if (!manifest) {
    const now = new Date().toISOString();
    manifest = {
      schema: 1,
      name: input.sessionName ?? sessionPath.split("/").pop() ?? "session",
      createdAt: now,
      updatedAt: now,
      current: 0,
      versions: [],
      locked: Object.keys(locked).length ? locked : undefined,
    };
  } else {
    manifest.locked = Object.keys(locked).length ? locked : undefined;
  }

  const engine = input.engine ?? defaultEngine("edit");
  const { n, file } = nextVersionPath(sessionPath, manifest);

  try {
    const result = await runEngine(engine, {
      prompt: input.prompt,
      inputImages: [baseImage],
      locked,
    });
    fs.writeFileSync(file, result.data);
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return { error: "missing-api-key", message: err.message };
    }
    throw err;
  }

  const version: SessionManifest["versions"][number] = {
    n,
    file,
    engine,
    prompt: input.prompt,
    createdAt: new Date().toISOString(),
    basedOn: manifest.current || null,
    locksApplied: Object.keys(newLocks).length ? newLocks : undefined,
    locksRemoved: input.unlock
      ? input.unlock
          .split(/[;\n]+/)
          .map((k) => k.trim())
          .filter(Boolean)
      : undefined,
  };
  manifest.versions.push(version);
  manifest.current = n;
  manifest.updatedAt = version.createdAt;
  writeManifest(sessionPath, manifest);

  return {
    ok: true,
    session: sessionPath,
    version: n,
    file,
    engine,
    basedOn: version.basedOn,
    totalVersions: manifest.versions.length,
    lockedAttributes: manifest.locked ?? {},
    locksApplied: Object.keys(newLocks).length ? newLocks : undefined,
  };
}
