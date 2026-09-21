<script lang="ts">
  import { onMount } from "svelte";
  import { redo, selectAll, undo } from "@codemirror/commands";
  import { openSearchPanel } from "@codemirror/search";
  import { listen } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { getCurrentWebview } from "@tauri-apps/api/webview";
  import MenuBar, { type MenuDefinition } from "$lib/components/MenuBar.svelte";
  import SaveConfirmDialog from "$lib/components/SaveConfirmDialog.svelte";
  import SettingsPanel from "$lib/components/SettingsPanel.svelte";
  import StatusBar from "$lib/components/StatusBar.svelte";
  import TabBar from "$lib/components/TabBar.svelte";
  import TitleBar from "$lib/components/TitleBar.svelte";
  import { config } from "$lib/config.svelte";
  import { openReplacePanel } from "$lib/search-panel";
  import { BASE_FONT_SIZE, DEFAULT_ZOOM, workspace } from "$lib/workspace.svelte";

  let host: HTMLDivElement;
  let splitHost: HTMLDivElement | undefined = $state();
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

  // 文字列を $derived にしておけば、タイトルが変わった時だけ effect が走る。
  // (effect 内で直接組み立てると、カーソル移動や入力のたびに setTitle の IPC が飛ぶ)
  const windowTitle = $derived.by(() => {
    const tab = workspace.active;
    return tab ? `${tab.dirty ? "● " : ""}${tab.name}` : "textmori";
  });

  $effect(() => {
    appWindow.setTitle(windowTitle);
  });

  // 配色: "system" のときは data-theme を外し、OS の設定(prefers-color-scheme)
  // に追従する CSS へフォールバックする。"light"/"dark" は明示的に上書きする。
  $effect(() => {
    if (config.theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = config.theme;
    }
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
        { label: "設定...", accelerator: "F1", action: () => (settingsOpen = true) },
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
          action: () => workspace.runCommand(openReplacePanel),
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
          accelerator: "Alt+Z",
          checked: workspace.wrap,
          action: () => workspace.toggleWrap(),
        },
        "separator",
        {
          label: "右に分割",
          accelerator: "Ctrl+\\",
          checked: workspace.splitOpen && workspace.splitDirection === "vertical",
          action: () => workspace.toggleSplit("vertical"),
        },
        {
          label: "下に分割",
          checked: workspace.splitOpen && workspace.splitDirection === "horizontal",
          action: () => workspace.toggleSplit("horizontal"),
        },
        "separator",
        {
          label: "配色: システムに従う",
          checked: config.theme === "system",
          action: () => config.setTheme("system"),
        },
        {
          label: "配色: ライト",
          checked: config.theme === "light",
          action: () => config.setTheme("light"),
        },
        {
          label: "配色: ダーク",
          checked: config.theme === "dark",
          action: () => config.setTheme("dark"),
        },
      ],
    },
  ]);

  function handleKeydown(event: KeyboardEvent) {
    // 折り返し切り替え(Alt+Z)と設定(F1)は Ctrl 系ではないため先に処理する
    if (!event.ctrlKey && !event.metaKey) {
      if (event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        workspace.toggleWrap();
      } else if (event.key === "F1") {
        event.preventDefault();
        settingsOpen = true;
      }
      return;
    }

    // input/textarea (設定パネルなど) にフォーカスがある間は、その要素自身の
    // 標準的なコピー/元に戻す等の挙動を優先し、エディタ向けの処理を横取りしない
    const target = event.target as HTMLElement | null;
    const isFormField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

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
      case "x":
        if (isFormField) return;
        event.preventDefault();
        workspace.cut();
        break;
      case "c":
        if (isFormField) return;
        event.preventDefault();
        workspace.copy();
        break;
      case "v":
        if (isFormField) return;
        event.preventDefault();
        workspace.paste();
        break;
      case "z":
        // CodeMirror の historyKeymap が既に処理済みなら二重実行しない
        if (isFormField || event.defaultPrevented) return;
        event.preventDefault();
        workspace.runCommand(undo);
        break;
      case "y":
        if (isFormField || event.defaultPrevented) return;
        event.preventDefault();
        workspace.runCommand(redo);
        break;
      case "a":
        if (isFormField || event.defaultPrevented) return;
        event.preventDefault();
        workspace.runCommand(selectAll);
        break;
      case "f":
        if (isFormField || event.defaultPrevented) return;
        event.preventDefault();
        workspace.runCommand(openSearchPanel);
        break;
      case "h":
        // 入力欄(検索パネル自身を含む)の中でも置換欄を開けるよう、isFormField では弾かない
        if (event.defaultPrevented) return;
        event.preventDefault();
        workspace.runCommand(openReplacePanel);
        break;
      case "\\":
        event.preventDefault();
        workspace.toggleSplit("vertical");
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
      case "toggle_split":
        workspace.toggleSplit("vertical");
        break;
      case "theme_system":
        config.setTheme("system");
        break;
      case "theme_light":
        config.setTheme("light");
        break;
      case "theme_dark":
        config.setTheme("dark");
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
      menuAction.then((unlisten) => unlisten());
      dragDrop.then((unlisten) => unlisten());
      detachEditor();
    };
  });

  // 分割ビューの開閉に合わせて、2つ目の CodeMirror インスタンスを都度マウント/破棄する
  $effect(() => {
    if (!workspace.splitOpen || !splitHost) return;
    const detachSplit = workspace.attachSplit(splitHost);
    return detachSplit;
  });
