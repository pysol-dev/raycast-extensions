/**
 * Engine routing for Imagen.
 *
 * Routing rule (agreed design):
 * - Edits to existing images default to Flux Kontext (BFL), which is
 *   architected for instruction-based editing with preservation of
 *   unchanged regions.
 * - Fresh generations default to gpt-image (OpenAI) or nano-banana (Gemini).
 * - The caller can override the engine per call; if Kontext quality
 *   disappoints for a given edit type, switch via the `engine` input.
 *
 * All engines are called over direct HTTPS with user-supplied API keys from
 * extension preferences. The @raycast/api AI namespace exposes only text
 * completion (AI.ask) — there is no image generation API — so direct HTTP
 * is the documented path. See .agents/decisions/002-engine-routing.md.
 */

import { getPreferenceValues } from "@raycast/api";
import * as fs from "fs";
import { ImagenPreferences } from "./session";

export type Engine = "flux-kontext" | "gpt-image" | "nano-banana";

export interface EngineRequest {
  prompt: string;
  /** Input image(s): absolute local paths or https URLs. */
  inputImages?: string[];
  /** 1:1, 4:3, 3:4, 16:9, 9:16 (generation only; edits match input). */
  aspectRatio?: string;
  /** Extra attributes that must persist (appended to prompt). */
  locked?: Record<string, string>;
}

export interface EngineResult {
  /** Raw image bytes. */
  data: Buffer;
  /** File extension without dot, e.g. "png". */
  ext: string;
  engine: Engine;
}

export class MissingApiKeyError extends Error {
  constructor(engine: Engine, prefName: string) {
    super(
      `No API key configured for engine "${engine}". Set the "${prefName}" preference in Raycast Preferences > Extensions > Imagen.`
    );
    this.name = "MissingApiKeyError";
  }
}

/** Pick the default engine for a task. */
export function defaultEngine(kind: "edit" | "generate"): Engine {
  return kind === "edit" ? "flux-kontext" : "gpt-image";
}

/** Compose the final prompt: user prompt + locked attributes block. */
export function composePrompt(req: EngineRequest): string {
  const locked = req.locked ? Object.entries(req.locked) : [];
  if (locked.length === 0) return req.prompt;
  const lines = locked.map(([k, v]) => `- ${k}: ${v}`);
  return `${req.prompt}\n\nPreserve the following attributes exactly as described:\n${lines.join("\n")}`;
}

/** Convert a local file to a base64 data URL. */
function toDataUrl(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  const ext = filePath.toLowerCase().endsWith(".jpg") || filePath.toLowerCase().endsWith(".jpeg") ? "jpeg" : "png";
  return `data:image/${ext};base64,${buf.toString("base64")}`;
}

function isLocalPath(s: string): boolean {
  return !s.startsWith("http://") && !s.startsWith("https://");
}

/** Run the requested engine and return image bytes. */
export async function runEngine(engine: Engine, req: EngineRequest): Promise<EngineResult> {
  const prefs = getPreferenceValues<ImagenPreferences>();
  const prompt = composePrompt(req);
  switch (engine) {
    case "flux-kontext":
      return runFluxKontext(prompt, req, prefs);
    case "gpt-image":
      return runGptImage(prompt, req, prefs);
    case "nano-banana":
      return runNanoBanana(prompt, req, prefs);
  }
}

/* ------------------------------ Flux Kontext (BFL) ------------------------------ */

