import { getPreferenceValues } from "@raycast/api";

import fs from "fs";
import { readFile } from "fs/promises";
import fetch from "node-fetch";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { parse } from "node-html-parser";
import { homedir } from "os";
import fsPath from "path";
import { useEffect, useMemo, useState } from "react";

// @ts-expect-error node-fetch polyfill for libraries expecting global fetch
global.fetch = fetch;

import { ObsidianJSON, ObsidianVaultsState, Vault } from "./interfaces";
import { GlobalPreferences } from "./preferences";

function getVaultNameFromPath(vaultPath: string): string {
  const name = vaultPath
    .split(fsPath.sep)
    .filter((i) => i !== "")
    .pop();
  return name || "Default Vault Name (check your path preferences)";
}

export function parseVaults(): Vault[] {
  const pref: GlobalPreferences = getPreferenceValues();
  const vaultString = pref.vaultPath || "";
  return vaultString
    .split(",")
    .map((vaultPath) => vaultPath.trim())
    .filter((vaultPath) => vaultPath !== "")
    .filter((vaultPath) => fs.existsSync(vaultPath))
    .map((vault) => ({
      name: getVaultNameFromPath(vault),
      key: vault,
      path: vault,
    }));
}

async function loadObsidianJson(): Promise<Vault[]> {
  const obsidianJsonPath = fsPath.resolve(`${homedir()}/Library/Application Support/obsidian/obsidian.json`);
  try {
    const obsidianJson = JSON.parse(await readFile(obsidianJsonPath, "utf8")) as ObsidianJSON;
    return Object.values(obsidianJson.vaults)
      .filter((v) => fs.existsSync(v.path))
      .map(({ path }) => ({
        name: getVaultNameFromPath(path),
        key: path,
        path,
      }));
  } catch {
    return [];
  }
}

/**
 * Resolve vaults from preferences and/or Obsidian's obsidian.json.
 * Preference paths win when set; otherwise auto-detect.
 * If both exist, preference vaults are listed first, then any additional detected vaults.
 */
export function useObsidianVaults(): ObsidianVaultsState {
  const pref = useMemo(() => getPreferenceValues<GlobalPreferences>(), []);
  const hasPrefPaths = Boolean(pref.vaultPath && pref.vaultPath.trim());

  const [state, setState] = useState<ObsidianVaultsState>({
    ready: false,
    vaults: hasPrefPaths ? parseVaults() : [],
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const fromPrefs = hasPrefPaths ? parseVaults() : [];
      const fromJson = await loadObsidianJson();

      const byPath = new Map<string, Vault>();
      for (const v of fromPrefs) byPath.set(v.path, v);
      for (const v of fromJson) {
        if (!byPath.has(v.path)) byPath.set(v.path, v);
      }

      if (!cancelled) {
        setState({ ready: true, vaults: Array.from(byPath.values()) });
      }
    })().catch(() => {
      if (!cancelled) {
        setState({ ready: true, vaults: hasPrefPaths ? parseVaults() : [] });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hasPrefPaths, pref.vaultPath]);

  return state;
}

export async function urlToMarkdown(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "LazyObsidian/0.1 (Raycast; +https://github.com/pysol-dev/raycast-extensions)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const root = parse(html);
    const main = root.querySelector("article") || root.querySelector("main") || root.querySelector("body");
    const nhm = new NodeHtmlMarkdown();
    return nhm.translate(main ? main.innerHTML : html);
  } catch (e) {
    console.error(e);
    return "";
  }
}
