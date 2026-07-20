import {
  Action,
  ActionPanel,
  AI,
  closeMainWindow,
  environment,
  Form,
  getFrontmostApplication,
  getPreferenceValues,
  getSelectedText,
  Icon,
  List,
  LocalStorage,
  popToRoot,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { runAppleScript } from "@raycast/utils";

import fs from "fs";
import path from "path";
import { useEffect, useMemo, useState } from "react";

import { YoutubeTranscript } from "youtube-transcript";
import { NoVaultFoundMessage } from "./components/Notifications/NoVaultFoundMessage";
import { GET_LINK_FROM_BROWSER_SCRIPT, SUPPORTED_BROWSERS } from "./scripts/browser";
import { processCaptureWithAI } from "./utils/ai-pipeline";
import { SUMMARY_PROMPT } from "./utils/constants";
import { listVaultFolders, resolveVaultByName, writeNoteToVault } from "./utils/fs-vault";
import type { Vault } from "./utils/interfaces";
import { fetchPageMarkdown } from "./utils/page-fetch";
import { useObsidianVaults } from "./utils/utils";

interface Preferences {
  vaultPath?: string;
  openOnCapture?: boolean;
  excludedFolders?: string;
  jinaApiKey?: string;
  autoProcessWithAI?: boolean;
}

interface CaptureFormValues {
  vault: string;
  folder: string;
  subFolder: string;
  fileName: string;
  content: string;
  prompt?: string;
  highlight?: boolean;
  "page-contents"?: boolean;
  summary?: boolean;
}

function buildBody(opts: {
  content?: string;
  linkTitle?: string;
  linkUrl?: string;
  highlight?: string;
  includeHighlight: boolean;
  summaryText?: string;
  includeSummary: boolean;
  pageContent?: string;
  includePageContents: boolean;
}): string {
  const parts: string[] = [];
  if (opts.content?.trim()) parts.push(opts.content.trim());
  if (opts.linkUrl) {
    const t = opts.linkTitle || opts.linkUrl;
    parts.push(`[${t}](${opts.linkUrl})`);
  }
  if (opts.includeHighlight && opts.highlight?.trim()) {
    parts.push(`> ${opts.highlight.trim()}`);
  }
  if (opts.includeSummary && opts.summaryText?.trim()) {
    parts.push(`---\n\n${opts.summaryText.trim()}\n\n---`);
  }
  if (opts.includePageContents && opts.pageContent?.trim()) {
    parts.push(opts.pageContent.trim());
  }
  return parts.join("\n\n");
}

export default function Capture() {
  const canAccessAI = environment.canAccess(AI);
  const prefs = getPreferenceValues<Preferences>();
  const { ready, vaults: allVaults } = useObsidianVaults();
  const extraExcluded = useMemo(
    () =>
      (prefs.excludedFolders || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [prefs.excludedFolders]
  );

  const [defaultVault, setDefaultVault] = useState<string | undefined>(undefined);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);

  const [selectedVaultName, setSelectedVaultName] = useState<string>("");
  const [folder, setFolder] = useState<string>("inbox");
  const [subFolder, setSubFolder] = useState<string>("");
  const [folders, setFolders] = useState<string[]>([]);
  const [subFolders, setSubFolders] = useState<string[]>([]);

  const [selectedText, setSelectedText] = useState<string>("");
  const [includeHighlight, setIncludeHighlight] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(false);
  const [pageContent, setPageContent] = useState("");
  const [pageContentMessage, setPageContentMessage] = useState("Include page content");
  const [pageFetchSource, setPageFetchSource] = useState<string>("");
  const [summary, setSummary] = useState("");
  const [selectedResource, setSelectedResource] = useState("");
  const [includePageContents, setIncludePageContents] = useState(false);
  const [resourceInfo, setResourceInfo] = useState("");
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  useEffect(() => {
    (async () => {
      const [savedVault, savedFolder, savedSub, savedPath] = await Promise.all([
        LocalStorage.getItem("vault"),
        LocalStorage.getItem("folder"),
        LocalStorage.getItem("subFolder"),
        LocalStorage.getItem("path"),
      ]);

      if (savedVault) {
        setDefaultVault(String(savedVault));
        setSelectedVaultName(String(savedVault));
      }

      if (savedFolder) {
        setFolder(String(savedFolder));
      } else if (savedPath) {
        const parts = String(savedPath).split("/").filter(Boolean);
        if (parts[0]) setFolder(parts[0]);
        if (parts[1]) setSubFolder(parts[1]);
      }

      if (savedSub) setSubFolder(String(savedSub));
      setDefaultsLoaded(true);
    })().catch(() => setDefaultsLoaded(true));
  }, []);

  const activeVault: Vault | undefined = useMemo(() => {
    if (!allVaults.length) return undefined;
    const key = selectedVaultName || defaultVault || allVaults[0].path;
    return resolveVaultByName(allVaults, key) || allVaults[0];
  }, [allVaults, selectedVaultName, defaultVault]);

  useEffect(() => {
    if (!activeVault) {
      setFolders([]);
      return;
    }
    try {
      const rootFolders = listVaultFolders(activeVault.path, "", extraExcluded);
      const withInbox = rootFolders.includes("inbox") ? rootFolders : ["inbox", ...rootFolders];
      setFolders(withInbox);
      if (folder && folder !== "(vault root)" && !withInbox.includes(folder)) {
        setFolder(withInbox.includes("inbox") ? "inbox" : withInbox[0] || "(vault root)");
      }
    } catch (e) {
      console.error(e);
      setFolders(["inbox"]);
    }
  }, [activeVault?.path, extraExcluded]);

  useEffect(() => {
    if (!activeVault || !folder || folder === "(vault root)") {
      setSubFolders([]);
      if (subFolder) setSubFolder("");
      return;
    }
    try {
      const subs = listVaultFolders(activeVault.path, folder, extraExcluded);
      setSubFolders(subs);
      if (subFolder && !subs.includes(subFolder)) setSubFolder("");
    } catch {
      setSubFolders([]);
    }
  }, [activeVault?.path, folder, extraExcluded]);

  useEffect(() => {
    let cancelled = false;

    const loadPageContent = async (url: string) => {
      try {
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          if (!cancelled) setPageContentMessage("Include video transcript");
          const captions = await YoutubeTranscript.fetchTranscript(url);
          if (!cancelled) {
            setPageContent(captions.map((c) => c.text).join("\n"));
            setPageFetchSource("youtube-transcript");
          }
          return;
        }

        if (!cancelled) setPageContentMessage("Include page content");
        const result = await fetchPageMarkdown(url, { jinaApiKey: prefs.jinaApiKey });
        if (cancelled) return;

        if (result.markdown.trim()) {
          setPageContent(result.markdown);
          setPageFetchSource(result.source);
          if (result.title) {
            setResourceInfo((prev) => prev || result.title || "");
            setTitle((prev) => (titleTouched || prev ? prev : result.title || prev));
          }
          if (result.source === "jina") {
            showToast({ style: Toast.Style.Success, title: "Page fetched via Jina Reader" });
          } else if (result.source === "local") {
            showToast({ style: Toast.Style.Success, title: "Page fetched (local fallback)" });
          }
        } else {
          setPageContent("");
          setPageFetchSource("empty");
          showToast({
            style: Toast.Style.Failure,
            title: "Could not extract page content",
            message: result.error || "Try again or paste content into Note",
          });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showToast({ title: "Failed to fetch page content", style: Toast.Style.Failure });
        }
      }
    };

    const setText = async () => {
      setIsLoadingContext(true);
      try {
        let activeApp = "";
        try {
          const front = await getFrontmostApplication();
          activeApp = front.name;
        } catch (error) {
          console.log(error);
        }

        if (activeApp && SUPPORTED_BROWSERS.includes(activeApp)) {
          try {
            const linkInfoStr = await runAppleScript(GET_LINK_FROM_BROWSER_SCRIPT(activeApp));
            const [url, pageTitle] = linkInfoStr.split("\t");
            if (url && pageTitle) {
              if (!cancelled) {
                setSelectedResource(url);
                setResourceInfo(pageTitle);
                setTitle((prev) => (titleTouched || prev ? prev : pageTitle));
              }
              await loadPageContent(url);
            }
          } catch (error) {
            console.log(error);
          }
        }
      } catch (error) {
        console.log(error);
      }

      try {
        const data = await getSelectedText();
        if (data && !cancelled) {
          setSelectedText(data);
          setTitle((prev) => {
            if (titleTouched || prev) return prev;
            return (data.trim().split("\n")[0] || "").slice(0, 80);
          });
        }
      } catch (error) {
        console.log(error);
      }

      if (!cancelled) setIsLoadingContext(false);
    };

    void setText();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const generateSummary = async () => {
      if (!canAccessAI || !pageContent) return;
      showToast({ style: Toast.Style.Animated, title: "Generating Summary" });
      try {
        const result = await AI.ask(SUMMARY_PROMPT + pageContent);
        if (cancelled) return;
        setSummary(result);
        showToast({ style: Toast.Style.Success, title: "Summary captured" });
      } catch {
        if (cancelled) return;
        showToast({ style: Toast.Style.Failure, title: "Failed to generate summary" });
        setIncludeSummary(false);
      }
    };
    if (includeSummary && pageContent) void generateSummary();
    return () => {
      cancelled = true;
    };
  }, [includeSummary, pageContent, canAccessAI]);

  useEffect(() => {
    if (isLoadingContext) return;
    if (selectedText && selectedResource) {
      showToast({ style: Toast.Style.Success, title: "Highlighted text, Source captured" });
    } else if (selectedText) {
      showToast({ style: Toast.Style.Success, title: "Highlighted text captured" });
    } else if (selectedResource) {
      showToast({ style: Toast.Style.Success, title: "Link captured" });
    }
  }, [isLoadingContext, selectedText, selectedResource]);

  async function onSubmit(values: CaptureFormValues) {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      const vault = resolveVaultByName(allVaults, values.vault) || activeVault;
      if (!vault) {
        showToast({ style: Toast.Style.Failure, title: "No vault selected" });
        return;
      }
      if (!fs.existsSync(vault.path)) {
        showToast({ style: Toast.Style.Failure, title: "Vault path does not exist", message: vault.path });
        return;
      }

      let noteTitle = (values.fileName || title || resourceInfo || "Untitled capture").trim();
      let folderPart = values.folder === "(vault root)" ? "" : values.folder || "";
      let subPart = values.subFolder && values.subFolder !== "(none)" ? values.subFolder : "";

      if (includeSummary && !summary && pageContent && canAccessAI) {
        showToast({
          style: Toast.Style.Failure,
          title: "Summary still generating",
          message: "Wait for AI summary or uncheck Include AI Summary",
        });
        return;
      }

      let body = buildBody({
        content: values.content,
        linkTitle: resourceInfo,
        linkUrl: selectedResource || undefined,
        highlight: selectedText,
        includeHighlight: includeHighlight && Boolean(selectedText),
        summaryText: summary,
        includeSummary: includeSummary && Boolean(summary),
        pageContent,
        includePageContents: includePageContents && Boolean(pageContent),
      });

      const userPrompt = (values.prompt || prompt || "").trim();
      const shouldAI = Boolean(userPrompt) && canAccessAI && prefs.autoProcessWithAI !== false;

      if (shouldAI) {
        showToast({ style: Toast.Style.Animated, title: "Processing with AI…" });
        try {
          const ai = await processCaptureWithAI({
            userPrompt,
            title: noteTitle,
            note: values.content || "",
            link: selectedResource,
            highlight: selectedText,
            pageContent,
            folders,
            subfolders: subFolders,
            currentFolder: folderPart || "(vault root)",
            currentSubfolder: subPart,
          });

          if (ai.title?.trim()) noteTitle = ai.title.trim();
          if (ai.body_markdown?.trim()) {
            body = ai.body_markdown.trim();
            // Still append link if AI omitted it and we have one
            if (selectedResource && !body.includes(selectedResource)) {
              body += `\n\n[${resourceInfo || selectedResource}](${selectedResource})`;
            }
          }
          if (ai.folder !== undefined) {
            const f = ai.folder === "(vault root)" ? "" : ai.folder;
            if (!f || folders.includes(f) || f === "") folderPart = f;
          }
          if (ai.subfolder !== undefined) {
            const s = ai.subfolder === "(none)" ? "" : ai.subfolder;
            if (!s || subFolders.includes(s) || s === "") subPart = s;
          }
          if (ai.tags?.length) {
            const tagLine = ai.tags.map((t) => t.replace(/^#/, "")).join(", ");
            if (!body.startsWith("---")) {
              body = `---\ntags: [${ai.tags.map((t) => `"${t.replace(/^#/, "")}"`).join(", ")}]\n---\n\n${body}`;
            } else if (!body.includes("tags:")) {
              body = body.replace(/^---\n/, `---\ntags: [${tagLine}]\n`);
            }
          }
          showToast({ style: Toast.Style.Success, title: "AI processing done" });
        } catch (e) {
          console.error(e);
          showToast({
            style: Toast.Style.Failure,
            title: "AI processing failed",
            message: "Saving without AI transform",
          });
        }
      }

      if (!body.trim() && !noteTitle) {
        showToast({ style: Toast.Style.Failure, title: "Nothing to capture" });
        return;
      }

      const relativeFolder = path.join(folderPart, subPart);
      await LocalStorage.setItem("vault", vault.path);
      await LocalStorage.setItem("folder", folderPart || "inbox");
      await LocalStorage.setItem("subFolder", subPart);

      const openAfter = prefs.openOnCapture !== false;
      const result = await writeNoteToVault({
        vault,
        folder: relativeFolder,
        title: noteTitle,
        content: body || noteTitle,
        mode: "new",
        openAfter,
      });

      await showHUD(`Captured → ${result.relativePath}`, { clearRootSearch: true });
      await popToRoot();
      await closeMainWindow();
    } catch (e) {
      console.error(e);
      showToast({
        style: Toast.Style.Failure,
        title: "Failed to capture",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!ready || !defaultsLoaded) {
    return <List isLoading={true} />;
  }
  if (allVaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  const vaultDefault = (() => {
    if (defaultVault) {
      const match = resolveVaultByName(allVaults, defaultVault);
      if (match) return match.path;
    }
    return allVaults[0].path;
  })();

  return (
    <Form
      isLoading={isSubmitting || isLoadingContext}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Capture" icon={Icon.Download} onSubmit={onSubmit} />
          <Action
            title="Clear Capture"
            shortcut={{ modifiers: ["opt"], key: "backspace" }}
            onAction={() => {
              setResourceInfo("");
              setSelectedResource("");
              setSelectedText("");
              setPageContent("");
              setSummary("");
              setIncludeSummary(false);
              setIncludePageContents(false);
              setPrompt("");
              setPageFetchSource("");
              if (!titleTouched) setTitle("");
              showToast({ style: Toast.Style.Success, title: "Capture Cleared" });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="vault" title="Vault" value={selectedVaultName || vaultDefault} onChange={setSelectedVaultName}>
        {allVaults.map((vault) => (
          <Form.Dropdown.Item key={vault.path} value={vault.path} title={vault.name} icon="🧳" />
        ))}
      </Form.Dropdown>

      <Form.Dropdown id="folder" title="Folder" value={folder || "inbox"} onChange={setFolder}>
        <Form.Dropdown.Item value="(vault root)" title="(vault root)" icon={Icon.HardDrive} />
        {folders.map((f) => (
          <Form.Dropdown.Item key={f} value={f} title={f} icon={Icon.Folder} />
        ))}
      </Form.Dropdown>

      <Form.Dropdown
        id="subFolder"
        title="Sub-Folders"
        value={subFolder ? subFolder : "(none)"}
        onChange={(v) => setSubFolder(v === "(none)" ? "" : v)}
      >
        <Form.Dropdown.Item value="(none)" title="(none)" />
        {subFolders.map((f) => (
          <Form.Dropdown.Item key={f} value={f} title={f} icon={Icon.Folder} />
        ))}
      </Form.Dropdown>

      <Form.TextField
        title="Title"
        id="fileName"
        placeholder="Title for the resource"
        autoFocus
        value={title}
        onChange={(v) => {
          setTitleTouched(true);
          setTitle(v);
        }}
      />

      {canAccessAI ? (
        <Form.TextArea
          title="Prompt"
          id="prompt"
          value={prompt}
          onChange={setPrompt}
          placeholder="Optional: tell Raycast AI what to do (e.g. relate to [[Viktor Frankl]], tag, rewrite…)"
          info="When filled, capture is processed with Raycast AI before save (if AI Processing pref is on)."
        />
      ) : null}

      {selectedText ? (
        <Form.Checkbox
          id="highlight"
          title="Include Highlight"
          label="Include selected text as a quote"
          value={includeHighlight}
          onChange={setIncludeHighlight}
        />
      ) : null}

      {pageContent ? (
        <Form.Checkbox
          id="page-contents"
          title={pageContentMessage}
          label={
            pageFetchSource
              ? `Include fetched content (via ${pageFetchSource})`
              : "Include fetched page content / transcript"
          }
          value={includePageContents}
          onChange={setIncludePageContents}
        />
      ) : null}

      {canAccessAI && pageContent ? (
        <Form.Checkbox
          id="summary"
          title="Include AI Summary"
          label="Generate and include an AI summary"
          value={includeSummary}
          onChange={setIncludeSummary}
        />
      ) : null}

      <Form.TextArea title="Note" id="content" placeholder="Notes about the resource…" />

      {selectedResource ? (
        <Form.Description
          title="Link"
          text={resourceInfo ? `${resourceInfo}\n${selectedResource}` : selectedResource}
        />
      ) : null}

      {selectedText && includeHighlight ? <Form.Description title="Highlight" text={selectedText} /> : null}

      <Form.Description
        title="Write path"
        text="Filesystem save (no Advanced URI). Pages via Jina Reader → local fallback. Optional open uses core Obsidian URI."
      />
    </Form>
  );
}
