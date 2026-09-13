<script lang="ts">
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
      aria-label="最大化"
      onclick={() => appWindow.toggleMaximize()}
    >
      &#xE922;
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

  .controls {
    display: flex;
    align-items: stretch;
  }

  .control {
    width: 2.9rem;
    border: 0;
    background: none;
    color: var(--fg);
    /* Windows のウィンドウ操作アイコン用フォント。無い環境では通常フォントで代替される */
    font-family: "Segoe Fluent Icons", "Segoe MDL2 Assets", var(--font-ui);
    font-size: 0.62rem;
    line-height: 1;
    cursor: pointer;
  }

  .control:hover {
    background: var(--hover);
  }

  .control.close:hover {
    background: #c42b1c;
    color: #fff;
  }
</style>
