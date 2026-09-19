<script lang="ts">
  import { onMount } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import TabBar from "./TabBar.svelte";
  import type { Tab } from "$lib/workspace.svelte";

  let {
    tabs,
    activeId,
    onselect,
    onclose,
    onnew,
  }: {
    tabs: Tab[];
    activeId: string | null;
    onselect: (id: string) => void;
    onclose: (id: string) => void;
    onnew: () => void;
  } = $props();

  const appWindow = getCurrentWindow();

  // 最大化中は「最大化」ではなく「元に戻す」アイコン(重なった四角)を出す
  let isMaximized = $state(false);

  onMount(() => {
    appWindow.isMaximized().then((value) => (isMaximized = value));
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then((value) => (isMaximized = value));
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  });
</script>

<!-- Windows / Linux 用のタイトルバー。ウィンドウ操作はこの OS の作法(右側に
     最小化/最大化/閉じる)に合わせ、macOS のトラフィックライトは使わない。 -->
<header class="titlebar" data-tauri-drag-region>
  <div class="brand" data-tauri-drag-region>
    <img class="icon" src="/app-icon.png" alt="" aria-hidden="true" />
    <span class="name">textmori</span>
  </div>

  <TabBar {tabs} {activeId} {onselect} {onclose} {onnew} />

  <!-- タブの右側の余白はウィンドウのドラッグ領域にする -->
  <div class="drag" data-tauri-drag-region></div>

  <div class="controls">
    <button
      type="button"
      class="control"
      aria-label="最小化"
      onclick={() => appWindow.minimize()}
    >
      &#xE921;
    </button>
    <button
      type="button"
      class="control"
      aria-label={isMaximized ? "元に戻す" : "最大化"}
      onclick={() => appWindow.toggleMaximize()}
    >
      {#if isMaximized}&#xE923;{:else}&#xE922;{/if}
    </button>
    <button
      type="button"
      class="control close"
      aria-label="閉じる"
      onclick={() => appWindow.close()}
    >
      &#xE8BB;
    </button>
  </div>
</header>

<style>
  .titlebar {
    display: flex;
    align-items: stretch;
    background: var(--tabbar-bg);
    border-bottom: 1px solid var(--border);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.4em;
    padding: 0 0.6em 0 0.7em;
    color: var(--fg);
    font-size: 0.82rem;
    font-weight: 600;
    user-select: none;
  }

  .brand .icon {
    width: 1rem;
    height: 1rem;
    display: block;
  }

  .drag {
    flex: 1;
    min-width: 1rem;
  }

  /* Windows 標準のタイトルバーと同じく、ボタンは隙間なく等幅で並べる */
  .controls {
    display: flex;
    align-items: stretch;
  }

  .control {
    width: 2.875rem; /* Windows 標準の 46px 相当 */
    border: 0;
    background: none;
    color: var(--fg);
    /* ウィンドウ操作アイコン専用のフォント指定。他の文字に影響しないよう
       UI フォント(--font-ui)とは切り離し、アイコンフォントだけを使う。 */
    font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets";
    font-size: 0.625rem; /* Windows 標準の 10px 相当 */
    font-weight: 100;
    line-height: 1;
    cursor: pointer;
    /* OS 標準のウィンドウ操作ボタンと同じく、ホバーは即時に切り替える */
    transition: none;
  }

  .control:hover {
    background: var(--hover);
  }

  .control.close:hover {
    background: #c42b1c;
    color: #fff;
  }
</style>
