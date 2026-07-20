import { BrowserExtension, environment } from "@raycast/api";
import fetch from "node-fetch";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { parse } from "node-html-parser";

export type PageFetchSource = "browser-extension" | "jina" | "local" | "youtube" | "empty";

export type PageFetchResult = {
  markdown: string;
  title?: string;
  url?: string;
  source: PageFetchSource;
  error?: string;
};

export type BrowserTabInfo = {
  id: number;
  url: string;
  title?: string;
  active: boolean;
};

/**
 * Page content strategy (best → fallback):
 *
 * 1. **Raycast Browser Extension** — reads the live, already-rendered tab
 *    (JS executed, user session/cookies). No bot walls for content the user
 *    can already see. Official API:
 *    https://developers.raycast.com/api-reference/browser-extension
 *
 * 2. **Jina Reader** (`r.jina.ai`) — remote browser/curl-impersonate when the
 *    Browser Extension is unavailable or returned empty.
 *
 * 3. **Local HTML fetch** — last resort only.
 *
 * YouTube is handled separately via youtube-transcript in the caller.
 */
export async function fetchPageMarkdown(
  url: string,
  options?: {
    jinaApiKey?: string;
    timeoutMs?: number;
    /** Prefer matching this URL when choosing a browser tab */
    preferUrl?: string;
    tabId?: number;
    /** Skip Browser Extension (tests / forced remote) */
    skipBrowserExtension?: boolean;
  }
): Promise<PageFetchResult> {
  const timeoutMs = options?.timeoutMs ?? 45_000;
  const key = options?.jinaApiKey?.trim();

  if (!options?.skipBrowserExtension && environment.canAccess(BrowserExtension)) {
    const fromBrowser = await fetchViaBrowserExtension({
      tabId: options?.tabId,
      preferUrl: options?.preferUrl || url,
    });
    if (fromBrowser.markdown.trim().length > 40) {
      return fromBrowser;
    }
  }

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
    url,
    source: "empty",
    error: jina.error || local.error || "No content extracted",
  };
}

/**
 * Resolve active (or URL-matching) tab via Browser Extension.
 * @see https://developers.raycast.com/api-reference/browser-extension
 */
export async function getBrowserTabContext(preferUrl?: string): Promise<BrowserTabInfo | undefined> {
  if (!environment.canAccess(BrowserExtension)) {
    return undefined;
  }
  try {
    const tabs = await BrowserExtension.getTabs();
    if (!tabs?.length) return undefined;

    if (preferUrl) {
      const match =
        tabs.find((t) => t.url === preferUrl) ||
        tabs.find((t) => preferUrl.startsWith(t.url) || t.url.startsWith(preferUrl));
      if (match) {
        return { id: match.id, url: match.url, title: match.title, active: match.active };
      }
    }

    const active = tabs.find((t) => t.active);
    if (active) {
      return { id: active.id, url: active.url, title: active.title, active: true };
    }
    return { id: tabs[0].id, url: tabs[0].url, title: tabs[0].title, active: tabs[0].active };
  } catch {
    return undefined;
  }
}

async function fetchViaBrowserExtension(opts: { tabId?: number; preferUrl?: string }): Promise<PageFetchResult> {
  try {
    let tabId = opts.tabId;
    let title: string | undefined;
    let url: string | undefined = opts.preferUrl;

    if (tabId === undefined) {
      const tab = await getBrowserTabContext(opts.preferUrl);
      if (tab) {
        tabId = tab.id;
        title = tab.title;
        url = tab.url;
      }
    }

    // format: "markdown" = reader-mode heuristic on the live DOM
    // https://developers.raycast.com/api-reference/browser-extension
    const markdown = await BrowserExtension.getContent({
      format: "markdown",
      ...(tabId !== undefined ? { tabId } : {}),
    });

    return {
      markdown: markdown || "",
      title,
      url,
      source: "browser-extension",
      error: markdown?.trim() ? undefined : "Browser Extension returned empty content",
    };
  } catch (e) {
    return {
      markdown: "",
      source: "browser-extension",
      error: e instanceof Error ? e.message : String(e),
    };
  }
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

    const response = await fetch(`https://r.jina.ai/${url}`, {
      method: "GET",
      headers,
      signal: controller.signal as AbortSignal,
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        markdown: text.length > 100 ? text : "",
        url,
        source: "jina",
        error: text.length > 100 ? undefined : `Jina HTTP ${response.status}`,
      };
    }

    const titleMatch = text.match(/^Title:\s*(.+)$/m);
    return {
      markdown: text,
      title: titleMatch?.[1]?.trim(),
      url,
      source: "jina",
    };
  } catch (e) {
    return {
      markdown: "",
      url,
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
      return { markdown: "", url, source: "local", error: `HTTP ${response.status}` };
    }
    const html = await response.text();
    const root = parse(html);
    const title = root.querySelector("title")?.text?.trim();
    const main = root.querySelector("article") || root.querySelector("main") || root.querySelector("body");
    const nhm = new NodeHtmlMarkdown();
    const markdown = nhm.translate(main ? main.innerHTML : html);
    return { markdown, title, url, source: "local" };
  } catch (e) {
    return {
      markdown: "",
      url,
      source: "local",
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}