async function runFluxKontext(prompt: string, req: EngineRequest, prefs: ImagenPreferences): Promise<EngineResult> {
  if (!prefs.bflApiKey) throw new MissingApiKeyError("flux-kontext", "bflApiKey");
  if (!req.inputImages?.length) {
    throw new Error("flux-kontext requires at least one input image.");
  }
  const image = isLocalPath(req.inputImages[0]) ? toDataUrl(req.inputImages[0]) : req.inputImages[0];

  // Submit
  const submitRes = await fetch("https://api.bfl.ai/v1/flux-kontext-max", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-key": prefs.bflApiKey,
    },
    body: JSON.stringify({
      prompt,
      input_image: image,
      output_format: "png",
      // Safety off is not attempted; defaults apply.
    }),
  });
  if (!submitRes.ok) {
    throw new Error(`BFL submit failed (${submitRes.status}): ${await submitRes.text()}`);
  }
  const submitJson = (await submitRes.json()) as { id: string; polling_url?: string };

  // Poll
  const pollingUrl = submitJson.polling_url ?? `https://api.bfl.ai/v1/get_result?id=${submitJson.id}`;
  for (let i = 0; i < 120; i++) {
    await sleep(2000);
    const pollRes = await fetch(pollingUrl, { headers: { "x-key": prefs.bflApiKey! } });
    if (!pollRes.ok) continue;
    const pollJson = (await pollRes.json()) as { status: string; result?: { sample?: string } };
    if (pollJson.status === "Ready" && pollJson.result?.sample) {
      const imgRes = await fetch(pollJson.result.sample);
      if (!imgRes.ok) throw new Error(`BFL download failed (${imgRes.status})`);
      return { data: Buffer.from(await imgRes.arrayBuffer()), ext: "png", engine: "flux-kontext" };
    }
    if (pollJson.status === "Error" || pollJson.status === "Content Moderation") {
      throw new Error(`BFL generation failed: ${pollJson.status}`);
    }
  }
  throw new Error("BFL polling timed out after 4 minutes.");
}

/* ------------------------------ gpt-image (OpenAI) ------------------------------ */

async function runGptImage(prompt: string, req: EngineRequest, prefs: ImagenPreferences): Promise<EngineResult> {
  if (!prefs.openaiApiKey) throw new MissingApiKeyError("gpt-image", "openaiApiKey");

  const size = aspectToGptSize(req.aspectRatio);
  const hasInput = !!req.inputImages?.length;

  let res: Response;
  if (hasInput) {
    // Edits endpoint: multipart form with image(s)
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", size);
    for (const img of req.inputImages!) {
      const blob = new Blob(
        [isLocalPath(img) ? fs.readFileSync(img) : Buffer.from(await (await fetch(img)).arrayBuffer())],
        {
          type: "image/png",
        }
      );
      form.append("image[]", blob, "input.png");
    }
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${prefs.openaiApiKey}` },
      body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prefs.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
    });
  }
  if (!res.ok) throw new Error(`OpenAI failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
  const item = json.data[0];
  if (item.b64_json) return { data: Buffer.from(item.b64_json, "base64"), ext: "png", engine: "gpt-image" };
  if (item.url) {
    const imgRes = await fetch(item.url);
    return { data: Buffer.from(await imgRes.arrayBuffer()), ext: "png", engine: "gpt-image" };
  }
  throw new Error("OpenAI returned no image data.");
}

function aspectToGptSize(ar?: string): string {
  switch (ar) {
    case "16:9":
    case "4:3":
    case "3:2":
      return "1536x1024";
    case "9:16":
    case "3:4":
    case "2:3":
      return "1024x1536";
    default:
      return "1024x1024";
  }
}

/* ------------------------------ nano-banana (Gemini) ------------------------------ */

async function runNanoBanana(prompt: string, req: EngineRequest, prefs: ImagenPreferences): Promise<EngineResult> {
  if (!prefs.geminiApiKey) throw new MissingApiKeyError("nano-banana", "geminiApiKey");

  const parts: unknown[] = [{ text: prompt }];
  for (const img of req.inputImages ?? []) {
    const bytes = isLocalPath(img) ? fs.readFileSync(img) : Buffer.from(await (await fetch(img)).arrayBuffer());
    parts.push({
      inline_data: {
        mime_type: "image/png",
        data: bytes.toString("base64"),
      },
    });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${prefs.geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: req.aspectRatio ? { aspectRatio: req.aspectRatio } : undefined,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[];
  };
  const imgPart = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!imgPart?.inlineData?.data) throw new Error("Gemini returned no image data.");
  const mime = imgPart.inlineData.mimeType ?? "image/png";
  const ext = mime.includes("jpeg") ? "jpg" : "png";
  return { data: Buffer.from(imgPart.inlineData.data, "base64"), ext, engine: "nano-banana" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
