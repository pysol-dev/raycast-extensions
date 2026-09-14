/**
 * imagen-generate — Generate a new image from a text prompt.
 *
 * Default engine: gpt-image (OpenAI). Use `engine: "nano-banana"` for the
 * Gemini engine. A reference image may be supplied for conditioning.
 *
 * The result is appended as a new version in the session manifest, so a
 * generation can be continued with edits that preserve unchanged regions.
 */

import * as fs from "fs";
import {
  resolveSessionBase,
  createSession,
  readManifest,
  writeManifest,
  nextVersionPath,
  parseLockSpec,
  mergeLocks,
  SessionManifest,
  SessionNotConfiguredError,
} from "../lib/session";
import { runEngine, defaultEngine, MissingApiKeyError } from "../lib/engines";

type Input = {
  /** Full description of the image to generate. Be specific about subject, style, lighting, and composition. */
  prompt: string;
  /**
   * Optional absolute path or https URL of a reference image to condition
   * the generation on.
   */
  referenceImage?: string;
  /** Aspect ratio: "1:1", "4:3", "3:4", "16:9", or "9:16". Default "1:1". */
  aspectRatio?: "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
  /** Session name. Reuse to continue an existing session. */
  sessionName?: string;
  /** Directory that contains (or will contain) the session. */
  sessionDir?: string;
  /** Absolute path of the project this work belongs to (for directory mapping). */
  projectRoot?: string;
  /** Engine override. Default for generations is "gpt-image". */
  engine?: "flux-kontext" | "gpt-image" | "nano-banana";
  /**
   * New attributes to lock into the session, as "key=value" pairs separated
   * by ";" or newlines (e.g. "palette=muted red/orange/blue/pink"). Locked
   * attributes are injected into every future prompt in this session.
   * Existing keys with the same name are overwritten.
   */
  lock?: string;
  /** Keys to remove from the locked set (semicolon-separated). */
  unlock?: string;
};

/**
 * Generate a new image and append it as a new version in the session.
 * Returns the new version path and session summary.
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

  // Progressive locking: existing locks + unlock + new locks. The effective
  // set is injected into this call's prompt AND persisted to the manifest.
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

  const engine = input.engine ?? defaultEngine("generate");
  const { n, file } = nextVersionPath(sessionPath, manifest);

  try {
    const result = await runEngine(engine, {
      prompt: input.prompt,
      inputImages: input.referenceImage ? [input.referenceImage] : undefined,
      aspectRatio: input.aspectRatio,
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
    basedOn: null,
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
    aspectRatio: input.aspectRatio ?? "1:1",
    totalVersions: manifest.versions.length,
    lockedAttributes: manifest.locked ?? {},
    locksApplied: Object.keys(newLocks).length ? newLocks : undefined,
  };
}
