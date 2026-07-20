import fs from "fs";
import path from "path";
import { open, showToast, Toast } from "@raycast/api";
import type { Vault } from "./interfaces";

const DEFAULT_EXCLUDED = new Set([".obsidian", ".git", ".trash", "node_modules", ".DS_Store"]);

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "");
  return cleaned.length > 0 ? cleaned : `capture-${Date.now()}`;
}

export function resolveVaultByName(vaults: Vault[], vaultName: string): Vault | undefined {
  return vaults.find((v) => v.name === vaultName || v.key === vaultName || v.path === vaultName);
}

export function listVaultFolders(vaultPath: string, relativeDir = "", extraExcluded: string[] = []): string[] {
  const excluded = new Set([...DEFAULT_EXCLUDED, ...extraExcluded.map((s) => s.trim()).filter(Boolean)]);
  const abs = path.join(vaultPath, relativeDir);
  if (!fs.existsSync(abs)) return [];

  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !excluded.has(d.name) && !d.name.startsWith("."))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export type WriteMode = "new" | "append" | "overwrite";

export interface WriteNoteOptions {
  vault: Vault;
  /** Vault-relative folder, e.g. "inbox" or "Projects/Foo" */
  folder: string;
  /** Note title without extension */
  title: string;
  content: string;
  mode?: WriteMode;
  openAfter?: boolean;
}

export interface WriteNoteResult {
  absolutePath: string;
  relativePath: string;
  created: boolean;
}

/**
 * Primary write path: direct filesystem (no Advanced URI required).
 */
export async function writeNoteToVault(opts: WriteNoteOptions): Promise<WriteNoteResult> {
  const mode = opts.mode ?? "new";
  const folder = (opts.folder || "").replace(/^\/+|\/+$/g, "");
  const fileName = sanitizeFileName(opts.title);
  const relativePath = path.join(folder, `${fileName}.md`);
  const absoluteDir = path.join(opts.vault.path, folder);
  const absolutePath = path.join(absoluteDir, `${fileName}.md`);

  ensureDir(absoluteDir);

  const exists = fs.existsSync(absolutePath);
  let created = !exists;

  if (mode === "append" && exists) {
    const prev = fs.readFileSync(absolutePath, "utf8");
    const sep = prev.endsWith("\n") ? "\n" : "\n\n";
    fs.writeFileSync(absolutePath, prev + sep + opts.content, "utf8");
  } else if (mode === "overwrite" || !exists) {
    fs.writeFileSync(absolutePath, opts.content, "utf8");
    created = !exists || mode === "overwrite";
  } else if (mode === "new" && exists) {
    // Unique name if collision
    let i = 1;
    let candidate = absolutePath;
    let rel = relativePath;
    while (fs.existsSync(candidate)) {
      const unique = `${fileName}-${i}.md`;
      candidate = path.join(absoluteDir, unique);
      rel = path.join(folder, unique);
      i += 1;
    }
    fs.writeFileSync(candidate, opts.content, "utf8");
    if (opts.openAfter) {
      await openObsidianPath(candidate);
    }
    return { absolutePath: candidate, relativePath: rel, created: true };
  } else {
    fs.writeFileSync(absolutePath, opts.content, "utf8");
  }

  if (opts.openAfter) {
    await openObsidianPath(absolutePath);
  }

  return { absolutePath, relativePath, created };
}

export async function openObsidianPath(absolutePath: string) {
  const target = `obsidian://open?path=${encodeURIComponent(absolutePath)}`;
  await open(target);
}

export async function openObsidianVaultFile(vaultName: string, relativePath: string) {
  const file = relativePath.replace(/\.md$/i, "");
  const target = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
  await open(target);
}

export function showWriteSuccess(relativePath: string) {
  showToast({
    style: Toast.Style.Success,
    title: "Note captured",
    message: relativePath,
  });
}
