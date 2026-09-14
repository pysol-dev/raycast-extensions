/**
 * Session resolution for Imagen.
 *
 * Resolution order (first match wins):
 * 1. Explicit `sessionDir` passed in tool input.
 * 2. A project-root mapping stored in LocalStorage (`imagen.root:<path>` -> session dir),
 *    matched by longest-prefix against the caller-provided `projectRoot`.
 * 3. The global default session directory preference.
 *
 * There is no Raycast API to detect the caller's "current project" — the Environment
 * interface exposes only extension-owned paths (assetsPath, supportPath). See
 * .agents/decisions/001-session-scoping.md for the full rationale.
 */

import { LocalStorage, getPreferenceValues, environment } from "@raycast/api";
import * as fs from "fs";
import * as path from "path";

export const ROOT_MAP_PREFIX = "imagen.root:";

export interface ImagenPreferences {
  bflApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  defaultSessionDir?: string;
}

export class SessionNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionNotConfiguredError";
  }
}

function normalizeDir(p: string): string {
  return path.resolve(p.replace(/^~(?=\/|$)/, process.env.HOME || "~"));
}

/**
 * Resolve the directory that will contain the session folder.
 * Throws SessionNotConfiguredError with setup instructions when unresolvable.
 */
export async function resolveSessionBase(explicitDir?: string, projectRoot?: string): Promise<string> {
  // 1. Explicit per-call directory
  if (explicitDir) {
    const dir = normalizeDir(explicitDir);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  // 2. Project-root mapping (longest prefix wins)
  if (projectRoot) {
    const root = normalizeDir(projectRoot);
    const mapping = await findRootMapping(root);
    if (mapping) {
      fs.mkdirSync(mapping, { recursive: true });
      return mapping;
    }
  }

  // 3. Global default preference
  const prefs = getPreferenceValues<ImagenPreferences>();
  if (prefs.defaultSessionDir) {
    const dir = normalizeDir(prefs.defaultSessionDir);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  throw new SessionNotConfiguredError(
    "No session directory configured. Run the 'Configure Session Storage' command in Raycast to set a default directory, or pass an explicit sessionDir."
  );
}

/** Find the stored session dir whose mapped root is the longest prefix of `root`. */
async function findRootMapping(root: string): Promise<string | undefined> {
  let best: { rootLen: number; dir: string } | undefined;
  const items = await LocalStorage.allItems();
  for (const [key, value] of Object.entries(items)) {
    if (!key.startsWith(ROOT_MAP_PREFIX) || typeof value !== "string") continue;
    const mappedRoot = normalizeDir(key.slice(ROOT_MAP_PREFIX.length));
    if (root === mappedRoot || root.startsWith(mappedRoot + path.sep)) {
      if (!best || mappedRoot.length > best.rootLen) {
        best = { rootLen: mappedRoot.length, dir: value };
      }
    }
  }
  return best?.dir;
}

/** Create (or reuse) a session directory and return its path. */
export function createSession(baseDir: string, sessionName?: string): string {
  const slug = sessionName
    ? sessionName
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64)
    : `session-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const sessionPath = path.join(baseDir, slug);
  fs.mkdirSync(path.join(sessionPath, "versions"), { recursive: true });
  return sessionPath;
}

/** Path of the session manifest file. */
export function manifestPath(sessionPath: string): string {
  return path.join(sessionPath, "manifest.json");
}

/** Read the session manifest, or null if it does not exist yet. */
export function readManifest(sessionPath: string): SessionManifest | null {
  const p = manifestPath(sessionPath);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as SessionManifest;
}

/** Write the session manifest atomically (write temp file, then rename). */
export function writeManifest(sessionPath: string, manifest: SessionManifest): void {
  const p = manifestPath(sessionPath);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2));
  fs.renameSync(tmp, p);
}

export interface SessionVersion {
  /** Version number, 1-based. */
  n: number;
  /** Absolute path to the image file. */
  file: string;
  /** Engine that produced this version. */
  engine: string;
  /** The prompt used for this version. */
  prompt: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Version number this edit was based on, null for fresh generations. */
  basedOn: number | null;
}

export interface SessionManifest {
  /** Schema version for forward compatibility. */
  schema: 1;
  /** Human-readable session name. */
  name: string;
  createdAt: string;
  updatedAt: string;
  /** The version the session currently points at. */
  current: number;
  versions: SessionVersion[];
  /**
   * Locked attributes that must persist across versions (subject identity,
   * palette, composition, style constraints). Engines receive these with
   * every prompt to prevent drift.
   */
  locked?: Record<string, string>;
}

/** Compute the next version number and its file path. */
export function nextVersionPath(
  sessionPath: string,
  manifest: SessionManifest | null,
  ext = "png"
): { n: number; file: string } {
  const n = (manifest?.versions.length ?? 0) + 1;
  return { n, file: path.join(sessionPath, "versions", `v${n}.${ext}`) };
}

/** Resolve the file for a given version number (defaults to current). */
export function versionFile(manifest: SessionManifest, n?: number): string | undefined {
  const target = n ?? manifest.current;
  return manifest.versions.find((v) => v.n === target)?.file;
}

/** Fallback location when nothing is configured: the extension support path. */
export function supportFallback(): string {
  return environment.supportPath;
}
