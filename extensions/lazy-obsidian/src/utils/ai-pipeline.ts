import { AI } from "@raycast/api";

export type IngestAIResult = {
  title?: string;
  folder?: string;
  subfolder?: string;
  tags?: string[];
  body_markdown?: string;
  notes?: string;
};

const SYSTEM = `You are LazyObsidian, an ingest assistant for an Obsidian vault.
Return ONLY valid JSON (no markdown fences) with optional keys:
{
  "title": string,
  "folder": string,        // must be one of the provided folders or "" for vault root
  "subfolder": string,     // optional child of folder, or ""
  "tags": string[],        // short kebab-case or existing-style tags
  "body_markdown": string, // full note body to save
  "notes": string          // brief explanation of choices
}
Rules:
- Prefer the user's Prompt instructions above all.
- Keep body_markdown faithful; expand structure, wikilinks [[Like This]], and headings when asked.
- Do not invent folder names that are not in the allowed list (except empty string for root).
- If unsure about folder, omit folder/subfolder.
- body_markdown should be complete enough to save as the note.
`;

export async function processCaptureWithAI(input: {
  userPrompt: string;
  title: string;
  note: string;
  link?: string;
  highlight?: string;
  pageContent?: string;
  folders: string[];
  subfolders: string[];
  currentFolder: string;
  currentSubfolder: string;
}): Promise<IngestAIResult> {
  const prompt = `${SYSTEM}

Allowed root folders: ${JSON.stringify(["(vault root)", ...input.folders])}
Allowed subfolders for current folder: ${JSON.stringify(input.subfolders)}
Current folder: ${input.currentFolder || "(vault root)"}
Current subfolder: ${input.currentSubfolder || "(none)"}

User prompt:
${input.userPrompt}

Current title: ${input.title}
User note field: ${input.note || "(empty)"}
Link: ${input.link || "(none)"}
Highlight: ${input.highlight || "(none)"}

Captured page/transcript (may be long; use judiciously):
${(input.pageContent || "").slice(0, 12000)}
`;

  const raw = await AI.ask(prompt, { creativity: "low" });
  return parseJsonLoose(raw);
}

function parseJsonLoose(raw: string): IngestAIResult {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as IngestAIResult;
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence?.[1]) {
      try {
        return JSON.parse(fence[1].trim()) as IngestAIResult;
      } catch {
        /* fall through */
      }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as IngestAIResult;
      } catch {
        /* fall through */
      }
    }
    // If AI returned prose, treat as body
    return { body_markdown: trimmed };
  }
}
