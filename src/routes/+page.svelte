<script lang="ts">
  import { onMount } from "svelte";
  import { redo, selectAll, undo } from "@codemirror/commands";
  import { openSearchPanel } from "@codemirror/search";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import MenuBar, { type MenuDefinition } from "$lib/components/MenuBar.svelte";
  import SettingsPanel from "$lib/components/SettingsPanel.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import TitleBar from "$lib/components/TitleBar.svelte";
  import { config } from "$lib/config.svelte";
  import { checkForUpdates } from "$lib/updater";
  import { BASE_FONT_SIZE, DEFAULT_ZOOM, workspace } from "$lib/workspace.svelte";

  let host: HTMLDivElement;
  let settingsOpen = $state(false);

  const status = $derived(workspace.status);
  // macOS はメニューが画面上部のネイティブメニューに出るため HTML 側では描画しない
  const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

  const FALLBACK_MONO =
    '"Cascadia Mono", Consolas, "Noto Sans Mono", "Hiragino Sans", monospace';
  const editorStyle = $derived(
    `--editor-font-size: ${(BASE_FONT_SIZE * workspace.zoom) / 100}px;` +
      (config.fontFamily ? ` --font-mono: "${config.fontFamily}", ${FALLBACK_MONO};` : ""),
  );

  const appWindow = getCurrentWindow();

  $effect(() => {
    const tab = workspace.active;
    const title = tab
      ? `${tab.dirty ? "● " : ""}${tab.name} — textmori`
      : "textmori";
    appWindow.setTitle(title);
  });

  const menus: MenuDefinition[] = $derived([
    {
      label: "ファイル",
      items: [
        { label: "新規タブ", accelerator: "Ctrl+N", action: () => workspace.newTab() },
        { label: "開く...", accelerator: "Ctrl+O", action: () => workspace.open() },
        "separator",
        { label: "保存", accelerator: "Ctrl+S", action: () => workspace.save() },
        {
          label: "名前を付けて保存...",
          accelerator: "Ctrl+Shift+S",
          action: () => workspace.saveAs(),
        },
        "separator",
        {
          label: "タブを閉じる",
          accelerator: "Ctrl+W",
          action: () => workspace.activeId && workspace.closeTab(workspace.activeId),
        },
        "separator",
        { label: "設定...", action: () => (settingsOpen = true) },
        { label: "アップデートを確認...", action: () => checkForUpdates(false) },
        "separator",
        { label: "終了", accelerator: "Alt+F4", action: () => appWindow.close() },
      ],
    },
    {
      label: "編集",
      items: [
        { label: "元に戻す", accelerator: "Ctrl+Z", action: () => workspace.runCommand(undo) },
        { label: "やり直し", accelerator: "Ctrl+Y", action: () => workspace.runCommand(redo) },
        "separator",
        { label: "切り取り", accelerator: "Ctrl+X", action: () => workspace.cut() },
        { label: "コピー", accelerator: "Ctrl+C", action: () => workspace.copy() },
        { label: "貼り付け", accelerator: "Ctrl+V", action: () => workspace.paste() },
        "separator",
        {
          label: "すべて選択",
          accelerator: "Ctrl+A",
          action: () => workspace.runCommand(selectAll),
        },
        "separator",
        {
          label: "検索",
          accelerator: "Ctrl+F",
          action: () => workspace.runCommand(openSearchPanel),
        },
        {
          label: "置換",
          accelerator: "Ctrl+H",
          action: () => workspace.runCommand(openSearchPanel),
        },
      ],
    },
    {
      label: "表示",
      items: [
        { label: "拡大", accelerator: "Ctrl++", action: () => workspace.zoomIn() },
        { label: "縮小", accelerator: "Ctrl+-", action: () => workspace.zoomOut() },
        {
          label: "既定のサイズに戻す",
          accelerator: "Ctrl+0",
          action: () => workspace.setZoom(DEFAULT_ZOOM),
        },
        "separator",
        {
          label: "行の折り返し",
          checked: workspace.wrap,
          action: () => workspace.toggleWrap(),
        },
      ],
    },
  ]);

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
        workspace.zoomIn();
        break;
      case "-":
        event.preventDefault();
        workspace.zoomOut();
        break;
      case "0":
        event.preventDefault();
        workspace.setZoom(DEFAULT_ZOOM);
        break;
    }
  }

  // macOS のネイティブメニューから届くアクション
  function handleMenuAction(action: string) {
    switch (action) {
      case "new":
        workspace.newTab();
        break;
      case "open":
        workspace.open();
        break;
      case "save":
        workspace.save();
        break;
      case "save_as":
        workspace.saveAs();
        break;
      case "close_tab":
        if (workspace.activeId) workspace.closeTab(workspace.activeId);
        break;
      case "zoom_in":
        workspace.zoomIn();
        break;
      case "zoom_out":
        workspace.zoomOut();
        break;
      case "zoom_reset":
        workspace.setZoom(DEFAULT_ZOOM);
        break;
      case "toggle_wrap":
        workspace.toggleWrap();
        break;
      case "settings":
        settingsOpen = true;
        break;
    }
  }

  onMount(() => {
    const detachEditor = workspace.attach(host);

    // 設定ファイルの読み込み・監視は起動直後の描画を邪魔しないよう後回しにする
    config.load();

    // アップデート確認はネットワーク I/O を伴うため、起動直後の描画や
    // タイピング開始を妨げないよう少し遅らせてから行う(Ghostty の
    // 「起動を軽く保つ」考え方に倣う)。
    const updateCheckTimer = setTimeout(() => {
      if (config.autoUpdate) checkForUpdates(true);
    }, 1500);

    const menuAction = listen<string>("menu-action", (event) =>
      handleMenuAction(event.payload),
    );

    // OS がファイルドロップを横取りするため、Tauri のイベントで受け取る
    const dragDrop = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") workspace.openPaths(event.payload.paths);
    });

    // 未保存の内容も含めて常にセッションへ保存しているため、終了時に
    // 確認ダイアログは出さない(次回起動時に自動で復元される)。

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      clearTimeout(updateCheckTimer);
      menuAction.then((unlisten) => unlisten());
      dragDrop.then((unlisten) => unlisten());
      detachEditor();
    };
  });
