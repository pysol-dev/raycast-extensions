/**
 * configure — Set the default session directory and map project roots to
 * dedicated session directories.
 *
 * Storage layout in LocalStorage:
 * - "imagen.defaultDir"  : global default session directory
 * - "imagen.root:<path>" : per-project-root session directory
 */

import { Action, ActionPanel, Form, Icon, List, LocalStorage, launchCommand, LaunchType, showHUD } from "@raycast/api";
import { useEffect, useState } from "react";
import * as fs from "fs";
import * as path from "path";
import { ROOT_MAP_PREFIX } from "./lib/session";

const DEFAULT_DIR_KEY = "imagen.defaultDir";

function normalizeDir(p: string): string {
  return path.resolve(p.replace(/^~(?=\/|$)/, process.env.HOME || "~"));
}

interface RootMapping {
  key: string;
  root: string;
  dir: string;
}

export default function Command() {
  const [defaultDir, setDefaultDir] = useState<string>("");
  const [mappings, setMappings] = useState<RootMapping[]>([]);
  const [newRoot, setNewRoot] = useState<string[]>([]);
  const [newDir, setNewDir] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function reload() {
    const def = await LocalStorage.getItem<string>(DEFAULT_DIR_KEY);
    setDefaultDir(def ?? "");
    const items = await LocalStorage.allItems();
    const maps: RootMapping[] = [];
    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith(ROOT_MAP_PREFIX) && typeof value === "string") {
        maps.push({ key, root: key.slice(ROOT_MAP_PREFIX.length), dir: value });
      }
    }
    maps.sort((a, b) => a.root.localeCompare(b.root));
    setMappings(maps);
    setIsLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function saveDefaultDir(value: string[]) {
    if (value[0]) {
      await LocalStorage.setItem(DEFAULT_DIR_KEY, normalizeDir(value[0]));
      await showHUD("Default session directory saved");
    }
    void reload();
  }

  async function addMapping() {
    if (!newRoot[0] || !newDir[0]) return;
    const root = normalizeDir(newRoot[0]);
    const dir = normalizeDir(newDir[0]);
    fs.mkdirSync(dir, { recursive: true });
    await LocalStorage.setItem(ROOT_MAP_PREFIX + root, dir);
    setNewRoot([]);
    setNewDir([]);
    await showHUD(`Mapped ${root} → ${dir}`);
    void reload();
  }

  async function removeMapping(key: string) {
    await LocalStorage.removeItem(key);
    void reload();
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search mappings">
      <List.Section title="Default Session Directory">
        <List.Item
          icon={Icon.Folder}
          title={defaultDir || "Not configured"}
          subtitle="Used when no project mapping or explicit directory applies"
          actions={
            <ActionPanel>
              <Action.Push
                title="Set Default Directory"
                icon={Icon.Folder}
                target={
                  <Form
                    actions={
                      <ActionPanel>
                        <Action.SubmitForm
                          title="Save"
                          onSubmit={async (values: { dir?: string[] }) => {
                            await saveDefaultDir(values.dir ?? []);
                            await launchCommand({ name: "configure", type: LaunchType.UserInitiated });
                          }}
                        />
                      </ActionPanel>
                    }
                  >
                    <Form.FilePicker
                      id="dir"
                      title="Directory"
                      canChooseFiles={false}
                      canChooseDirectories
                      allowMultipleSelection={false}
                    />
                  </Form>
                }
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Project Mappings" subtitle="Project root → session directory">
        {mappings.map((m) => (
          <List.Item
            key={m.key}
            icon={Icon.Map}
            title={m.root}
            subtitle={m.dir}
            actions={
              <ActionPanel>
                <Action title="Remove Mapping" icon={Icon.Trash} onAction={() => removeMapping(m.key)} />
              </ActionPanel>
            }
          />
        ))}
        <List.Item
          icon={Icon.Plus}
          title="Add Project Mapping…"
          actions={
            <ActionPanel>
              <Action.Push
                title="Add Mapping"
                icon={Icon.Plus}
                target={
                  <Form
                    actions={
                      <ActionPanel>
                        <Action.SubmitForm title="Save Mapping" onSubmit={addMapping} />
                      </ActionPanel>
                    }
                  >
                    <Form.FilePicker
                      id="root"
                      title="Project Root"
                      canChooseFiles={false}
                      canChooseDirectories
                      allowMultipleSelection={false}
                      value={newRoot}
                      onChange={setNewRoot}
                    />
                    <Form.FilePicker
                      id="dir"
                      title="Session Directory"
                      canChooseFiles={false}
                      canChooseDirectories
                      allowMultipleSelection={false}
                      value={newDir}
                      onChange={setNewDir}
                    />
                  </Form>
                }
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