</script>

<div class="app" style={editorStyle}>
  {#if settingsOpen}
    <SettingsPanel onclose={() => (settingsOpen = false)} />
  {/if}

  {#if workspace.pendingClose}
    <SaveConfirmDialog
      name={workspace.pendingClose.name}
      onchoice={(choice) => workspace.resolvePendingClose(choice)}
    />
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

  <div class="editor-area" class:horizontal={workspace.splitDirection === "horizontal"}>
    <div class="editor" bind:this={host}></div>
    {#if workspace.splitOpen}
      <div class="editor-divider" aria-hidden="true"></div>
      <div class="editor" bind:this={splitHost}></div>
    {/if}
  </div>

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
    --active-line-border: rgba(0, 0, 0, 0.12);
    --selection: #b9d4f6;
    --match: rgba(59, 116, 216, 0.18);
    --match-active: rgba(59, 116, 216, 0.38);
    --scrollbar-thumb: rgba(121, 121, 121, 0.35);
    --scrollbar-thumb-hover: rgba(100, 100, 100, 0.6);
    --shadow-popup: 0 6px 20px rgba(0, 0, 0, 0.14), 0 1px 3px rgba(0, 0, 0, 0.12);
    /* "Meiryo UI" / "Yu Gothic UI" は Segoe UI と視覚的な大きさが揃うよう
       設計された Windows 標準の日本語 UI フォントのため、Noto Sans JP 等より
       先に指定し、日本語だけ文字が大きく見えてしまうのを防ぐ。
       Yu Gothic UI は線が太めに見えるため、より細い Meiryo UI を先に使う。 */
    --font-ui: "Segoe UI", "Meiryo UI", "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP",
      system-ui, sans-serif;
    --font-mono: "Cascadia Mono", Consolas, "Noto Sans Mono", "Hiragino Sans",
      monospace;
    color-scheme: light dark;
    --radius: 8px;
    --radius-sm: 5px;
    --ease: cubic-bezier(0.2, 0, 0, 1);
  }

  /* 配色が "system" (data-theme 未指定)のときだけ OS の設定に追従する。
     "light" が明示された場合はこのブロックを無効化する。 */
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme="light"])) {
      --bg: #1a1b26;
      --chrome-bg: #1f2335;
      --tabbar-bg: #15161e;
      --tab-bg: #24283b;
      --fg: #c0caf5;
      --muted: #7982a9;
      --border: #2a2e45;
      --hover: rgba(122, 162, 247, 0.12);
      --accent: #7aa2f7;
      --active-line-border: rgba(122, 162, 247, 0.22);
      --selection: rgba(51, 70, 124, 0.85);
      --match: rgba(122, 162, 247, 0.22);
      --match-active: rgba(122, 162, 247, 0.42);
      --scrollbar-thumb: rgba(150, 150, 150, 0.35);
      --scrollbar-thumb-hover: rgba(180, 180, 180, 0.55);
      --shadow-popup: 0 8px 24px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
    }
  }

  /* 配色を "dark" に明示した場合は OS の設定に関わらず常にダークにする */
  :global(:root[data-theme="dark"]) {
    --bg: #1a1b26;
    --chrome-bg: #1f2335;
    --tabbar-bg: #15161e;
    --tab-bg: #24283b;
    --fg: #c0caf5;
    --muted: #7982a9;
    --border: #2a2e45;
    --hover: rgba(122, 162, 247, 0.12);
    --accent: #7aa2f7;
    --active-line-border: rgba(122, 162, 247, 0.22);
    --selection: rgba(51, 70, 124, 0.85);
    --match: rgba(122, 162, 247, 0.22);
    --match-active: rgba(122, 162, 247, 0.42);
    --scrollbar-thumb: rgba(255, 255, 255, 0.2);
    --scrollbar-thumb-hover: rgba(255, 255, 255, 0.35);
    --shadow-popup: 0 8px 24px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.4);
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

  /* ── 触り心地の共通ルール(色やレイアウトは変えず、動きは 0.1 秒台の
        フェードだけに留める) ───────────────────────────────────── */

  /* ホバー/押下の変化をなめらかにする。ウィンドウ操作ボタンは OS 標準に
     合わせて即時のままにするため、個別に transition: none を指定している。 */
  :global(button) {
    transition:
      background-color 0.12s var(--ease),
      color 0.12s var(--ease),
      border-color 0.12s var(--ease),
      opacity 0.12s var(--ease);
  }

  /* キーボード操作時だけ見えるフォーカスリング(マウス操作では出ない)。
     エディタ本体(contenteditable)は独自のキャレットで示すため対象外。 */
  :global(button:focus-visible),
  :global(input:focus-visible),
  :global(summary:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  /* ポップアップ/ダイアログの出現。淡く現れるだけで、位置はほとんど動かさない */
  @keyframes -global-popup-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes -global-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* OS の「視覚効果を減らす」設定を尊重する */
  @media (prefers-reduced-motion: reduce) {
    :global(*),
    :global(*::before),
    :global(*::after) {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }

  /* スクロールバーはトラックを透明にし、つまみだけ半透明で重ねて表示する
     (オーバーレイ風)。Chromium(WebView2)向けの疑似要素なので Firefox/Safari
     では既定のスクロールバーにフォールバックする。 */
  :global(*) {
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }

  :global(*)::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  :global(*)::-webkit-scrollbar-track {
    background: transparent;
  }

  :global(*)::-webkit-scrollbar-corner {
    background: transparent;
  }

  :global(*)::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
    background-clip: padding-box;
    border: 1px solid transparent;
    border-radius: 8px;
  }

  :global(*)::-webkit-scrollbar-thumb:hover {
    background-color: var(--scrollbar-thumb-hover);
    background-clip: padding-box;
  }

  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .editor-area {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
  }

  /* 「右に分割」= 横並び(デフォルト)、「下に分割」= 縦並び */
  .editor-area.horizontal {
    flex-direction: column;
  }

  .editor-divider {
    flex: 0 0 auto;
    background: var(--border);
  }

  .editor-area:not(.horizontal) > .editor-divider {
    width: 1px;
  }

  .editor-area.horizontal > .editor-divider {
    height: 1px;
  }

  .editor {
    flex: 1;
    min-height: 0;
    min-width: 0;
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

  /* drawSelection() を使っていないためカーソルもブラウザネイティブの
     キャレットで表示される。既定色だとダークモードで見えにくいことがあるため
     テーマの文字色に合わせて明示的に指定する。 */
  .editor :global(.cm-content) {
    caret-color: var(--fg);
    padding: 6px 0 48px;
  }

  /* 文字が画面端に張り付かないよう、行の左右に余白を取る */
  .editor :global(.cm-line) {
    padding: 0 32px 0 24px;
  }

  /* VS Code のように、アクティブ行は塗りつぶしではなく上下の罫線で強調する */
  .editor :global(.cm-activeLine) {
    background: transparent;
    box-shadow:
      inset 0 1px 0 0 var(--active-line-border),
      inset 0 -1px 0 0 var(--active-line-border);
  }

  /* URL には常に下線を表示し、ホバーした時点でクリック可能なことが
     分かるようポインタカーソルにする(開くには Ctrl/Cmd+クリックが必要)。 */
  .editor :global(.cm-url-link) {
    text-decoration: underline;
    cursor: pointer;
  }

  .editor :global(.cm-dropCursor) {
    border-left-color: var(--fg);
  }

  /* drawSelection() を使っていないため、選択はブラウザネイティブの
     ::selection(文字の部分だけ色が付く)で表示する */
  .editor :global(.cm-content ::selection) {
    background: var(--selection);
  }

  .editor :global(.cm-searchMatch) {
    background: var(--match);
  }

  .editor :global(.cm-searchMatch-selected) {
    background: var(--match-active);
  }

  /* パネル(検索・置換 / 行へ移動)の共通の見た目 */
  .editor :global(.cm-panels) {
    background: var(--chrome-bg);
    color: var(--fg);
    border-bottom: 1px solid var(--border);
    font-family: var(--font-ui);
  }

  .editor :global(.cm-panel input),
  .editor :global(.cm-panel button) {
    background: var(--bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--font-ui);
    font-size: 0.8rem;
  }

  .editor :global(.cm-panel button) {
    cursor: pointer;
  }

  .editor :global(.cm-panel button:hover) {
    background: var(--hover);
  }

  .editor :global(.cm-panel button:active) {
    background: var(--border);
  }

  /* 検索・置換パネル(src/lib/search-panel.ts) */
  .editor :global(.tm-search) {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 24px;
    font-size: 0.8rem;
  }

  .editor :global(.tm-row) {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 46rem;
  }

  .editor :global(.tm-field) {
    position: relative;
    flex: 1;
    display: flex;
    min-width: 8rem;
  }

  .editor :global(.tm-input) {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 10px;
    box-sizing: border-box;
    outline: none;
    transition:
      border-color 0.12s var(--ease),
      box-shadow 0.12s var(--ease);
  }

  /* 件数の表示ぶんの余白 */
  .editor :global(.tm-find) {
    padding-right: 6.5rem;
  }

  .editor :global(.tm-input:focus) {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
  }

  .editor :global(.tm-input.tm-nomatch) {
    border-color: #e5484d;
  }

  .editor :global(.tm-input.tm-nomatch:focus) {
    box-shadow: 0 0 0 2px color-mix(in srgb, #e5484d 25%, transparent);
  }

  .editor :global(.tm-count) {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--muted);
    font-size: 0.74rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
  }

  .editor :global(.tm-find.tm-nomatch ~ .tm-count) {
    color: #e5484d;
  }

  .editor :global(.tm-btn),
  .editor :global(.tm-toggle),
  .editor :global(.tm-expand) {
    flex: 0 0 auto;
    height: 30px;
    min-width: 30px;
    padding: 0 8px;
    line-height: 1;
  }

  .editor :global(.tm-btn.tm-text) {
    padding: 0 14px;
    white-space: nowrap;
  }

  /* 展開ボタンと、置換欄の左側の余白は同じ幅にして入力欄の左端を揃える */
  .editor :global(.tm-expand),
  .editor :global(.tm-expand-spacer) {
    width: 22px;
    min-width: 22px;
    padding: 0;
  }

  .editor :global(.tm-expand-spacer) {
    flex: 0 0 auto;
  }

  .editor :global(.tm-search .tm-expand) {
    border-color: transparent;
    background: none;
    color: var(--muted);
  }

  .editor :global(.tm-search .tm-expand:hover) {
    color: var(--fg);
    background: var(--hover);
  }

  /* オプションのトグル: 有効な時だけアクセント色で示す */
  .editor :global(.tm-toggle[aria-pressed='true']) {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    border-color: var(--accent);
  }

  .editor :global(.tm-search .tm-close) {
    border-color: transparent;
    background: none;
    color: var(--muted);
    font-size: 1.1rem;
  }

  .editor :global(.tm-search .tm-close:hover) {
    color: var(--fg);
    background: var(--hover);
  }

  .editor :global(.tm-replace-row[hidden]) {
    display: none;
  }
</style>
