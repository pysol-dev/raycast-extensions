import { Detail } from "@raycast/api";

export function NoVaultFoundMessage() {
  return (
    <Detail
      markdown={`# No Obsidian Vault Found

LazyObsidian could not detect any vaults.

## Fix

1. Open your vault at least once in the Obsidian app, **or**
2. Set **Vault Path(s)** in this extension's preferences (absolute path, comma-separated for multiple).

Then re-run **Lazy Capture**.`}
    />
  );
}
