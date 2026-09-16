/**
 * imagen-commit — Ingest an externally produced image into a versioned session.
 *
 * This is the native-tools path: the chat model calls Raycast's built-in image
 * extensions (@gpt_image, @nano_banana, @flux-kontext) itself, then hands the
 * resulting file to this tool. Imagen records it as v(n+1), applies lock
 * updates, and advances the current pointer — identical bookkeeping to the
 * API-key engines, but with zero API keys required.
 *
 * The source file is COPIED into the session (never moved or deleted), so the
 * original produced by the external tool stays untouched.
 *
 * See .agents/decisions/007-NATIVE-TOOL-ORCHESTRATION.md.
 */

import * as fs from "fs";
import * as path from "path";
import {
  resolveSessionBase,
  createSession,
  readManifest,
  writeManifest,
  parseLockSpec,
  mergeLocks,
  SessionManifest,
  SessionNotConfiguredError,
} from "../lib/session";

type Input = {
  /**
   * Absolute path to the image file produced by the external tool
   * (e.g. the file returned by @gpt_image / @nano_banana / @flux-kontext).
   */
  imagePath: string;
  /**
   * The prompt or instruction that produced this image. Recorded in the
   * manifest for provenance.
   */
  prompt: string;
  /**
   * Label of the engine/tool that produced the image, e.g. "gpt_image",
   * "nano_banana", "flux-kontext". Free-form; defaults to "external".
   */
  engine?: string;
  /**
   * Version number this image was derived from. Defaults to the session's
   * current version; pass 0 for a fresh lineage.
   */
  basedOn?: string;
  /** Session name. Reuse to continue an existing session. */
  sessionName?: string;
  /** Directory that contains (or will contain) the session. */
  sessionDir?: string;
  /** Absolute path of the project this work belongs to (for directory mapping). */
  projectRoot?: string;
  /**
   * New attributes to lock into the session, as "key=value" pairs separated
   * by ";" or newlines. Locked attributes are injected into every future
   * prompt in this session. Existing keys with the same name are overwritten.
   */
  lock?: string;
  /** Keys to remove from the locked set (semicolon-separated). */
  unlock?: string;
};

/**
 * Commit an externally generated image as a new version in the session.
 * Copies the file into versions/, updates the manifest and locks, and
 * returns the new version path and session summary.
 */
export default async function tool(input: Input) {
  if (!fs.existsSync(input.imagePath)) {
    return {
      error: "image-not-found",
      message: `Image not found: ${input.imagePath}. Pass the absolute path of the file produced by the external image tool.`,
    };
  }

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

  // Progressive locking: identical semantics to imagen-edit / imagen-generate.
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

  // Copy (never move) the source file into the session's versions directory,
  // preserving the source extension so external tools' formats survive.
  const srcExt = (path.extname(input.imagePath).replace(".", "") || "png").toLowerCase();
  const n = manifest.versions.length + 1;
  const file = path.join(sessionPath, "versions", `v${n}.${srcExt}`);
  fs.copyFileSync(input.imagePath, file);

  const basedOn = input.basedOn !== undefined ? Number(input.basedOn) : manifest.current || null;
  const engine = input.engine?.trim() || "external";

  const version: SessionManifest["versions"][number] = {
    n,
    file,
    engine,
    prompt: input.prompt,
    createdAt: new Date().toISOString(),
    basedOn: basedOn && basedOn > 0 ? basedOn : null,
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
