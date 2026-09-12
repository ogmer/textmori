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

<header class="titlebar" data-tauri-drag-region>
  <!-- macOS のトラフィックライトを模した信号(赤=閉じる/黄=最小化/緑=最大化) -->
  <div class="traffic-lights">
    <button
      type="button"
      class="light close"
      aria-label="閉じる"
      onclick={() => appWindow.close()}
    >
      <svg viewBox="0 0 10 10" aria-hidden="true"
        ><path d="M2.2 2.2 L7.8 7.8 M7.8 2.2 L2.2 7.8" /></svg
      >
    </button>
    <button
      type="button"
      class="light minimize"
      aria-label="最小化"
      onclick={() => appWindow.minimize()}
    >
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5 H8" /></svg>
    </button>
    <button
      type="button"
      class="light maximize"
      aria-label="最大化"
      onclick={() => appWindow.toggleMaximize()}
    >
      <svg viewBox="0 0 10 10" aria-hidden="true"
        ><path d="M2.5 2.5 H7.5 V7.5 H2.5 Z" /></svg
      >
    </button>
  </div>

  <TabBar {tabs} {activeId} {onselect} {onclose} {onnew} />

  <!-- タブの右側の余白はウィンドウのドラッグ領域にする -->
  <div class="drag" data-tauri-drag-region></div>
</header>

<style>
  .titlebar {
    display: flex;
    align-items: stretch;
    background: var(--tabbar-bg);
    border-bottom: 1px solid var(--border);
  }

  .traffic-lights {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0 0.55em 0 0.7em;
  }

  .light {
    width: 0.78em;
    height: 0.78em;
    padding: 0;
    border: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .light svg {
    width: 60%;
    height: 60%;
    stroke: rgba(0, 0, 0, 0.55);
    stroke-width: 1.4;
    fill: none;
    opacity: 0;
  }

  .traffic-lights:hover svg,
  .light:focus-visible svg {
    opacity: 1;
  }

  .light.close {
    background: #ff5f57;
  }

  .light.minimize {
    background: #febc2e;
  }

  .light.maximize {
    background: #28c840;
  }

  .light.close svg {
    fill: rgba(0, 0, 0, 0.55);
  }

  .drag {
    flex: 1;
    min-width: 1rem;
  }
</style>
