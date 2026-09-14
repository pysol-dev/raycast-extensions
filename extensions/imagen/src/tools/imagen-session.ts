/**
 * imagen-session — Inspect or manage a versioned image session.
 *
 * Actions:
 * - "status" (default): return the manifest, version list, and current pointer.
 * - "rollback": move the current-version pointer back (does not delete files).
 * - "set-current": point the session at a specific version number.
 *
 * Rollback/set-current only move the pointer; files are never deleted, so
 * any version can be revisited.
 */

import {
  resolveSessionBase,
  createSession,
  readManifest,
  writeManifest,
  SessionNotConfiguredError,
} from "../lib/session";

type Input = {
  /** Action to perform. Default "status". */
  action?: "status" | "rollback" | "set-current";
  /** Session name to inspect. Omit to use the most recently updated session in the directory. */
  sessionName?: string;
  /** Directory containing the session. */
  sessionDir?: string;
  /** Absolute path of the project this work belongs to (for directory mapping). */
  projectRoot?: string;
  /** Target version number for "set-current", or steps back for "rollback" (default 1). */
  target?: string;
};

/**
 * Read or manage the session manifest: list versions, roll back the current
 * pointer, or point at a specific version. Never deletes files.
 */
export default async function tool(input: Input) {
  const action = input.action ?? "status";

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
  const manifest = readManifest(sessionPath);

  if (!manifest) {
    return {
      error: "no-session",
      message: `No session found at ${sessionPath}. Generate or edit an image first with imagen-generate / imagen-edit.`,
    };
  }

  if (action === "rollback") {
    const steps = Number(input.target ?? 1);
    const target = Math.max(1, manifest.current - steps);
    manifest.current = target;
    manifest.updatedAt = new Date().toISOString();
    writeManifest(sessionPath, manifest);
  } else if (action === "set-current") {
    const targetNum = Number(input.target);
    if (!targetNum || targetNum < 1 || targetNum > manifest.versions.length) {
      return {
        error: "invalid-target",
        message: `target must be between 1 and ${manifest.versions.length}.`,
        versions: manifest.versions.map((v) => ({ n: v.n, engine: v.engine, prompt: v.prompt })),
      };
    }
    manifest.current = targetNum;
    manifest.updatedAt = new Date().toISOString();
    writeManifest(sessionPath, manifest);
  }

  const current = manifest.versions.find((v) => v.n === manifest.current);
  return {
    ok: true,
    session: sessionPath,
    name: manifest.name,
    current: manifest.current,
    currentFile: current?.file,
    updatedAt: manifest.updatedAt,
    lockedAttributes: manifest.locked ?? {},
    versions: manifest.versions.map((v) => ({
      n: v.n,
      file: v.file,
      engine: v.engine,
      basedOn: v.basedOn,
      prompt: v.prompt,
      createdAt: v.createdAt,
    })),
  };
}
