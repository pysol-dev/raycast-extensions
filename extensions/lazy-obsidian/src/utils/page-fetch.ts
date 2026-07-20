import fetch from "node-fetch";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { parse } from "node-html-parser";

export type PageFetchResult = {
  markdown: string;
  title?: string;
  source: "jina" | "local" | "empty";
  error?: string;
};

/**
 * Resilient URL → markdown for LazyObsidian.
 *
 * Primary: Jina Reader (https://r.jina.ai/<url>) — server-side headless Chrome /
 * curl-impersonate. Low maintenance; no local browser stack.
 * Optional API key: higher rate limits + X-Proxy: auto.
 *
 * Fallback: direct fetch + html→markdown (best-effort).
 *
 * @see https://jina.ai/reader
 * @see https://github.com/jina-ai/reader
 */
export async function fetchPageMarkdown(
  url: string,
  options?: { jinaApiKey?: string; timeoutMs?: number }
): Promise<PageFetchResult> {
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const key = options?.jinaApiKey?.trim();

  const jina = await fetchViaJina(url, key, timeoutMs);
  if (jina.markdown.trim().length > 40) {
    return jina;
  }

  const local = await fetchViaLocal(url, timeoutMs);
  if (local.markdown.trim().length > 40) {
    return local;
  }

  return {
    markdown: jina.markdown || local.markdown || "",
    title: jina.title || local.title,
    source: "empty",
    error: jina.error || local.error || "No content extracted",
  };
}

async function fetchViaJina(url: string, apiKey: string | undefined, timeoutMs: number): Promise<PageFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
      "X-Retain-Images": "none",
      "X-Timeout": String(Math.min(Math.floor(timeoutMs / 1000), 60)),
      "X-Engine": "browser",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers["X-Proxy"] = "auto";
    }

    const endpoint = `https://r.jina.ai/${url}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      signal: controller.signal as AbortSignal,
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        markdown: text.length > 100 ? text : "",
        source: "jina",
        error: text.length > 100 ? undefined : `Jina HTTP ${response.status}`,
      };
    }

    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    return {
      markdown: text,
      title: titleMatch?.[1]?.trim(),
      source: "jina",
    };
  } catch (e) {
    return {
      markdown: "",
      source: "jina",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchViaLocal(url: string, timeoutMs: number): Promise<PageFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal as AbortSignal,
    });
    if (!response.ok) {
      return { markdown: "", source: "local", error: `HTTP ${response.status}` };
    }
    const html = await response.text();
    const root = parse(html);
    const title = root.querySelector("title")?.text?.trim();
    const main = root.querySelector("article") || root.querySelector("main") || root.querySelector("body");
    const nhm = new NodeHtmlMarkdown();
    const markdown = nhm.translate(main ? main.innerHTML : html);
    return { markdown, title, source: "local" };
  } catch (e) {
    return {
      markdown: "",
      source: "local",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
