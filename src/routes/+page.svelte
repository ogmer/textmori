<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import { confirm } from "@tauri-apps/plugin-dialog";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import { DEFAULT_FONT_SIZE, workspace } from "$lib/workspace.svelte";

  let host: HTMLDivElement;

  const status = $derived(workspace.status);

  $effect(() => {
    const tab = workspace.active;
    const title = tab
      ? `${tab.dirty ? "● " : ""}${tab.name} — textmori`
      : "textmori";
    getCurrentWindow().setTitle(title);
  });

  function handleKeydown(event: KeyboardEvent) {
    if (!event.ctrlKey && !event.metaKey) return;
    switch (event.key.toLowerCase()) {
      case "n":
        event.preventDefault();
        workspace.newTab();
        break;
      case "o":
        event.preventDefault();
        workspace.open();
        break;
      case "s":
        event.preventDefault();
        if (event.shiftKey) workspace.saveAs();
        else workspace.save();
        break;
      case "w":
        event.preventDefault();
        if (workspace.activeId) workspace.closeTab(workspace.activeId);
        break;
      case "tab":
        event.preventDefault();
        workspace.selectRelative(event.shiftKey ? -1 : 1);
        break;
      case "=":
      case "+":
        event.preventDefault();
        workspace.setFontSize(workspace.fontSize + 1);
        break;
      case "-":
        event.preventDefault();
        workspace.setFontSize(workspace.fontSize - 1);
        break;
      case "0":
        event.preventDefault();
        workspace.setFontSize(DEFAULT_FONT_SIZE);
        break;
    }
  }

  onMount(() => {
    const detachEditor = workspace.attach(host);
    const appWindow = getCurrentWindow();

    // OS がファイルドロップを横取りするため、Tauri のイベントで受け取る
    const dragDrop = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") workspace.openPaths(event.payload.paths);
    });

    const closeRequested = appWindow.onCloseRequested(async (event) => {
      if (!workspace.hasUnsavedChanges) return;
      event.preventDefault();
      const quit = await confirm(
        "保存されていない変更があります。終了してよろしいですか?",
        { title: "textmori", kind: "warning" },
      );
      if (quit) await appWindow.destroy();
    });

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      dragDrop.then((unlisten) => unlisten());
      closeRequested.then((unlisten) => unlisten());
      detachEditor();
    };
  });
</script>

<div class="app" style="--editor-font-size: {workspace.fontSize}px">
  <header class="toolbar">
    <button type="button" onclick={() => workspace.newTab()}>新規</button>
    <button type="button" onclick={() => workspace.open()}>開く</button>
    <button type="button" onclick={() => workspace.save()}>保存</button>
    <button type="button" onclick={() => workspace.saveAs()}>名前を付けて保存</button>
  </header>

  <TabBar
    tabs={workspace.tabs}
    activeId={workspace.activeId}
    onselect={(id) => workspace.select(id)}
    onclose={(id) => workspace.closeTab(id)}
  />

  <div class="editor" bind:this={host}></div>

  <StatusBar
    line={status.line}
    column={status.column}
    selected={status.selected}
    lines={status.lines}
    chars={status.chars}
    eol={workspace.active?.eol ?? "LF"}
    wrap={workspace.wrap}
    ontogglewrap={() => {
      workspace.toggleWrap();
      workspace.focus();
    }}
  />
</div>

<style>
  :global(:root) {
    --bg: #ffffff;
    --chrome-bg: #f3f3f3;
    --tabbar-bg: #ececec;
    --tab-bg: #e2e2e2;
    --fg: #1f1f1f;
    --muted: #6a6a6a;
    --border: #d4d4d4;
    --hover: rgba(0, 0, 0, 0.07);
    --accent: #3b74d8;
    --active-line: rgba(0, 0, 0, 0.04);
    --selection: #b9d4f6;
    --match: rgba(59, 116, 216, 0.18);
    --match-active: rgba(59, 116, 216, 0.38);
    --font-ui: "Segoe UI", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    --font-mono: "Cascadia Mono", Consolas, "Noto Sans Mono", "Hiragino Sans",
      monospace;
    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #1e1e1e;
      --chrome-bg: #252526;
      --tabbar-bg: #202021;
      --tab-bg: #2a2a2b;
      --fg: #e6e6e6;
      --muted: #9d9d9d;
      --border: #3a3a3a;
      --hover: rgba(255, 255, 255, 0.09);
      --accent: #5b9bff;
      --active-line: rgba(255, 255, 255, 0.05);
      --selection: #2c4f7c;
      --match: rgba(91, 155, 255, 0.2);
      --match-active: rgba(91, 155, 255, 0.4);
    }
  }

  :global(html),
  :global(body) {
    height: 100%;
    margin: 0;
  }

  :global(body) {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-ui);
    overflow: hidden;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .toolbar {
    display: flex;
    gap: 0.2em;
    padding: 0.35em 0.5em;
    background: var(--chrome-bg);
    border-bottom: 1px solid var(--border);
  }

  .toolbar button {
    padding: 0.35em 0.8em;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--fg);
    font: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .toolbar button:hover {
    background: var(--hover);
  }

  .toolbar button:active {
    background: var(--selection);
  }

  .editor {
    flex: 1;
    min-height: 0;
  }

  /* CodeMirror はテーマ拡張を持たせず、CSS 変数だけで両テーマに追従させる */
  .editor :global(.cm-editor) {
    height: 100%;
    background: var(--bg);
    color: var(--fg);
    font-size: var(--editor-font-size);
  }

  .editor :global(.cm-editor.cm-focused) {
    outline: none;
  }

  .editor :global(.cm-scroller) {
    font-family: var(--font-mono);
    line-height: 1.6;
  }

  .editor :global(.cm-gutters) {
    background: var(--bg);
    color: var(--muted);
    border-right: 1px solid var(--border);
  }

  .editor :global(.cm-activeLine),
  .editor :global(.cm-activeLineGutter) {
    background: var(--active-line);
  }

  .editor :global(.cm-activeLineGutter) {
    color: var(--fg);
  }

  .editor :global(.cm-cursor),
  .editor :global(.cm-dropCursor) {
    border-left-color: var(--fg);
  }

  .editor :global(.cm-selectionBackground),
  .editor :global(.cm-focused .cm-selectionBackground),
  .editor :global(.cm-content ::selection) {
    background: var(--selection);
  }

  .editor :global(.cm-selectionMatch),
  .editor :global(.cm-searchMatch) {
    background: var(--match);
  }

  .editor :global(.cm-searchMatch-selected) {
    background: var(--match-active);
  }

  .editor :global(.cm-panels) {
    background: var(--chrome-bg);
    color: var(--fg);
    border-bottom: 1px solid var(--border);
  }

  .editor :global(.cm-panel input),
  .editor :global(.cm-panel button) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-family: var(--font-ui);
  }
</style>
