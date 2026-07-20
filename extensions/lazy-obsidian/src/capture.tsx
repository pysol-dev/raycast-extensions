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
import { SUMMARY_PROMPT } from "./utils/constants";
import { listVaultFolders, resolveVaultByName, writeNoteToVault } from "./utils/fs-vault";
import type { Vault } from "./utils/interfaces";
import { urlToMarkdown, useObsidianVaults } from "./utils/utils";

interface Preferences {
  vaultPath?: string;
  openOnCapture?: boolean;
  excludedFolders?: string;
}

interface CaptureFormValues {
  vault: string;
  folder: string;
  subFolder: string;
  fileName: string;
  content: string;
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
    const title = opts.linkTitle || opts.linkUrl;
    parts.push(`[${title}](${opts.linkUrl})`);
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
  const [includeHighlight, setIncludeHighlight] = useState<boolean>(true);
  const [includeSummary, setIncludeSummary] = useState<boolean>(false);
  const [pageContent, setPageContent] = useState<string>("");
  const [pageContentMessage, setPageContentMessage] = useState<string>("Include page content");
  const [summary, setSummary] = useState<string>("");
  const [selectedResource, setSelectedResource] = useState<string>("");
  const [includePageContents, setIncludePageContents] = useState<boolean>(false);
  const [resourceInfo, setResourceInfo] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(true);

  // Load persisted defaults once
  useEffect(() => {
    (async () => {
      const [savedVault, savedFolder, savedSub, savedPath] = await Promise.all([
        LocalStorage.getItem("vault"),
        LocalStorage.getItem("folder"),
        LocalStorage.getItem("subFolder"),
        LocalStorage.getItem("path"),
      ]);

      if (savedVault) {
        // May be vault name (legacy) or path (current)
        setDefaultVault(String(savedVault));
        setSelectedVaultName(String(savedVault));
      }

      if (savedFolder) {
        setFolder(String(savedFolder));
      } else if (savedPath) {
        // migrate legacy Storage Path key
        const parts = String(savedPath).split("/").filter(Boolean);
        if (parts[0]) setFolder(parts[0]);
        if (parts[1]) setSubFolder(parts[1]);
      }

      if (savedSub) {
        setSubFolder(String(savedSub));
      }

      setDefaultsLoaded(true);
    })().catch(() => setDefaultsLoaded(true));
  }, []);

  const activeVault: Vault | undefined = useMemo(() => {
    if (!allVaults.length) return undefined;
    const key = selectedVaultName || defaultVault || allVaults[0].path;
    return resolveVaultByName(allVaults, key) || allVaults[0];
  }, [allVaults, selectedVaultName, defaultVault]);

  // Root folders when vault changes
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
        // saved folder missing in this vault — fall back
        setFolder(withInbox.includes("inbox") ? "inbox" : withInbox[0] || "(vault root)");
      }
    } catch (e) {
      console.error(e);
      setFolders(["inbox"]);
    }
  }, [activeVault?.path, extraExcluded]);

  // Subfolders when folder changes
  useEffect(() => {
    if (!activeVault || !folder || folder === "(vault root)") {
      setSubFolders([]);
      if (subFolder) setSubFolder("");
      return;
    }
    try {
      const subs = listVaultFolders(activeVault.path, folder, extraExcluded);
      setSubFolders(subs);
      if (subFolder && !subs.includes(subFolder)) {
        setSubFolder("");
      }
    } catch {
      setSubFolders([]);
    }
  }, [activeVault?.path, folder, extraExcluded]);

  // Capture browser + selection context once on mount
  useEffect(() => {
    let cancelled = false;

    const loadPageContent = async (url: string) => {
      try {
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          if (!cancelled) setPageContentMessage("Include video transcript");
          const captions = await YoutubeTranscript.fetchTranscript(url);
          if (!cancelled) setPageContent(captions.map((c) => c.text).join("\n"));
        } else {
          if (!cancelled) setPageContentMessage("Include page content");
          const markdown = await urlToMarkdown(url);
          if (!cancelled) setPageContent(markdown);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          showToast({
            title: "Failed to fetch page content",
            style: Toast.Style.Failure,
          });
        }
      }
    };

    const setText = async () => {
      setIsLoadingContext(true);
      try {
        // Prefer Raycast API (more reliable than AppleScript process list)
        let activeApp = "";
        try {
          const front = await getFrontmostApplication();
          activeApp = front.name;
        } catch (error) {
          console.log(error);
          activeApp = "";
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
            const line = data.trim().split("\n")[0] || "";
            return line.slice(0, 80);
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

  // AI summary when toggled on
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
    if (includeSummary && pageContent) {
      void generateSummary();
    }
    return () => {
      cancelled = true;
    };
  }, [includeSummary, pageContent, canAccessAI]);

  // One-shot context toasts
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

      const noteTitle = (values.fileName || title || resourceInfo || "Untitled capture").trim();
      const folderPart = values.folder === "(vault root)" ? "" : values.folder || "";
      const subPart = values.subFolder && values.subFolder !== "(none)" ? values.subFolder : "";
      const relativeFolder = path.join(folderPart, subPart);

      // Prefer live checkbox state over stale form values for conditional fields
      const body = buildBody({
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

      if (!body.trim() && !noteTitle) {
        showToast({ style: Toast.Style.Failure, title: "Nothing to capture" });
        return;
      }

      // Don't capture while summary still generating
      if (includeSummary && !summary && pageContent && canAccessAI) {
        showToast({
          style: Toast.Style.Failure,
          title: "Summary still generating",
          message: "Wait for AI summary or uncheck Include AI Summary",
        });
        return;
      }

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
              if (!titleTouched) setTitle("");
              showToast({ style: Toast.Style.Success, title: "Capture Cleared" });
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown
        id="vault"
        title="Vault"
        value={selectedVaultName || vaultDefault}
        onChange={(v) => {
          setSelectedVaultName(v);
        }}
      >
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
          label="Include fetched page content / transcript"
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
        text="Saves via filesystem (no Advanced URI required). Optional open uses core Obsidian URI."
      />
    </Form>
  );
}
