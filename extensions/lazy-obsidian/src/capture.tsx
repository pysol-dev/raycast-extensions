import {
  Action,
  ActionPanel,
  AI,
  closeMainWindow,
  Color,
  environment,
  Form,
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
import { GET_ACTIVE_APP_SCRIPT, GET_LINK_FROM_BROWSER_SCRIPT, SUPPORTED_BROWSERS } from "./scripts/browser";
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
  link?: string[];
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
  const extraExcluded = (prefs.excludedFolders || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [defaultVault, setDefaultVault] = useState<string | undefined>(undefined);
  const [defaultFolder, setDefaultFolder] = useState<string>("inbox");
  const [defaultSubFolder, setDefaultSubFolder] = useState<string>("");

  const [selectedVaultName, setSelectedVaultName] = useState<string>("");
  const [folder, setFolder] = useState<string>("");
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    LocalStorage.getItem("vault").then((savedVault) => {
      if (savedVault) {
        setDefaultVault(String(savedVault));
        setSelectedVaultName(String(savedVault));
      }
    });
    LocalStorage.getItem("folder").then((saved) => {
      if (saved) {
        setDefaultFolder(String(saved));
        setFolder(String(saved));
      } else {
        setFolder("inbox");
      }
    });
    LocalStorage.getItem("subFolder").then((saved) => {
      if (saved) {
        setDefaultSubFolder(String(saved));
        setSubFolder(String(saved));
      }
    });
    // migrate old storage path key if present
    LocalStorage.getItem("path").then((savedPath) => {
      if (savedPath && !folder) {
        const p = String(savedPath);
        const parts = p.split("/").filter(Boolean);
        if (parts[0]) {
          setFolder(parts[0]);
          setDefaultFolder(parts[0]);
        }
        if (parts[1]) {
          setSubFolder(parts[1]);
          setDefaultSubFolder(parts[1]);
        }
      }
    });
  }, []);

  const activeVault: Vault | undefined = useMemo(() => {
    if (!allVaults.length) return undefined;
    const name = selectedVaultName || defaultVault || allVaults[0].name;
    return resolveVaultByName(allVaults, name) || allVaults[0];
  }, [allVaults, selectedVaultName, defaultVault]);

  useEffect(() => {
    if (!activeVault) {
      setFolders([]);
      return;
    }
    try {
      const rootFolders = listVaultFolders(activeVault.path, "", extraExcluded);
      // Always offer vault root + inbox convenience
      const withInbox = rootFolders.includes("inbox") ? rootFolders : ["inbox", ...rootFolders];
      setFolders(withInbox);
      if (!folder || (folder !== "" && !withInbox.includes(folder) && folder !== "(vault root)")) {
        // keep user folder if set; otherwise default
        if (!folder) setFolder(defaultFolder || "inbox");
      }
    } catch (e) {
      console.error(e);
      setFolders(["inbox"]);
    }
  }, [activeVault?.path]);

  useEffect(() => {
    if (!activeVault || !folder || folder === "(vault root)") {
      setSubFolders([]);
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
  }, [activeVault?.path, folder]);

  useEffect(() => {
    const setText = async () => {
      try {
        const activeApp = await runAppleScript(GET_ACTIVE_APP_SCRIPT);
        if (SUPPORTED_BROWSERS.includes(activeApp)) {
          const linkInfoStr = await runAppleScript(GET_LINK_FROM_BROWSER_SCRIPT(activeApp));
          const [url, title] = linkInfoStr.split("\t");
          if (url && title) {
            setSelectedResource(url);
            setResourceInfo(title);
            void loadPageContent(url);
          }
        }
      } catch (error) {
        console.log(error);
      }

      try {
        const data = await getSelectedText();
        if (data) setSelectedText(data);
      } catch (error) {
        console.log(error);
      }
    };

    const loadPageContent = async (url: string) => {
      try {
        if (url.includes("youtube.com") || url.includes("youtu.be")) {
          setPageContentMessage("Include video transcript");
          const captions = await YoutubeTranscript.fetchTranscript(url);
          setPageContent(captions.map((c) => c.text).join("\n"));
        } else {
          setPageContentMessage("Include page content");
          const markdown = await urlToMarkdown(url);
          setPageContent(markdown);
        }
      } catch (error) {
        console.error(error);
        showToast({
          title: "Failed to fetch page content",
          style: Toast.Style.Failure,
        });
      }
    };

    void setText();
  }, []);

  useEffect(() => {
    const generateSummary = async () => {
      if (!canAccessAI) return;
      showToast({ style: Toast.Style.Animated, title: "Generating Summary" });
      try {
        const result = await AI.ask(SUMMARY_PROMPT + pageContent);
        setSummary(result);
        showToast({ style: Toast.Style.Success, title: "Summary captured" });
      } catch {
        showToast({ style: Toast.Style.Failure, title: "Failed to generate summary" });
        setIncludeSummary(false);
      }
    };
    if (includeSummary && pageContent) {
      void generateSummary();
    }
  }, [includeSummary]);

  useEffect(() => {
    if (selectedText && selectedResource) {
      showToast({ style: Toast.Style.Success, title: "Highlighted text, Source captured" });
    } else if (selectedText) {
      showToast({ style: Toast.Style.Success, title: "Highlighted text captured" });
    } else if (selectedResource) {
      showToast({ style: Toast.Style.Success, title: "Link captured" });
    }
  }, [selectedText, selectedResource]);

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

      const title = (values.fileName || resourceInfo || "Untitled capture").trim();
      const folderPart = values.folder === "(vault root)" ? "" : values.folder || "";
      const subPart = values.subFolder && values.subFolder !== "(none)" ? values.subFolder : "";
      const relativeFolder = path.join(folderPart, subPart);

      const body = buildBody({
        content: values.content,
        linkTitle: resourceInfo,
        linkUrl: selectedResource || values.link?.[0],
        highlight: selectedText,
        includeHighlight: includeHighlight && Boolean(selectedText),
        summaryText: summary,
        includeSummary: includeSummary && Boolean(summary),
        pageContent,
        includePageContents: includePageContents && Boolean(pageContent),
      });

      if (!body.trim() && !title) {
        showToast({ style: Toast.Style.Failure, title: "Nothing to capture" });
        return;
      }

      await LocalStorage.setItem("vault", vault.name);
      await LocalStorage.setItem("folder", folderPart || "inbox");
      await LocalStorage.setItem("subFolder", subPart);

      const openAfter = prefs.openOnCapture !== false;
      const result = await writeNoteToVault({
        vault,
        folder: relativeFolder,
        title,
        content: body || title,
        mode: "new",
        openAfter,
      });

      await showHUD(`Captured → ${result.relativePath}`, { clearRootSearch: true });
      popToRoot();
      closeMainWindow();
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

  if (!ready) {
    return <List isLoading={true} />;
  }
  if (allVaults.length === 0) {
    return <NoVaultFoundMessage />;
  }

  const vaultDefault = defaultVault && allVaults.some((v) => v.name === defaultVault) ? defaultVault : allVaults[0].name;

  return (
    <Form
      isLoading={isSubmitting}
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
          <Form.Dropdown.Item key={vault.key} value={vault.name} title={vault.name} icon="🧳" />
        ))}
      </Form.Dropdown>

      <Form.Dropdown id="folder" title="Folder" value={folder || defaultFolder || "inbox"} onChange={setFolder}>
        <Form.Dropdown.Item value="(vault root)" title="(vault root)" icon={Icon.HardDrive} />
        {folders.map((f) => (
          <Form.Dropdown.Item key={f} value={f} title={f} icon={Icon.Folder} />
        ))}
      </Form.Dropdown>

      <Form.Dropdown
        id="subFolder"
        title="Sub-Folders"
        value={subFolder || "(none)"}
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
        defaultValue={resourceInfo || ""}
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
          label=""
          value={includePageContents}
          onChange={setIncludePageContents}
        />
      ) : null}

      {canAccessAI && pageContent ? (
        <Form.Checkbox
          id="summary"
          title="Include AI Summary"
          label=""
          value={includeSummary}
          onChange={setIncludeSummary}
        />
      ) : null}

      <Form.TextArea title="Note" id="content" placeholder="Notes about the resource…" />

      {selectedResource && resourceInfo ? (
        <Form.TagPicker id="link" title="Link" defaultValue={[selectedResource]}>
          <Form.TagPicker.Item
            value={selectedResource}
            title={resourceInfo}
            icon={{ source: Icon.Link, tintColor: Color.Red }}
          />
        </Form.TagPicker>
      ) : null}

      {selectedText && includeHighlight ? <Form.Description title="Highlight" text={selectedText} /> : null}

      <Form.Description
        title="Write path"
        text="Saves via filesystem (no Advanced URI required). Optional open uses core Obsidian URI."
      />
    </Form>
  );
}
