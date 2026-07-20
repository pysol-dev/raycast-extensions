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
  return cleaned.length > 0 ? cleaned.slice(0, 180) : `capture-${Date.now()}`;
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

function uniqueMarkdownPath(
  absoluteDir: string,
  folder: string,
  fileName: string
): { absolutePath: string; relativePath: string } {
  let absolutePath = path.join(absoluteDir, `${fileName}.md`);
  let relativePath = path.join(folder, `${fileName}.md`);
  if (!fs.existsSync(absolutePath)) {
    return { absolutePath, relativePath };
  }
  let i = 1;
  while (fs.existsSync(absolutePath)) {
    const unique = `${fileName}-${i}`;
    absolutePath = path.join(absoluteDir, `${unique}.md`);
    relativePath = path.join(folder, `${unique}.md`);
    i += 1;
  }
  return { absolutePath, relativePath };
}

/**
 * Primary write path: direct filesystem (no Advanced URI required).
 */
export async function writeNoteToVault(opts: WriteNoteOptions): Promise<WriteNoteResult> {
  const mode = opts.mode ?? "new";
  const folder = (opts.folder || "").replace(/^[/\\]+|[/\\]+$/g, "");
  const fileName = sanitizeFileName(opts.title);
  const absoluteDir = path.join(opts.vault.path, folder);
  ensureDir(absoluteDir);

  const baseAbsolute = path.join(absoluteDir, `${fileName}.md`);
  const baseRelative = path.join(folder, `${fileName}.md`);
  const exists = fs.existsSync(baseAbsolute);

  let absolutePath = baseAbsolute;
  let relativePath = baseRelative;
  let created = false;

  if (mode === "append") {
    if (exists) {
      const prev = fs.readFileSync(baseAbsolute, "utf8");
      const sep = prev.length === 0 || prev.endsWith("\n") ? "\n" : "\n\n";
      fs.writeFileSync(baseAbsolute, prev + sep + opts.content, "utf8");
      created = false;
    } else {
      fs.writeFileSync(baseAbsolute, opts.content, "utf8");
      created = true;
    }
  } else if (mode === "overwrite") {
    fs.writeFileSync(baseAbsolute, opts.content, "utf8");
    created = !exists;
  } else {
    // mode === "new": never clobber; pick unique name on collision
    const target = uniqueMarkdownPath(absoluteDir, folder, fileName);
    absolutePath = target.absolutePath;
    relativePath = target.relativePath;
    fs.writeFileSync(absolutePath, opts.content, "utf8");
    created = true;
  }

  if (opts.openAfter) {
    await openObsidianPath(absolutePath);
  }

  return { absolutePath, relativePath, created };
}

export async function openObsidianPath(absolutePath: string) {
  // Core Obsidian URI — works without Advanced URI plugin
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
