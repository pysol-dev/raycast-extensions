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
    .filter((vaultPath) => vaultPath.trim() !== "")
    .filter((vaultPath) => fs.existsSync(vaultPath.trim()))
    .map((vault) => ({
      name: getVaultNameFromPath(vault.trim()),
      key: vault.trim(),
      path: vault.trim(),
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

export function useObsidianVaults(): ObsidianVaultsState {
  const pref = useMemo(() => getPreferenceValues<GlobalPreferences>(), []);
  const [state, setState] = useState<ObsidianVaultsState>(
    pref.vaultPath
      ? {
          ready: true,
          vaults: parseVaults(),
        }
      : { ready: false, vaults: [] }
  );

  useEffect(() => {
    if (!state.ready) {
      loadObsidianJson()
        .then((vaults) => {
          setState({ vaults, ready: true });
        })
        .catch(() => setState({ vaults: parseVaults(), ready: true }));
    }
  }, []);

  return state;
}

export async function urlToMarkdown(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const root = parse(html);
    // Prefer main/article content when present
    const main = root.querySelector("article") || root.querySelector("main") || root.querySelector("body");
    const nhm = new NodeHtmlMarkdown();
    return nhm.translate(main ? main.innerHTML : html);
  } catch (e) {
    console.error(e);
    return "";
  }
}