</script>

<div class="app" style={editorStyle}>
  {#if settingsOpen}
    <SettingsPanel onclose={() => (settingsOpen = false)} />
  {/if}

  {#if isMac}
    <TabBar
      tabs={workspace.tabs}
      activeId={workspace.activeId}
      onselect={(id) => workspace.select(id)}
      onclose={(id) => workspace.closeTab(id)}
      onnew={() => workspace.newTab()}
    />
  {:else}
    <!-- Windows / Linux: メモ帳と同じく 1 行目=アイコン+タブ+ウィンドウ操作、2 行目=メニュー -->
    <TitleBar
      tabs={workspace.tabs}
      activeId={workspace.activeId}
      onselect={(id) => workspace.select(id)}
      onclose={(id) => workspace.closeTab(id)}
      onnew={() => workspace.newTab()}
    />
    <MenuBar {menus} />
  {/if}

  <div class="editor" bind:this={host}></div>

  <StatusBar
    line={status.line}
    column={status.column}
    selected={status.selected}
    lines={status.lines}
    chars={status.chars}
    eol={workspace.active?.eol ?? "LF"}
    encoding={workspace.active?.encoding ?? "UTF-8"}
    onsetencoding={(value) => {
      workspace.setEncoding(value);
      workspace.focus();
    }}
    onseteol={(value) => {
      workspace.setEol(value);
      workspace.focus();
    }}
    wrap={workspace.wrap}
    ontogglewrap={() => {
      workspace.toggleWrap();
      workspace.focus();
    }}
    zoom={workspace.zoom}
    onzoomset={(percent) => {
      workspace.setZoom(percent);
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
    --active-line: rgba(0, 0, 0, 0.055);
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
      --active-line: rgba(255, 255, 255, 0.08);
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

  /* VS Code のように、現在行の行番号だけ太字・明色にして目立たせる */
  .editor :global(.cm-activeLineGutter) {
    color: var(--fg);
    font-weight: 600;
  }

  /* VS Code のように対応する括弧を枠線で強調する */
  .editor :global(.cm-matchingBracket),
  .editor :global(.cm-nonmatchingBracket) {
    background: transparent;
    outline: 1px solid var(--accent);
    border-radius: 2px;
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
